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

module.exports = { formatMicrochip };
