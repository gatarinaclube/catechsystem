function parseDate(value) {
  if (!value || value === "0000-00-00") return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brMatch) {
      const [, day, month, year] = brMatch;
      const parsed = new Date(Number(year), Number(month) - 1, Number(day));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      const parsed = new Date(Number(year), Number(month) - 1, Number(day));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateInput(value) {
  const parsed = parseDate(value);
  if (!parsed) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  const parsed = parseDate(value);
  if (!parsed) return "";

  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = parsed.getFullYear();
  return `${day}/${month}/${year}`;
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
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());

  if (now.getDate() < birth.getDate()) months -= 1;
  return Math.max(0, months);
}

function isOwnerSelf(cat) {
  return !cat.currentOwnerId || cat.currentOwnerId === cat.ownerId;
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

function classifyOperationalCat(cat, options = {}) {
  const {
    includeDeliveredKittensInHistory = false,
    includeOwnedBreedingKittensAsAdults = true,
    excludeCoOwnedAdults = true,
  } = options;

  const hasBirthDate = Boolean(parseDate(cat.birthDate));
  const months = hasBirthDate ? ageInMonths(cat.birthDate) : null;
  const isUnderKittenAge = hasBirthDate && months < 8;
  const isKittenRecord = Boolean(cat.kittenNumber || cat.litterKitten);
  const ownerSelf = isOwnerSelf(cat);

  if (cat.delivered === true && !includeDeliveredKittensInHistory) {
    return null;
  }

  if (isKittenRecord) {
    if (!cat.delivered || includeDeliveredKittensInHistory) {
      if (!hasBirthDate || isUnderKittenAge) {
        return "kittens";
      }

      if (includeOwnedBreedingKittensAsAdults && ownerSelf) {
        if (cat.deceased === true || cat.neutered === true) {
          return "founders";
        }
        return cat.gender === "M" ? "sires" : cat.gender === "F" ? "dams" : "kittens";
      }

      return "kittens";
    }

    return null;
  }

  if (!ownerSelf && excludeCoOwnedAdults) return null;
  if (isUnderKittenAge) return "kittens";
  if (cat.deceased === true || cat.neutered === true) return "founders";
  if (cat.gender === "M") return "sires";
  if (cat.gender === "F") return "dams";
  return null;
}

module.exports = {
  parseDate,
  formatDate,
  formatDateInput,
  addDays,
  addMonths,
  addYears,
  ageInMonths,
  isOwnerSelf,
  buildDisplayName,
  classifyOperationalCat,
};
