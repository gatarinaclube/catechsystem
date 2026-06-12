function normalizeMicrochip(value) {
  return value ? String(value).replace(/\D/g, "").slice(0, 15) : null;
}

function addMonths(date, months) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  const result = new Date(parsed);
  result.setMonth(result.getMonth() + months);
  return result;
}

function isYoungerThanFourMonths(birthDate, referenceDate = new Date()) {
  const fourMonthDate = addMonths(birthDate, 4);
  if (!fourMonthDate) return false;
  return referenceDate < fourMonthDate;
}

function requiresMicrochipForKitten(birthDate, deceased = false) {
  if (deceased) return false;
  return !isYoungerThanFourMonths(birthDate);
}

function buildMissingMicrochipMessage(label = "Este gato") {
  return `${label} já completou 4 meses de idade. Para editar ou realizar novas ações, informe o microchip.`;
}

function ensureMicrochipWhenRequired({
  microchip,
  birthDate,
  deceased = false,
  label = "Este gato",
  allowUnderFourMonths = false,
}) {
  const digits = normalizeMicrochip(microchip);
  const hasValidBirthDate = birthDate && !Number.isNaN(new Date(birthDate).getTime());
  const required = allowUnderFourMonths
    ? requiresMicrochipForKitten(birthDate, deceased)
    : !deceased;

  if (required && !digits) {
    const message = allowUnderFourMonths && !hasValidBirthDate
      ? `${label}: informe a data de nascimento para usar a exceção dos 4 meses ou informe o microchip.`
      : buildMissingMicrochipMessage(label);
    const error = new Error(message);
    error.code = "MICROCHIP_REQUIRED";
    throw error;
  }

  return digits;
}

function isBlockedByMissingMicrochip(cat) {
  return requiresMicrochipForKitten(cat?.birthDate, cat?.deceased === true) && !normalizeMicrochip(cat?.microchip);
}

module.exports = {
  buildMissingMicrochipMessage,
  ensureMicrochipWhenRequired,
  isBlockedByMissingMicrochip,
  isYoungerThanFourMonths,
  normalizeMicrochip,
  requiresMicrochipForKitten,
};
