const crypto = require("crypto");
const express = require("express");
const {
  addDays,
  addMonths,
  addYears,
  ageInMonths,
  buildDisplayName,
  classifyOperationalCat,
  formatDate,
  formatDateInput,
  isRoutineModuleCatVisible,
  parseDate,
} = require("../utils/cattery-admin");
const { userCan } = require("../utils/access");
const {
  examKittensTabEnabledFromSettings,
  selectedExamsFromSettings,
} = require("../utils/userPreferences");
const vaccineUtils = require("../utils/vaccines");

function safeJsonParse(value, fallback = []) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function sortHistoryDates(history) {
  return [...history]
    .map((item) => ({ ...item, date: formatDateInput(item.date) }))
    .filter((item) => parseDate(item.date))
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));
}

function computeNextAntirabic(birthDate, history) {
  const sorted = sortHistoryDates(history);
  const birth = parseDate(birthDate);
  if (!sorted.length) return birth ? addMonths(birth, 3) : null;
  const last = parseDate(sorted[sorted.length - 1].date);
  return last ? addDays(addYears(last, 1), -1) : null;
}

function computeNextFeline(birthDate, history) {
  const sorted = sortHistoryDates(history);
  const birth = parseDate(birthDate);
  if (!sorted.length) return birth ? addMonths(birth, 2) : null;
  if (sorted.length === 1) {
    const first = parseDate(sorted[0].date);
    return first ? addDays(first, 21) : null;
  }
  const last = parseDate(sorted[sorted.length - 1].date);
  return last ? addDays(addYears(last, 1), -1) : null;
}

function computeNextEco(birthDate, history) {
  const sorted = sortHistoryDates(history);
  const birth = parseDate(birthDate);
  if (!sorted.length) return birth ? addYears(birth, 1) : null;
  const last = parseDate(sorted[sorted.length - 1].date);
  return last ? addMonths(last, 18) : null;
}

function laterDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function computeNextCrossDate(femaleBirthDate, litterHistoryDates) {
  const dates = litterHistoryDates
    .map(parseDate)
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (!dates.length) {
    const birth = parseDate(femaleBirthDate);
    return birth ? addDays(addMonths(birth, 10), 15) : null;
  }

  if (dates.length === 1) return addMonths(dates[0], 4);

  const recent = dates.slice(-3);
  if (recent.length === 2) {
    const [first, second] = recent;
    return laterDate(addMonths(second, 4), addMonths(first, 10));
  }

  const [first, , third] = recent;
  return laterDate(addMonths(third, 4), addMonths(first, 22));
}

