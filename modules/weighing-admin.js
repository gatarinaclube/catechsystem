const express = require("express");
const {
  parseDate,
  formatDate,
  ageInMonths,
  buildDisplayName,
  classifyOperationalCat,
} = require("../utils/cattery-admin");

const CATEGORY_META = [
  { key: "sires", label: "Padreadores", color: "#2563eb" },
  { key: "dams", label: "Matrizes", color: "#db2777" },
  { key: "kittens", label: "Filhotes", color: "#16a34a" },
  { key: "founders", label: "Fundadores", color: "#f59e0b" },
];

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
        const category = classifyOperationalCat(cat);
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
