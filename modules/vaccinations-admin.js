const express = require("express");

const CATEGORY_META = [
  { key: "sires", label: "Padreadores", color: "#2563eb" },
  { key: "dams", label: "Matrizes", color: "#db2777" },
  { key: "kittens", label: "Filhotes", color: "#16a34a" },
  { key: "founders", label: "Fundadores", color: "#f59e0b" },
];

const FelineTypes = ["Feline IV", "Feline V", "IV + FeLV"];

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

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function addYears(date, years) {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

function ageInMonths(birthDate) {
  const birth = parseDate(birthDate);
  if (!birth) return 0;
  const now = new Date();
  let months =
    (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
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

function sortHistoryDates(history) {
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

function computeNextAntirabic(birthDate, history) {
  const sorted = sortHistoryDates(history).filter((item) => parseDate(item.date));
  const birth = parseDate(birthDate);

  if (!sorted.length) {
    return birth ? addMonths(birth, 3) : null;
  }

  const last = parseDate(sorted[sorted.length - 1].date);
  return last ? addDays(addYears(last, 1), -1) : null;
}

function computeNextFeline(birthDate, history) {
  const sorted = sortHistoryDates(history).filter((item) => parseDate(item.date));
  const birth = parseDate(birthDate);

  if (!sorted.length) {
    return birth ? addDays(addMonths(birth, 2), 0) : null;
  }

  if (sorted.length === 1) {
    const first = parseDate(sorted[0].date);
    return first ? addDays(first, 21) : null;
  }

  const last = parseDate(sorted[sorted.length - 1].date);
  return last ? addDays(addYears(last, 1), -1) : null;
}

function getVaccinationState(nextAntirabic, nextFeline) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingLimit = addDays(today, 15);
  const dates = [nextAntirabic, nextFeline].filter(Boolean);

  if (!dates.length) return "vaccinated";

  if (dates.some((date) => date < today)) return "overdue";
  if (dates.some((date) => date <= upcomingLimit)) return "upcoming";
  return "vaccinated";
}

function buildDisplayName(cat) {
  return [
    cat.titleBeforeName,
    cat.country ? `${cat.country}*` : null,
    cat.name,
    cat.titleAfterName,
  ].filter(Boolean).join(" ");
}

function classifyCat(cat) {
  const months = ageInMonths(cat.birthDate);
  const ownerIsSelf =
    !cat.currentOwnerId || cat.currentOwnerId === cat.ownerId;

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
    "/admin/vaccinations",
    requireAuth,
    requirePermission("admin.vaccinations"),
    async (req, res) => {
      const cats = await prisma.cat.findMany({
        include: {
          mother: true,
          vaccinationPlan: true,
        },
        orderBy: { name: "asc" },
      });

      const grouped = Object.fromEntries(
        CATEGORY_META.map((category) => [category.key, []])
      );

      cats.forEach((cat) => {
        const category = classifyCat(cat);
        if (!category) return;

        const antirabicHistory = safeJsonParse(
          cat.vaccinationPlan?.antirabicHistoryJson,
          [{ date: "" }]
        );
        const felineHistory = safeJsonParse(
          cat.vaccinationPlan?.felineHistoryJson,
          [{ date: "", type: "" }]
        );

        const nextAntirabic = computeNextAntirabic(cat.birthDate, antirabicHistory);
        const nextFeline = computeNextFeline(cat.birthDate, felineHistory);
        const vaccinationState = getVaccinationState(nextAntirabic, nextFeline);

        grouped[category].push({
          cat,
          displayName: buildDisplayName(cat),
          motherName: cat.mother?.name || cat.motherName || "-",
          birthDateLabel: formatDate(cat.birthDate) || "-",
          antirabicHistory,
          felineHistory,
          nextAntirabic,
          nextFeline,
          vaccinationState,
        });
      });

      const rank = { overdue: 0, upcoming: 1, vaccinated: 2 };
      Object.values(grouped).forEach((rows) => {
        rows.sort((a, b) => {
          const stateOrder = rank[a.vaccinationState] - rank[b.vaccinationState];
          if (stateOrder !== 0) return stateOrder;

          const aNext = a.nextAntirabic || a.nextFeline || new Date(8640000000000000);
          const bNext = b.nextAntirabic || b.nextFeline || new Date(8640000000000000);
          return aNext - bNext;
        });
      });

      res.render("admin-vaccinations/index", {
        user: req.user,
        currentPath: req.path,
        categories: CATEGORY_META,
        grouped,
        felineTypes: FelineTypes,
        formatDate,
      });
    }
  );

  router.post(
    "/admin/vaccinations/:catId",
    requireAuth,
    requirePermission("admin.vaccinations"),
    async (req, res) => {
      const catId = Number(req.params.catId);

      const antirabicHistory = []
        .concat(req.body.antirabicDates || [])
        .map((date) => ({ date: formatDate(date) }))
        .filter((item) => item.date !== "");

      const felineDates = [].concat(req.body.felineDates || []);
      const felineTypes = [].concat(req.body.felineTypes || []);
      const felineHistory = felineDates
        .map((date, index) => ({
          date: formatDate(date),
          type: felineTypes[index] || "",
        }))
        .filter((item) => item.date !== "" || item.type !== "");

      await prisma.vaccinationPlan.upsert({
        where: { catId },
        create: {
          catId,
          antirabicHistoryJson: JSON.stringify(antirabicHistory),
          felineHistoryJson: JSON.stringify(felineHistory),
        },
        update: {
          antirabicHistoryJson: JSON.stringify(antirabicHistory),
          felineHistoryJson: JSON.stringify(felineHistory),
        },
      });

      res.redirect("/admin/vaccinations");
    }
  );

  return router;
};
