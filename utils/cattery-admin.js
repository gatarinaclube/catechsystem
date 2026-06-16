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

function isKittenRecord(cat) {
  return Boolean(cat?.kittenNumber || cat?.litterKitten);
}

function compactText(value) {
  return String(value || "").trim();
}

function catteryNameForCat(cat) {
  const litterCatteryName = compactText(
    cat?.catteryName ||
    cat?.litter?.catteryName ||
    cat?.litterKitten?.litter?.catteryName
  );
  if (litterCatteryName) return litterCatteryName;

  const isLinkedToLitter = Boolean(cat?.litter || cat?.litterKitten?.litter);
  if (isLinkedToLitter) {
    return compactText(cat?.owner?.settings?.catteryName);
  }

  return compactText(
    cat?.catteryName
  );
}

function prefixWithCatteryName(name, catteryName) {
  const cleanName = compactText(name);
  const cleanCatteryName = compactText(catteryName);
  if (!cleanName || !cleanCatteryName) return cleanName;
  if (cleanName.toLowerCase().startsWith(`${cleanCatteryName.toLowerCase()} `)) {
    return cleanName;
  }
  return `${cleanCatteryName} ${cleanName}`;
}

function kittenFallbackDisplayName(cat) {
  const name = String(cat?.name || "").trim();
  const hasRealName = Boolean(name) && !/^filhote\s+\d+$/i.test(name);
  if (!isKittenRecord(cat) || hasRealName) return "";

  const number = cat.kittenNumber || cat.litterKitten?.kittenNumber || cat.litterKitten?.index || "-";
  const sexValue = cat.gender || cat.sex || cat.litterKitten?.sex || "";
  const sex = sexValue === "M" ? "Macho" : sexValue === "F" ? "Fêmea" : sexValue || "-";
  const motherName = cat.mother?.name || cat.motherName || "-";
  const birthDate = formatDate(cat.birthDate) || "-";
  return [number, sex, motherName, birthDate].join(" - ");
}

function buildKittenRegisteredName(cat) {
  if (!isKittenRecord(cat)) return "";
  const name = compactText(cat?.name);
  if (!name || /^filhote\s+\d+$/i.test(name)) return "";
  if (/^[A-Z]{2}\*/i.test(name)) return name;

  return [
    cat.country ? `${cat.country}*` : null,
    prefixWithCatteryName(name, catteryNameForCat(cat)),
  ].filter(Boolean).join("");
}

function buildDisplayName(cat) {
  const kittenFallback = kittenFallbackDisplayName(cat);
  if (kittenFallback) return kittenFallback;
  const kittenRegisteredName = buildKittenRegisteredName(cat);
  if (kittenRegisteredName) return kittenRegisteredName;

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

function isRoutineModuleCatVisible(cat) {
  if (!cat) return false;
  if (cat.deceased === true || cat.kittenAvailabilityStatus === "DECEASED") return false;
  const delivered = cat.delivered === true || cat.kittenAvailabilityStatus === "DELIVERED";
  const hasOtherOwner =
    cat.ownershipType === "CO-OWNERSHIP" ||
    cat.ownershipType === "OTHER" ||
    Boolean(cat.currentOwnerClientId) ||
    (Boolean(cat.currentOwnerId) && cat.currentOwnerId !== cat.ownerId);

  if (hasOtherOwner && delivered) return false;
  if (hasOtherOwner) return true;
  return isOwnerSelf(cat);
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
  isKittenRecord,
  isRoutineModuleCatVisible,
  catteryNameForCat,
  prefixWithCatteryName,
  buildKittenRegisteredName,
  buildDisplayName,
  kittenFallbackDisplayName,
  classifyOperationalCat,
};
