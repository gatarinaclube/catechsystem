const express = require("express");
const { canViewAllData } = require("../utils/access");
const {
  parseDate,
  formatDate,
  formatDateInput,
  addDays,
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

const DewormingTypes = ["Panacur", "VetMax Plus", "Febendazol", "Secnidazol"];

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

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  function ownerScope(req) {
    return canViewAllData(req.session?.userRole) ? {} : { ownerId: req.session.userId };
  }

  async function ensureCatAccess(req, catId) {
    const cat = await prisma.cat.findFirst({
      where: { id: catId, ...ownerScope(req) },
      select: { id: true },
    });
    return Boolean(cat);
  }

  router.get(
    "/admin/deworming",
    requireAuth,
    requirePermission("admin.deworming"),
    async (req, res) => {
      const cats = await prisma.cat.findMany({
        where: ownerScope(req),
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
        const category = classifyOperationalCat(cat);
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
      if (!(await ensureCatAccess(req, catId))) {
        return res.status(403).send("Você não tem acesso a este gato.");
      }
      const dates = [].concat(req.body.historyDates || []);
      const types = [].concat(req.body.historyTypes || []);

      const history = dates
        .map((date, index) => ({
          date: formatDateInput(date),
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

      if (req.get("X-Autosave") === "true") {
        return res.sendStatus(204);
      }

      res.redirect("/admin/deworming");
    }
  );

  return router;
};
