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

module.exports = { formatMicrochip, onlyDigits, formatCpf, formatCnpj, formatCpfCnpj, formatPhone };
