const express = require("express");
const {
  parseDate,
  formatDate,
  formatDateInput,
  addYears,
  buildDisplayName,
  classifyOperationalCat,
} = require("../utils/cattery-admin");

const CATEGORY_META = [
  { key: "sires", label: "Padreadores", color: "#2563eb" },
  { key: "dams", label: "Matrizes", color: "#db2777" },
  { key: "kittens", label: "Filhotes", color: "#16a34a" },
  { key: "founders", label: "Fundadores", color: "#f59e0b" },
];

const SourceOptions = ["Antecedente", "Próprio", "Realizar"];
const PkdefResults = ["N/N", "N/K"];
const PrabfResults = ["N/N", "N/PRA"];

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
      date: formatDateInput(value.date),
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

function computeNextEco(birthDate, history) {
  const sorted = sortHistory(history).filter((item) => parseDate(item.date));
  const birth = parseDate(birthDate);

  if (!sorted.length) {
    return birth ? addYears(birth, 1) : null;
  }

  const last = parseDate(sorted[sorted.length - 1].date);
  return last ? addYears(last, 1) : null;
}

function isUrgentRow(pkdefSource, prabfSource, nextEco) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (pkdefSource === "Realizar" || prabfSource === "Realizar") {
    return true;
  }

  return Boolean(nextEco && nextEco < today);
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  router.get(
    "/admin/exams",
    requireAuth,
    requirePermission("admin.exams"),
    async (req, res) => {
      const cats = await prisma.cat.findMany({
        include: {
          examPlan: true,
        },
        orderBy: { name: "asc" },
      });

      const grouped = Object.fromEntries(
        CATEGORY_META.map((category) => [category.key, []])
      );

      cats.forEach((cat) => {
        const category = classifyOperationalCat(cat, {
          includeDeliveredKittensInHistory: false,
        });
        if (!category) return;

        const ecoHistory = safeJsonParse(cat.examPlan?.ecoHistoryJson, [
          { date: "" },
        ]);
        const nextEco = computeNextEco(cat.birthDate, ecoHistory);
        const pkdefSource = cat.examPlan?.pkdefSource || "";
        const pkdefResult = cat.examPlan?.pkdefResult || "";
        const prabfSource = cat.examPlan?.prabfSource || "";
        const prabfResult = cat.examPlan?.prabfResult || "";
        const urgent = isUrgentRow(pkdefSource, prabfSource, nextEco);

        grouped[category].push({
          cat,
          displayName: buildDisplayName(cat),
          birthDateLabel: formatDate(cat.birthDate) || "-",
          pkdefSource,
          pkdefResult,
          prabfSource,
          prabfResult,
          ecoHistory,
          nextEco,
          urgent,
        });
      });

      Object.values(grouped).forEach((rows) => {
        rows.sort((a, b) => {
          if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;

          const aNext = a.nextEco || new Date(8640000000000000);
          const bNext = b.nextEco || new Date(8640000000000000);
          return aNext - bNext;
        });
      });

      res.render("admin-exams/index", {
        user: req.user,
        currentPath: req.path,
        categories: CATEGORY_META,
        grouped,
        sourceOptions: SourceOptions,
        pkdefResults: PkdefResults,
        prabfResults: PrabfResults,
        formatDate,
      });
    }
  );

  router.post(
    "/admin/exams/:catId",
    requireAuth,
    requirePermission("admin.exams"),
    async (req, res) => {
      const catId = Number(req.params.catId);
      const ecoDates = [].concat(req.body.ecoDates || []);

      const ecoHistory = ecoDates
        .map((date) => ({ date: formatDateInput(date) }))
        .filter((item) => item.date !== "");

      await prisma.examPlan.upsert({
        where: { catId },
        create: {
          catId,
          pkdefSource: req.body.pkdefSource || null,
          pkdefResult: req.body.pkdefResult || null,
          prabfSource: req.body.prabfSource || null,
          prabfResult: req.body.prabfResult || null,
          ecoHistoryJson: JSON.stringify(ecoHistory),
        },
        update: {
          pkdefSource: req.body.pkdefSource || null,
          pkdefResult: req.body.pkdefResult || null,
          prabfSource: req.body.prabfSource || null,
          prabfResult: req.body.prabfResult || null,
          ecoHistoryJson: JSON.stringify(ecoHistory),
        },
      });

      if (req.get("X-Autosave") === "true") {
        return res.sendStatus(204);
      }

      res.redirect("/admin/exams");
    }
  );

  return router;
};
