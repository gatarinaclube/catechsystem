const express = require("express");
const { dataOwnerScope } = require("../utils/access");
const {
  addDays,
  parseDate,
  formatDate,
  formatDateInput,
  buildDisplayName,
  classifyOperationalCat,
  isRoutineModuleCatVisible,
} = require("../utils/cattery-admin");
const {
  computeNextAntirabic,
  computeNextFeline,
  safeJsonParse,
} = require("../utils/vaccines");

const CATEGORY_META = [
  { key: "sires", label: "Padreadores", color: "#2563eb" },
  { key: "dams", label: "Matrizes", color: "#db2777" },
  { key: "kittens", label: "Filhotes", color: "#16a34a" },
  { key: "founders", label: "Fundadores", color: "#f59e0b" },
];

const FelineTypes = ["Feline IV", "Feline V", "IV + FeLV"];

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

function buildVaccinationSummary(nextAntirabic, nextFeline, vaccinationState) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingLimit = addDays(today, 15);

  if (vaccinationState === "overdue") {
    const overdue = [
      nextAntirabic && nextAntirabic < today ? "Antirrábica" : null,
      nextFeline && nextFeline < today ? "Feline" : null,
    ].filter(Boolean);

    return overdue.length > 1
      ? `Vencidas: ${overdue.join(" e ")}`
      : `Vencida: ${overdue[0] || "vacinação"}`;
  }

  if (vaccinationState === "upcoming") {
    const upcoming = [
      nextAntirabic && nextAntirabic <= upcomingLimit ? "Antirrábica" : null,
      nextFeline && nextFeline <= upcomingLimit ? "Feline" : null,
    ].filter(Boolean);

    return upcoming.length > 1
      ? `Próximas: ${upcoming.join(" e ")}`
      : `Próxima: ${upcoming[0] || "vacinação"}`;
  }

  return "Em dia";
}

function isPastDate(date) {
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

function buildNextActions(grouped) {
  return Object.values(grouped)
    .flat()
    .filter((row) => row.vaccinationState === "overdue" || row.vaccinationState === "upcoming")
    .map((row) => {
      const dates = [
        row.nextAntirabic ? { label: "Antirrábica", date: row.nextAntirabic } : null,
        row.nextFeline ? { label: "Feline", date: row.nextFeline } : null,
      ].filter(Boolean).sort((a, b) => a.date - b.date);
      const next = dates[0];
      const dateSummary = dates.map((item) => `${item.label}: ${formatDate(item.date)}`).join(" · ");

      return {
        title: row.displayName,
        sub: row.vaccinationSummary
          ? `${row.vaccinationSummary}${dateSummary ? ` · ${dateSummary}` : ""}`
          : next
            ? `${next.label}: ${formatDate(next.date)}`
            : "Vacinação pendente",
        badge: row.vaccinationState === "overdue" ? "Vencida" : "Próxima",
        color: row.vaccinationState === "overdue" ? "is-red" : "is-yellow",
        orderDate: next?.date || new Date(8640000000000000),
      };
    })
    .sort((a, b) => a.orderDate - b.orderDate)
    .slice(0, 8);
}

function normalizeCompleteDateInput(value) {
  const text = String(value || "").trim();
  if (!/^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})$/.test(text)) return "";
  return formatDateInput(text);
}

function hasOtherOwner(cat) {
  return (
    cat?.ownershipType === "CO-OWNERSHIP" ||
    cat?.ownershipType === "OTHER" ||
    Boolean(cat?.currentOwnerClientId) ||
    (Boolean(cat?.currentOwnerId) && cat.currentOwnerId !== cat.ownerId)
  );
}

