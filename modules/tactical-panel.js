const crypto = require("crypto");
const express = require("express");
const {
  addDays,
  addMonths,
  addYears,
  ageInMonths,
  buildDisplayName,
  formatDate,
  formatDateInput,
  parseDate,
} = require("../utils/cattery-admin");

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
  return last ? addYears(last, 1) : null;
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
      vaccinationPlan: true,
      examPlan: true,
      historyEntries: {
        where: { section: "TREATMENT" },
        orderBy: { sortOrder: "asc" },
      },
      litterKitten: true,
      matingPlansAsFemale: true,
    },
    orderBy: { name: "asc" },
  });

  const medications = [];
  const vaccines = [];
  const exams = [];
  const matings = [];

  cats.forEach((cat) => {
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

      medications.push({
        catName: displayName,
        medication: item.medication,
        dosage: item.dosage || "",
        schedule: item.dosageSchedule || "",
        endDateLabel: formatDate(item.dischargeDate || item.endDate) || "Sem alta",
      });
    });

    const antirabicHistory = safeJsonParse(cat.vaccinationPlan?.antirabicHistoryJson, []);
    const felineHistory = safeJsonParse(cat.vaccinationPlan?.felineHistoryJson, []);
    const vaccineDates = [
      { type: "Antirrábica", date: computeNextAntirabic(cat.birthDate, antirabicHistory) },
      { type: "Feline", date: computeNextFeline(cat.birthDate, felineHistory) },
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

    const ecoHistory = safeJsonParse(cat.examPlan?.ecoHistoryJson, []);
    const nextEco = computeNextEco(cat.birthDate, ecoHistory);
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

  return {
    medications: medications.slice(0, 12),
    vaccines: vaccines.slice(0, 10),
    matings: matings.slice(0, 10),
    exams: exams.slice(0, 5),
    summary: {
      cats: cats.filter(isMonitoredCat).length,
      alerts: medications.length + vaccines.length + matings.length + exams.length,
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
        select: { id: true, name: true, fifeCatteryName: true },
      });

      if (!user) {
        return res.status(404).send("Painel não encontrado.");
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
