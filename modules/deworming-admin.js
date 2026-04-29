const express = require("express");

const CATEGORY_META = [
  { key: "sires", label: "Padreadores", color: "#2563eb" },
  { key: "dams", label: "Matrizes", color: "#db2777" },
  { key: "kittens", label: "Filhotes", color: "#16a34a" },
  { key: "founders", label: "Fundadores", color: "#f59e0b" },
];

const DewormingTypes = [
  "Panacur",
  "VetMax Plus",
  "Febendazol",
  "Secnidazol",
];

function parseDate(value) {
  if (!value || value === "0000-00-00") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value) {
  const parsed = parseDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : "";
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function ageInMonths(birthDate) {
  const birth = parseDate(birthDate);
  if (!birth) return 0;

  const now = new Date();
  let months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());

  if (now.getDate() < birth.getDate()) months -= 1;
  return Math.max(0, months);
}

function safeJsonParse(value, fallback = []) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function sortHistory(history) {
  return [...history]
    .map((value) => ({
      ...value,
      date: formatDate(value.date),
    }))
    .sort((a, b) => {
      const aDate = parseDate(a.date);
      const bDate = parseDate(b.date);
      if (!aDate && !bDate) return 0;
      if (!aDate) return -1;
      if (!bDate) return 1;
      return aDate - bDate;
    });
}

function computeNextDeworming(birthDate, history) {
  const sorted = sortHistory(history).filter((item) => parseDate(item.date));
  const birth = parseDate(birthDate);

  if (!sorted.length) {
    return birth ? addDays(birth, 30) : null;
  }

  if (sorted.length === 1) {
    const first = parseDate(sorted[0].date);
    return first ? addDays(first, 15) : null;
  }

  const last = parseDate(sorted[sorted.length - 1].date);
  return last ? addDays(last, 30) : null;
}

function getDewormingState(nextDeworming) {
  if (!nextDeworming) return "dewormed";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return nextDeworming < today ? "overdue" : "dewormed";
}

function buildDisplayName(cat) {
  return [
    cat.titleBeforeName,
    cat.country ? `${cat.country}*` : null,
    cat.name,
    cat.titleAfterName,
  ]
    .filter(Boolean)
    .join(" ");
}

function classifyCat(cat) {
  const months = ageInMonths(cat.birthDate);
  const ownerIsSelf = !cat.currentOwnerId || cat.currentOwnerId === cat.ownerId;

  if (cat.kittenNumber) {
    if (!cat.delivered) {
      if (months > 4 && ownerIsSelf) {
        return cat.gender === "M" ? "sires" : "dams";
      }
      return "kittens";
    }
    return null;
  }

  if (cat.deceased) return null;
  if (!ownerIsSelf && cat.ownershipType === "CO-OWNERSHIP") return null;

  if (cat.neutered === true) {
    return "founders";
  }

  if (cat.gender === "M") return "sires";
  if (cat.gender === "F") return "dams";
  return null;
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  router.get(
    "/admin/deworming",
    requireAuth,
    requirePermission("admin.deworming"),
    async (req, res) => {
      const cats = await prisma.cat.findMany({
        include: {
          mother: true,
          dewormingPlan: true,
        },
        orderBy: { name: "asc" },
      });

      const grouped = Object.fromEntries(
        CATEGORY_META.map((category) => [category.key, []])
      );

      cats.forEach((cat) => {
        const category = classifyCat(cat);
        if (!category) return;

        const history = safeJsonParse(cat.dewormingPlan?.historyJson, [
          { date: "", type: "" },
        ]);

        const nextDeworming = computeNextDeworming(cat.birthDate, history);
        const dewormingState = getDewormingState(nextDeworming);

        grouped[category].push({
          cat,
          displayName: buildDisplayName(cat),
          motherName: cat.mother?.name || cat.motherName || "-",
          birthDateLabel: formatDate(cat.birthDate) || "-",
          history,
          nextDeworming,
          dewormingState,
        });
      });

      const rank = { overdue: 0, dewormed: 1 };
      Object.values(grouped).forEach((rows) => {
        rows.sort((a, b) => {
          const stateOrder = rank[a.dewormingState] - rank[b.dewormingState];
          if (stateOrder !== 0) return stateOrder;

          const aNext = a.nextDeworming || new Date(8640000000000000);
          const bNext = b.nextDeworming || new Date(8640000000000000);
          return aNext - bNext;
        });
      });

      res.render("admin-deworming/index", {
        user: req.user,
        currentPath: req.path,
        categories: CATEGORY_META,
        grouped,
        dewormingTypes: DewormingTypes,
        formatDate,
      });
    }
  );

  router.post(
    "/admin/deworming/:catId",
    requireAuth,
    requirePermission("admin.deworming"),
    async (req, res) => {
      const catId = Number(req.params.catId);
      const dates = [].concat(req.body.historyDates || []);
      const types = [].concat(req.body.historyTypes || []);

      const history = dates
        .map((date, index) => ({
          date: formatDate(date),
          type: types[index] || "",
        }))
        .filter((item) => item.date !== "" || item.type !== "");

      await prisma.dewormingPlan.upsert({
        where: { catId },
        create: {
          catId,
          historyJson: JSON.stringify(history),
        },
        update: {
          historyJson: JSON.stringify(history),
        },
      });

      res.redirect("/admin/deworming");
    }
  );

  return router;
};
