const express = require("express");

const CATEGORY_META = [
  { key: "sires", label: "Padreadores", color: "#2563eb" },
  { key: "dams", label: "Matrizes", color: "#db2777" },
  { key: "kittens", label: "Filhotes", color: "#16a34a" },
  { key: "founders", label: "Fundadores", color: "#f59e0b" },
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

function normalizeWeight(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().replace(/[^\d,.-]/g, "").replace(".", ",");
  if (!trimmed) return "";

  const number = Number(trimmed.replace(",", "."));
  if (Number.isNaN(number)) return "";
  return number.toFixed(3).replace(".", ",");
}

function parseWeight(value) {
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isNaN(parsed) ? null : parsed;
}

function formatWeight(number) {
  if (typeof number !== "number" || Number.isNaN(number)) return "-";
  return `${number.toFixed(3).replace(".", ",")} kg`;
}

function sortHistory(history) {
  return [...history]
    .map((value) => ({
      ...value,
      date: formatDate(value.date),
      weight: normalizeWeight(value.weight || ""),
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

function computeHistoryStats(history) {
  const validEntries = sortHistory(history).filter(
    (item) => parseDate(item.date) && parseWeight(item.weight) !== null
  );

  if (!validEntries.length) {
    return { gp: null, gpStar: null };
  }

  const firstWeight = parseWeight(validEntries[0].weight);
  const lastWeight = parseWeight(validEntries[validEntries.length - 1].weight);

  let gp = null;
  let gpStar = null;

  if (firstWeight !== null && lastWeight !== null) {
    gp = lastWeight - firstWeight;
  }

  if (validEntries.length >= 2) {
    const previousWeight = parseWeight(
      validEntries[validEntries.length - 2].weight
    );
    if (previousWeight !== null && lastWeight !== null) {
      gpStar = lastWeight - previousWeight;
    }
  }

  return { gp, gpStar };
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  router.get(
    "/admin/weighing",
    requireAuth,
    requirePermission("admin.weighing"),
    async (req, res) => {
      const cats = await prisma.cat.findMany({
        include: {
          mother: true,
          weighingPlan: true,
        },
        orderBy: { name: "asc" },
      });

      const grouped = Object.fromEntries(
        CATEGORY_META.map((category) => [category.key, []])
      );

      cats.forEach((cat) => {
        const category = classifyCat(cat);
        if (!category) return;

        const history = safeJsonParse(cat.weighingPlan?.historyJson, [
          { date: "", weight: "" },
        ]);

        grouped[category].push({
          cat,
          displayName: buildDisplayName(cat),
          motherName: cat.mother?.name || cat.motherName || "-",
          birthDateLabel: formatDate(cat.birthDate) || "-",
          history,
          stats: computeHistoryStats(history),
        });
      });

      res.render("admin-weighing/index", {
        user: req.user,
        currentPath: req.path,
        categories: CATEGORY_META,
        grouped,
        formatWeight,
      });
    }
  );

  router.post(
    "/admin/weighing/:catId",
    requireAuth,
    requirePermission("admin.weighing"),
    async (req, res) => {
      const catId = Number(req.params.catId);
      const dates = [].concat(req.body.historyDates || []);
      const weights = [].concat(req.body.historyWeights || []);

      const history = dates
        .map((date, index) => ({
          date: formatDate(date),
          weight: normalizeWeight(weights[index] || ""),
        }))
        .filter((item) => item.date !== "" || item.weight !== "");

      await prisma.weighingPlan.upsert({
        where: { catId },
        create: {
          catId,
          historyJson: JSON.stringify(history),
        },
        update: {
          historyJson: JSON.stringify(history),
        },
      });

      res.redirect("/admin/weighing");
    }
  );

  return router;
};
