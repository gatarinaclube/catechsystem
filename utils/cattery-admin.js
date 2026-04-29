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

  const months = ageInMonths(cat.birthDate);
  const ownerSelf = isOwnerSelf(cat);

  if (cat.kittenNumber) {
    if (!cat.delivered || includeDeliveredKittensInHistory) {
      if (includeOwnedBreedingKittensAsAdults && ownerSelf && months > 4) {
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
  if (cat.deceased === true || cat.neutered === true) return "founders";
  if (cat.gender === "M") return "sires";
  if (cat.gender === "F") return "dams";
  return null;
}

module.exports = {
  parseDate,
  formatDate,
  addDays,
  addMonths,
  addYears,
  ageInMonths,
  isOwnerSelf,
  buildDisplayName,
  classifyOperationalCat,
};
