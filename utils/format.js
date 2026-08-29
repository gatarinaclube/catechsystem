// utils/format.js

// Formata microchip para sempre ficar 000.000.000.000.000
function formatMicrochip(raw) {
  if (!raw) return "-";

  const digits = raw.replace(/\D/g, "").padEnd(15, "0").slice(0, 15);

  return digits.replace(
    /(\d{3})(\d{3})(\d{3})(\d{3})(\d{3})/,
    "$1.$2.$3.$4.$5"
  );
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCpf(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length !== 11) return String(value || "").trim();
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatCnpj(value) {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length !== 14) return String(value || "").trim();
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatCpfCnpj(value) {
  const text = String(value || "").trim();
  const digits = onlyDigits(text);
  if (digits.length === 11) return formatCpf(digits);
  if (digits.length === 14) return formatCnpj(digits);
  return text;
}

function normalizeCountry(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["argentina", "ar"].includes(text)) return "Argentina";
  return "Brasil";
}

function hasRepeatedDigits(digits) {
  return /^(\d)\1+$/.test(digits);
}

function isValidCpf(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || hasRepeatedDigits(digits)) return false;

  const calculateDigit = (factor) => {
    let total = 0;
    for (let index = 0; index < factor - 1; index += 1) {
      total += Number(digits[index]) * (factor - index);
    }
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(10) === Number(digits[9]) && calculateDigit(11) === Number(digits[10]);
}

function isValidCnpj(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || hasRepeatedDigits(digits)) return false;

  const calculateDigit = (baseLength) => {
    const weights = baseLength === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const total = weights.reduce((sum, weight, index) => sum + Number(digits[index]) * weight, 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calculateDigit(12) === Number(digits[12]) && calculateDigit(13) === Number(digits[13]);
}

function isValidCpfCnpj(value) {
  const digits = onlyDigits(value);
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}

function formatArgentineDniCni(value) {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length < 7) return String(value || "").trim();
  return `DNI ${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

function isValidArgentineDniCni(value) {
  const digits = onlyDigits(value);
  return [7, 8].includes(digits.length) && !hasRepeatedDigits(digits);
}

function documentLabelForCountry(country) {
  return normalizeCountry(country) === "Argentina" ? "DNI/CNI" : "CPF/CNPJ";
}

function formatDocumentForCountry(value, country) {
  return normalizeCountry(country) === "Argentina"
    ? formatArgentineDniCni(value)
    : formatCpfCnpj(value);
}

function isValidDocumentForCountry(value, country) {
  return normalizeCountry(country) === "Argentina"
    ? isValidArgentineDniCni(value)
    : isValidCpfCnpj(value);
}

function formatPhone(value) {
  const text = String(value || "").trim();
  const digits = onlyDigits(text);
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return text;
}

module.exports = {
  formatMicrochip,
  onlyDigits,
  formatCpf,
  formatCnpj,
  formatCpfCnpj,
  formatArgentineDniCni,
  formatDocumentForCountry,
  formatPhone,
  documentLabelForCountry,
  isValidCpf,
  isValidCnpj,
  isValidCpfCnpj,
  isValidArgentineDniCni,
  isValidDocumentForCountry,
  normalizeCountry,
};
