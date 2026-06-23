(function () {
  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatCpf(value) {
    const digits = onlyDigits(value).slice(0, 11);
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }

  function formatCnpj(value) {
    const digits = onlyDigits(value).slice(0, 14);
    return digits
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
  }

  function formatCpfCnpj(value) {
    const digits = onlyDigits(value);
    if (digits.length > 11) return formatCnpj(digits);
    return formatCpf(digits);
  }

  function formatPhone(value) {
    const digits = onlyDigits(value).slice(0, 11);
    if (digits.length > 10) {
      return digits
        .replace(/^(\d{2})(\d)/, "($1) $2")
        .replace(/^(\(\d{2}\) \d{5})(\d)/, "$1-$2");
    }
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/^(\(\d{2}\) \d{4})(\d)/, "$1-$2");
  }

  function shouldMaskLive(input) {
    const key = `${input.name || ""} ${input.id || ""}`.toLowerCase();
    return key.includes("cpf") || key.includes("cnpj") || key.includes("cpfcnpj");
  }

  function shouldMaskOnBlur(input) {
    const key = `${input.name || ""} ${input.id || ""}`.toLowerCase();
    return input.dataset.documentMask === "cpf-cnpj" || key === "document document" || key.includes("cpf") || key.includes("cnpj");
  }

  function shouldMaskPhone(input) {
    const key = `${input.name || ""} ${input.id || ""} ${input.placeholder || ""}`.toLowerCase();
    return input.type === "tel" ||
      input.dataset.phoneMask === "true" ||
      key.includes("phone") ||
      key.includes("telefone") ||
      key.includes("celular") ||
      key.includes("whatsapp");
  }

  function applyLiveMask(input) {
    input.value = formatCpfCnpj(input.value);
  }

  function applyCompleteMask(input) {
    const digits = onlyDigits(input.value);
    if (digits.length === 11) input.value = formatCpf(digits);
    if (digits.length === 14) input.value = formatCnpj(digits);
  }

  function applyPhoneMask(input) {
    input.value = formatPhone(input.value);
  }

  function setupInput(input) {
    if (input.dataset.documentMaskReady === "true") return;
    input.dataset.documentMaskReady = "true";

    if (shouldMaskLive(input)) {
      input.addEventListener("input", () => applyLiveMask(input));
      applyCompleteMask(input);
      return;
    }

    if (shouldMaskPhone(input)) {
      input.addEventListener("input", () => applyPhoneMask(input));
      applyPhoneMask(input);
      return;
    }

    if (shouldMaskOnBlur(input)) {
      input.addEventListener("blur", () => applyCompleteMask(input));
      applyCompleteMask(input);
    }
  }

  function setup() {
    document.querySelectorAll("input").forEach(setupInput);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }
})();
