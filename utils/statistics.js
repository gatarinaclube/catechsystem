const MAX_INT = 2147483647;

function calendarParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit",
  }).formatToParts(now);
  return {
    year: Number(parts.find((part) => part.type === "year").value),
    month: Number(parts.find((part) => part.type === "month").value),
  };
}

// Stored birth and competence dates are date-only values represented at UTC midnight.
function dateParts(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function parseParcels(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function count(value) {
  return Math.max(0, Number(value) || 0);
}

function formatMoney(cents) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseHistoryInput(body, now = new Date()) {
  const current = calendarParts(now);
  function integer(key, label) {
    const text = String(body[key] ?? "").trim();
    if (!/^\d+$/.test(text) || Number(text) > MAX_INT) throw new Error(`Informe ${label} como um número inteiro não negativo.`);
    return Number(text);
  }
  function money(key, label) {
    const text = String(body[key] ?? "").trim();
    // Brazilian currency: dots separate thousands and a comma separates cents.
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text)) {
      throw new Error(`Informe ${label} em reais, por exemplo 1.250,50.`);
    }
    const normalized = text.replace(/\./g, "").replace(",", ".");
    const cents = Math.round(Number(normalized) * 100);
    if (!Number.isSafeInteger(cents) || cents > MAX_INT) throw new Error(`${label} excede o limite de R$ 21.474.836,47.`);
    return cents;
  }
  function optionalInteger(key, label) {
    return String(body[key] ?? "").trim() === "" ? null : integer(key, label);
  }
  const year = integer("year", "o ano");
  if (year < 1900 || year >= current.year) throw new Error(`O ano deve estar entre 1900 e ${current.year - 1}.`);
  return {
    year,
    litterCount: integer("litterCount", "a quantidade de ninhadas"),
    kittenCount: integer("kittenCount", "a quantidade de filhotes vivos"),
    maleDeathCount: optionalInteger("maleDeathCount", "a quantidade de machos em óbito"),
    femaleDeathCount: optionalInteger("femaleDeathCount", "a quantidade de fêmeas em óbito"),
    revenueCents: money("revenue", "a receita"),
    expenseCents: money("expense", "as despesas"),
  };
}

function buildStatistics({ litters = [], standaloneKittens = [], revenues = [], expenses = [], history = [] }, now = new Date()) {
  const current = calendarParts(now);
  const years = new Map();
  let undatedLitters = 0;
  let undatedKittens = 0;
  function getYear(year) {
    if (!years.has(year)) years.set(year, {
      year, source: "system", litterCount: 0, kittenCount: 0, maleCount: 0, femaleCount: 0,
      unknownCount: 0, deaths: 0, maleDeathCount: 0, femaleDeathCount: 0,
      revenueCents: 0, expenseCents: 0,
    });
    return years.get(year);
  }
  function eligible(parts) {
    return parts && parts.year >= 1900 && (parts.year < current.year || (parts.year === current.year && parts.month <= current.month));
  }
  for (const litter of litters) {
    const parts = dateParts(litter.litterBirthDate);
    if (!parts) { undatedLitters++; continue; }
    if (!eligible(parts)) continue;
    const row = getYear(parts.year);
    const kittens = litter.kittens || [];
    const total = Math.max(count(litter.litterCount), count(litter.maleCount) + count(litter.femaleCount), kittens.length);
    const knownMales = kittens.filter((kitten) => (kitten.sex || kitten.kittenCat?.gender) === "M").length;
    const knownFemales = kittens.filter((kitten) => (kitten.sex || kitten.kittenCat?.gender) === "F").length;
    const completeSexRecords = knownMales + knownFemales === total;
    const useIndividualSex = completeSexRecords || !(count(litter.maleCount) + count(litter.femaleCount));
    const males = useIndividualSex ? knownMales : count(litter.maleCount);
    const females = useIndividualSex ? knownFemales : count(litter.femaleCount);
    row.litterCount++;
    row.kittenCount += total;
    row.maleCount += males;
    row.femaleCount += females;
    row.unknownCount += total - males - females;
    // Death statistics come exclusively from the litter's statistics fields.
    // deadCount already includes deaths at birth and afterwards; never add it twice.
    row.deaths += Math.max(count(litter.deadCount),
      count(litter.deadAtBirthCount) + count(litter.deadAfterBirthCount));
    row.maleDeathCount += count(litter.deadAtBirthMaleCount) + count(litter.deadAfterBirthMaleCount);
    row.femaleDeathCount += count(litter.deadAtBirthFemaleCount) + count(litter.deadAfterBirthFemaleCount);
  }
  for (const kitten of standaloneKittens) {
    // Standalone deceased cats are not litter death records (including breeding cats).
    if (kitten.deceased) continue;
    const parts = dateParts(kitten.birthDate);
    if (!parts) { undatedKittens++; continue; }
    if (!eligible(parts)) continue;
    const row = getYear(parts.year);
    row.kittenCount++;
    row[kitten.gender === "M" ? "maleCount" : kitten.gender === "F" ? "femaleCount" : "unknownCount"]++;
  }
  for (const revenue of revenues) {
    for (const parcel of parseParcels(revenue.parcelDataJson)) {
      const parts = dateParts(parcel.date);
      if (!parcel.paid || parcel.canceled || !eligible(parts)) continue;
      getYear(parts.year).revenueCents += count(parcel.amountCents);
    }
  }
  for (const expense of expenses) {
    const parts = dateParts(expense.competenceDate);
    if (eligible(parts)) getYear(parts.year).expenseCents += count(expense.amountCents);
  }
  for (const entry of history) {
    if (entry.year >= current.year) continue;
    const row = getYear(entry.year);
    Object.assign(row, {
      source: "history", litterCount: entry.litterCount, kittenCount: entry.kittenCount,
      revenueCents: entry.revenueCents, expenseCents: entry.expenseCents,
      maleCount: 0, femaleCount: 0, unknownCount: entry.kittenCount,
      maleDeathCount: entry.maleDeathCount ?? null,
      femaleDeathCount: entry.femaleDeathCount ?? null,
      deaths: entry.maleDeathCount != null && entry.femaleDeathCount != null
        ? entry.maleDeathCount + entry.femaleDeathCount : null,
    });
  }
  // Keep years with no activity visible between the first recorded year and the current year.
  const firstYear = years.size ? Math.min(...years.keys()) : current.year;
  for (let year = firstYear; year <= current.year; year++) getYear(year);
  const rows = [...years.values()].sort((a, b) => a.year - b.year).map((row) => {
    const months = row.year === current.year ? current.month : 12;
    const bornCount = row.deaths === null ? null : row.kittenCount + row.deaths;
    return {
      ...row, months,
      bornCount,
      mortalityPercent: bornCount ? row.deaths / bornCount * 100 : null,
      kittensPerMonth: row.kittenCount / months,
      revenuePerMonthCents: row.revenueCents / months,
      expensePerMonthCents: row.expenseCents / months,
      revenuePerKittenCents: row.kittenCount ? row.revenueCents / row.kittenCount : null,
      costPerKittenCents: row.kittenCount ? row.expenseCents / row.kittenCount : null,
    };
  });
  return { rows, current, undatedLitters, undatedKittens };
}

module.exports = { buildStatistics, parseHistoryInput, calendarParts, formatMoney };