function dateStatus(date, today = startOfToday()) {
  if (!date) return { label: "Sem data", tone: "muted", days: null };
  const diffDays = Math.ceil((date - today) / 86400000);
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d vencido`, tone: "danger", days: diffDays };
  if (diffDays === 0) return { label: "Hoje", tone: "danger", days: 0 };
  return { label: `${diffDays}d`, tone: diffDays <= 7 ? "warning" : "ok", days: diffDays };
}

function isActiveMedication(item, today = startOfToday()) {
  if (!item?.medication) return false;

  const start = parseDate(item.startDate);
  const end = parseDate(item.endDate);
  const discharge = parseDate(item.dischargeDate);
  const finalDate = discharge || end;

  if (start && start > today) return false;
  if (finalDate && finalDate < today) return false;
  return true;
}

function isFemaleAvailable(female) {
  if (female.gender !== "F") return false;
  if (female.deceased === true || female.neutered === true || female.delivered === true) return false;
  if ((female.kittenNumber || female.litterKitten) && female.breedingProspect !== true) return false;
  return ageInMonths(female.birthDate) >= 10;
}

function isKittenRecord(cat) {
  return Boolean(cat.kittenNumber || cat.litterKitten);
}

function isDeceased(cat) {
  return cat.deceased === true || cat.kittenAvailabilityStatus === "DECEASED";
}

function isDeliveredOrSold(cat) {
  return cat.delivered === true ||
    cat.sold === true ||
    cat.kittenAvailabilityStatus === "DELIVERED" ||
    cat.kittenAvailabilityStatus === "RESERVED";
}

function isMonitoredCat(cat) {
  if (isDeceased(cat)) return false;
  if (isKittenRecord(cat)) return !isDeliveredOrSold(cat);
  return true;
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
  const kittenRecord = isKittenRecord(cat);
  const breederRecord = !kittenRecord && (cat?.gender === "M" || cat?.gender === "F");
  return breederRecord && cat?.neutered === true && hasOtherOwner(cat);
}

function isVisibleInVaccinationPanel(cat) {
  return isRoutineModuleCatVisible(cat) && !isBreederHiddenFromVaccination(cat);
}

function medicationDateKey(value) {
  return formatDateInput(value) || "";
}

function groupMedicationsByPeriod(medications) {
  const groups = new Map();

  medications.forEach((item) => {
    const key = [
      item.medication || "",
      item.dosage || "",
      item.schedule || "",
      item.startDate || "",
      item.endDate || "",
    ].join("|");

    if (!groups.has(key)) {
      groups.set(key, {
        medication: item.medication,
        dosage: item.dosage,
        schedule: item.schedule,
        startDate: item.startDate,
        endDate: item.endDate,
        startDateLabel: item.startDateLabel,
        endDateLabel: item.endDateLabel,
        catNames: [],
        catCount: 0,
      });
    }

    const group = groups.get(key);
    group.catNames.push(item.catName);
    group.catCount += 1;
  });

  return [...groups.values()].sort((a, b) => {
    const aEnd = parseDate(a.endDate) || new Date(8640000000000000);
    const bEnd = parseDate(b.endDate) || new Date(8640000000000000);
    if (aEnd - bEnd !== 0) return aEnd - bEnd;
    return String(a.medication || "").localeCompare(String(b.medication || ""), "pt-BR");
  });
}

async function ensureDashboardPublicToken(prisma, userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dashboardPublicToken: true },
  });
  if (user?.dashboardPublicToken) return user.dashboardPublicToken;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = crypto.randomBytes(24).toString("hex");
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { dashboardPublicToken: token },
      });
      return token;
    } catch (err) {
      if (err.code !== "P2002") throw err;
    }
  }

  throw new Error("Não foi possível gerar o link público do painel.");
}

async function buildPanelData(prisma, ownerId) {
  const today = startOfToday();
  const upcomingLimit = addDays(today, 15);

  const cats = await prisma.cat.findMany({
    where: { ownerId },
    include: {
      owner: { include: { settings: true } },
      vaccinationPlan: true,
      examPlan: true,
      historyEntries: {
        where: { section: "TREATMENT" },
        orderBy: { sortOrder: "asc" },
      },
      litterKitten: { include: { litter: true } },
      matingPlansAsFemale: true,
    },
    orderBy: { name: "asc" },
  });

  const medications = [];
  const vaccines = [];
  const exams = [];
  const matings = [];

  const visibleCats = cats.filter(isVisibleInVaccinationPanel);

  visibleCats.forEach((cat) => {
    const displayName = buildDisplayName(cat);

    cat.historyEntries.forEach((entry) => {
      const item = safeJsonParse(entry.payloadJson, [])[0] || (() => {
        try {
          return JSON.parse(entry.payloadJson || "{}");
        } catch {
          return {};
        }
      })();
      if (!isActiveMedication(item, today)) return;

      const finalDate = item.dischargeDate || item.endDate;
      medications.push({
        catName: displayName,
        medication: item.medication,
        dosage: item.dosage || "",
        schedule: item.dosageSchedule || item.administrationTime || "",
        startDate: medicationDateKey(item.startDate),
        endDate: medicationDateKey(finalDate),
        startDateLabel: formatDate(item.startDate) || "Sem início",
        endDateLabel: formatDate(finalDate) || "Sem alta",
      });
    });

    const antirabicHistory = safeJsonParse(cat.vaccinationPlan?.antirabicHistoryJson, []);
    const felineHistory = safeJsonParse(cat.vaccinationPlan?.felineHistoryJson, []);
    const vaccineDates = [
      { type: "Antirrábica", date: vaccineUtils.computeNextAntirabic(cat.birthDate, antirabicHistory, cat.owner?.settings) },
      { type: "Feline", date: vaccineUtils.computeNextFeline(cat.birthDate, felineHistory, cat.owner?.settings) },
    ]
      .filter((item) => item.date && item.date <= upcomingLimit)
      .sort((a, b) => a.date - b.date);

    if (vaccineDates.length) {
      const item = vaccineDates[0];
      const status = dateStatus(item.date, today);
      vaccines.push({
        catName: displayName,
        type: item.type,
        date: item.date,
        dateLabel: formatDate(item.date),
        status,
      });
    }

    const selectedExams = selectedExamsFromSettings(cat.owner?.settings, { defaultAll: true });
    const canShowHcm = selectedExams.includes("HCM - Doppler");
    const examCategory = classifyOperationalCat(cat, {
      includeDeliveredKittensInHistory: false,
    });
    const canShowKittenExam = examCategory !== "kittens" ||
      examKittensTabEnabledFromSettings(cat.owner?.settings, { defaultEnabled: true });
    const ecoHistory = safeJsonParse(cat.examPlan?.ecoHistoryJson, []);
    const hasEcoHistory = sortHistoryDates(ecoHistory).length > 0;
    const nextEco = canShowHcm && canShowKittenExam && !(examCategory === "founders" && hasEcoHistory)
      ? computeNextEco(cat.birthDate, ecoHistory)
      : null;
    if (nextEco && nextEco <= upcomingLimit) {
      exams.push({
        catName: displayName,
        type: "Ecocardiodoppler",
        date: nextEco,
        dateLabel: formatDate(nextEco),
        status: dateStatus(nextEco, today),
      });
    }

    if (isFemaleAvailable(cat)) {
      const plan = cat.matingPlansAsFemale?.[0];
      const litterHistory = safeJsonParse(plan?.litterHistoryJson, []);
      const nextCrossDate = computeNextCrossDate(cat.birthDate, litterHistory);
      if (plan?.status === "PAUSA_REPRODUTIVA" || plan?.status === "COM_PROBLEMA") return;
      if (nextCrossDate && nextCrossDate > upcomingLimit) return;

      matings.push({
        catName: displayName,
        date: nextCrossDate,
        dateLabel: formatDate(nextCrossDate) || "Liberada",
        status: dateStatus(nextCrossDate, today),
      });
    }
  });

  vaccines.sort((a, b) => a.date - b.date);
  exams.sort((a, b) => a.date - b.date);
  matings.sort((a, b) => (a.date || today) - (b.date || today));
  const groupedMedications = groupMedicationsByPeriod(medications);

  return {
    medications: groupedMedications.slice(0, 12),
    vaccines: vaccines.slice(0, 10),
    matings: matings.slice(0, 10),
    exams: exams.slice(0, 5),
    summary: {
      cats: visibleCats.filter(isMonitoredCat).length,
      alerts: groupedMedications.length + vaccines.length + matings.length + exams.length,
      matingFemales: matings.length,
      overdueVaccines: vaccines.filter((item) => item.status.days < 0).length,
      overdueExams: exams.filter((item) => item.status.days < 0).length,
    },
  };
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  router.get("/painel", requireAuth, requirePermission("admin.tacticalPanel"), async (req, res) => {
    try {
      const token = await ensureDashboardPublicToken(prisma, req.session.userId);
      res.redirect(`/painel/${token}`);
    } catch (err) {
      console.error("Erro ao abrir painel tático:", err);
      res.status(500).send("Erro ao abrir painel.");
    }
  });

  router.get("/painel/:token", async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { dashboardPublicToken: String(req.params.token || "").trim() },
        select: { id: true, name: true, fifeCatteryName: true, role: true },
      });

      if (!user) {
        return res.status(404).send("Painel não encontrado.");
      }

      if (!userCan(user.role, "admin.tacticalPanel")) {
        return res.status(403).send("Este painel não está disponível para o plano atual.");
      }

      const panel = await buildPanelData(prisma, user.id);
      res.render("tactical-panel/show", {
        user,
        panel,
        generatedAt: new Date(),
      });
    } catch (err) {
      console.error("Erro ao carregar painel tático público:", err);
      res.status(500).send("Erro ao carregar painel.");
    }
  });

  return router;
};
