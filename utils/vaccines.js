const {
  addDays,
  addMonths,
  addYears,
  formatDate,
  formatDateInput,
  parseDate,
} = require("./cattery-admin");

function safeJsonParse(value, fallback = []) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function sortHistoryDates(history) {
  return [...(Array.isArray(history) ? history : [])]
    .map((value) => ({
      ...value,
      date: formatDateInput(value?.date),
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

function latestHistoryDose(history) {
  const sorted = sortHistoryDates(history).filter((item) => parseDate(item.date));
  return sorted[sorted.length - 1] || null;
}

function positiveInteger(value, fallback = null) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.floor(number);
}

function resolveVaccineSchedule(settings = {}) {
  const antirabicAnnualBooster = settings.antirabicAnnualBooster !== false;
  const felineAnnualBooster = settings.felineAnnualBooster !== false;

  return {
    antirabicFirstDoseMonths: positiveInteger(settings.antirabicFirstDoseMonths, 3),
    antirabicBoosterIntervalYears: antirabicAnnualBooster
      ? 1
      : positiveInteger(settings.antirabicBoosterIntervalYears, 1),
    felineFirstDoseMonths: positiveInteger(settings.felineFirstDoseMonths, 2),
    felineSecondDoseDays: positiveInteger(settings.felineSecondDoseDays, 21),
    felineThirdDoseDays: positiveInteger(settings.felineThirdDoseDays, null),
    felineBoosterIntervalYears: felineAnnualBooster
      ? 1
      : positiveInteger(settings.felineBoosterIntervalYears, 1),
  };
}

function boosterDueDate(lastDoseDate, intervalYears) {
  const last = parseDate(lastDoseDate);
  return last ? addDays(addYears(last, intervalYears), -1) : null;
}

function computeNextAntirabic(birthDate, history, settings = {}) {
  const schedule = resolveVaccineSchedule(settings);
  const sorted = sortHistoryDates(history).filter((item) => parseDate(item.date));
  const birth = parseDate(birthDate);

  if (!sorted.length) {
    return birth ? addMonths(birth, schedule.antirabicFirstDoseMonths) : null;
  }

  return boosterDueDate(sorted[sorted.length - 1].date, schedule.antirabicBoosterIntervalYears);
}

function computeNextFeline(birthDate, history, settings = {}) {
  const schedule = resolveVaccineSchedule(settings);
  const sorted = sortHistoryDates(history).filter((item) => parseDate(item.date));
  const birth = parseDate(birthDate);

  if (!sorted.length) {
    return birth ? addMonths(birth, schedule.felineFirstDoseMonths) : null;
  }

  if (sorted.length === 1) {
    const first = parseDate(sorted[0].date);
    return first ? addDays(first, schedule.felineSecondDoseDays) : null;
  }

  if (sorted.length === 2 && schedule.felineThirdDoseDays) {
    const second = parseDate(sorted[1].date);
    return second ? addDays(second, schedule.felineThirdDoseDays) : null;
  }

  return boosterDueDate(sorted[sorted.length - 1].date, schedule.felineBoosterIntervalYears);
}

function buildVaccineDueItems(cat) {
  const antirabicHistory = safeJsonParse(cat?.vaccinationPlan?.antirabicHistoryJson, []);
  const felineHistory = safeJsonParse(cat?.vaccinationPlan?.felineHistoryJson, []);
  const lastAntirabic = latestHistoryDose(antirabicHistory);
  const lastFeline = latestHistoryDose(felineHistory);
  const settings = cat?.owner?.settings || cat?.settings || {};

  return [
    {
      vaccineType: "Antirrábica",
      dueDate: computeNextAntirabic(cat?.birthDate, antirabicHistory, settings),
      lastDoseDate: lastAntirabic?.date || "",
      lastDoseLabel: formatDate(lastAntirabic?.date) || "Sem registro",
    },
    {
      vaccineType: lastFeline?.type ? `Feline (${lastFeline.type})` : "Feline",
      dueDate: computeNextFeline(cat?.birthDate, felineHistory, settings),
      lastDoseDate: lastFeline?.date || "",
      lastDoseLabel: formatDate(lastFeline?.date) || "Sem registro",
    },
  ].filter((item) => item.dueDate);
}

function vaccineDateStatus(date, today = new Date()) {
  const target = parseDate(date);
  if (!target) return { label: "", days: null };
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const due = new Date(target);
  due.setHours(0, 0, 0, 0);
  const days = Math.round((due - start) / 86400000);

  if (days < 0) return { label: `Vencida há ${Math.abs(days)} dia(s)`, days };
  if (days === 0) return { label: "Vence hoje", days };
  return { label: `Vence em ${days} dia(s)`, days };
}

module.exports = {
  safeJsonParse,
  sortHistoryDates,
  latestHistoryDose,
  resolveVaccineSchedule,
  computeNextAntirabic,
  computeNextFeline,
  buildVaccineDueItems,
  vaccineDateStatus,
};