function isBreederHiddenFromVaccination(cat) {
  const isKittenRecord = Boolean(cat?.kittenNumber || cat?.litterKitten);
  const isBreederRecord = !isKittenRecord && (cat?.gender === "M" || cat?.gender === "F");
  return isBreederRecord && cat?.neutered === true && hasOtherOwner(cat);
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  function ownerScope(req) {
    return dataOwnerScope(req);
  }

  async function ensureCatAccess(req, catId) {
    const cat = await prisma.cat.findFirst({
      where: { id: catId, ...ownerScope(req) },
      select: { id: true },
    });
    return Boolean(cat);
  }

  async function vaccinationResponseData(req, catId, antirabicHistory, felineHistory) {
    const cat = await prisma.cat.findFirst({
      where: { id: catId, ...ownerScope(req) },
      include: {
        owner: { include: { settings: true } },
      },
    });
    const nextAntirabic = computeNextAntirabic(cat?.birthDate, antirabicHistory, cat?.owner?.settings);
    const nextFeline = computeNextFeline(cat?.birthDate, felineHistory, cat?.owner?.settings);
    const vaccinationState = getVaccinationState(nextAntirabic, nextFeline);
    const vaccinationSummary = buildVaccinationSummary(nextAntirabic, nextFeline, vaccinationState);

    return {
      ok: true,
      vaccinationState,
      vaccinationSummary,
      stateLabel: vaccinationState === "overdue"
        ? "Vencida"
        : vaccinationState === "upcoming"
          ? "Próxima"
          : "Em dia",
      pillClass: vaccinationState === "overdue"
        ? "is-red"
        : vaccinationState === "upcoming"
          ? "is-yellow"
          : "is-green",
      nextAntirabicLabel: nextAntirabic ? formatDate(nextAntirabic) : "-",
      nextFelineLabel: nextFeline ? formatDate(nextFeline) : "-",
      nextAntirabicOverdue: isPastDate(nextAntirabic),
      nextFelineOverdue: isPastDate(nextFeline),
    };
  }

  router.get(
    "/admin/vaccinations",
    requireAuth,
    requirePermission("admin.vaccinations"),
    async (req, res) => {
      const cats = await prisma.cat.findMany({
        where: ownerScope(req),
        include: {
          mother: true,
          owner: { include: { settings: true } },
          litterKitten: { include: { litter: true } },
          vaccinationPlan: true,
        },
        orderBy: { name: "asc" },
      });

      const grouped = Object.fromEntries(
        CATEGORY_META.map((category) => [category.key, []])
      );

      cats.forEach((cat) => {
        if (!isRoutineModuleCatVisible(cat)) return;
        if (isBreederHiddenFromVaccination(cat)) return;
        const category = classifyOperationalCat(cat);
        if (!category) return;

        const antirabicHistory = safeJsonParse(
          cat.vaccinationPlan?.antirabicHistoryJson,
          [{ date: "" }]
        );
        const felineHistory = safeJsonParse(
          cat.vaccinationPlan?.felineHistoryJson,
          [{ date: "", type: "" }]
        );

        const nextAntirabic = computeNextAntirabic(cat.birthDate, antirabicHistory, cat.owner?.settings);
        const nextFeline = computeNextFeline(cat.birthDate, felineHistory, cat.owner?.settings);
        const vaccinationState = getVaccinationState(nextAntirabic, nextFeline);
        const vaccinationSummary = buildVaccinationSummary(nextAntirabic, nextFeline, vaccinationState);

        grouped[category].push({
          cat,
          cleanName: cat.name || buildDisplayName(cat),
          displayName: buildDisplayName(cat),
          motherName: cat.mother?.name || cat.motherName || "-",
          birthDateLabel: formatDate(cat.birthDate) || "-",
          antirabicHistory,
          felineHistory,
          nextAntirabic,
          nextFeline,
          vaccinationState,
          vaccinationSummary,
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
        nextActions: buildNextActions(grouped),
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
      if (!(await ensureCatAccess(req, catId))) {
        return res.status(403).send("Você não tem acesso a este gato.");
      }

      const antirabicHistory = []
        .concat(req.body.antirabicDates || [])
        .map((date) => ({ date: normalizeCompleteDateInput(date) }))
        .filter((item) => item.date !== "");

      const felineDates = [].concat(req.body.felineDates || []);
      const felineTypes = [].concat(req.body.felineTypes || []);
      const felineHistory = felineDates
        .map((date, index) => ({
          date: normalizeCompleteDateInput(date),
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

      if (req.get("X-Autosave") === "true" || req.get("X-Manual-Update") === "true" || req.accepts("json")) {
        return res.json(await vaccinationResponseData(req, catId, antirabicHistory, felineHistory));
      }

      res.redirect("/admin/vaccinations");
    }
  );

  return router;
};
