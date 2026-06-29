(function () {
  const form = document.querySelector("[data-gatofilia-interest-form]");
  if (!form) return;

  const countryInput = form.querySelector("[data-country-input]");
  const countryList = document.getElementById("gatofiliaCountryList");
  const stateBrazilField = form.querySelector("[data-brazil-state-field]");
  const stateOtherField = form.querySelector("[data-other-state-field]");
  const cityBrazilField = form.querySelector("[data-brazil-city-field]");
  const cityOtherField = form.querySelector("[data-other-city-field]");
  const stateSelect = form.querySelector("[data-brazil-state-select]");
  const citySelect = form.querySelector("[data-brazil-city-select]");
  const hasCatterySelect = form.querySelector("[data-has-cattery]");
  const catteryFields = Array.from(form.querySelectorAll("[data-cattery-only]"));
  const noCatteryFields = Array.from(form.querySelectorAll("[data-no-cattery-only]"));
  const submitButton = form.querySelector('button[type="submit"]');
  const submitStatus = form.querySelector("[data-submit-status]");

  const countryCodes = [
    "AF", "ZA", "AL", "DE", "AD", "AO", "AI", "AQ", "AG", "SA", "DZ", "AR", "AM", "AW", "AU", "AT", "AZ",
    "BS", "BH", "BD", "BB", "BE", "BZ", "BJ", "BM", "BY", "BO", "BA", "BW", "BR", "BN", "BG", "BF", "BI", "BT",
    "CV", "CM", "KH", "CA", "QA", "KZ", "TD", "CL", "CN", "CY", "CO", "KM", "CG", "CD", "KP", "KR", "CI", "CR",
    "HR", "CU", "CW", "DK", "DJ", "DM", "EG", "SV", "AE", "EC", "ER", "SK", "SI", "ES", "US", "EE", "SZ", "ET",
    "FJ", "PH", "FI", "FR", "GA", "GM", "GH", "GE", "GI", "GD", "GR", "GL", "GP", "GU", "GT", "GG", "GY", "GF",
    "GN", "GQ", "GW", "HT", "HN", "HK", "HU", "YE", "BV", "CX", "IM", "NF", "AX", "KY", "CC", "CK", "FO", "GS",
    "HM", "FK", "MP", "MH", "UM", "PN", "SB", "TC", "VG", "VI", "IN", "ID", "IR", "IQ", "IE", "IS", "IL", "IT",
    "JM", "JP", "JE", "JO", "KI", "XK", "KW", "LA", "LS", "LV", "LB", "LR", "LY", "LI", "LT", "LU", "MO", "MG",
    "MY", "MW", "MV", "ML", "MT", "MA", "MQ", "MU", "MR", "YT", "MX", "MM", "FM", "MZ", "MD", "MC", "MN", "ME",
    "MS", "NA", "NR", "NP", "NI", "NE", "NG", "NU", "NO", "NC", "NZ", "OM", "NL", "BQ", "PW", "PA", "PG", "PK",
    "PY", "PE", "PF", "PL", "PR", "PT", "KE", "KG", "GB", "CF", "MK", "CZ", "DO", "RE", "RO", "RW", "RU", "EH",
    "BL", "KN", "SM", "MF", "PM", "VC", "SH", "LC", "ST", "SN", "SL", "RS", "SC", "SG", "SX", "SY", "SO", "LK",
    "SD", "SS", "SE", "CH", "SR", "SJ", "TH", "TW", "TJ", "TZ", "IO", "PS", "TF", "TL", "TG", "TK", "TO", "TT",
    "TN", "TM", "TR", "TV", "UA", "UG", "UY", "UZ", "VU", "VA", "VE", "VN", "WF", "ZM", "ZW"
  ];

  const displayNames = typeof Intl !== "undefined" && Intl.DisplayNames
    ? new Intl.DisplayNames(["pt-BR"], { type: "region" })
    : null;

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function setFieldEnabled(container, enabled) {
    if (!container) return;
    container.hidden = !enabled;
    container.querySelectorAll("input, select, textarea").forEach((field) => {
      field.disabled = !enabled;
      if (enabled) field.required = true;
    });
  }

  function fillCountries() {
    if (!countryList || !displayNames) return;
    const names = countryCodes
      .map((code) => displayNames.of(code))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));

    countryList.innerHTML = names.map((name) => `<option value="${name}"></option>`).join("");
  }

  async function loadBrazilStates() {
    if (!stateSelect || stateSelect.dataset.loaded === "1") return;
    try {
      const response = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome");
      if (!response.ok) throw new Error("IBGE indisponível");
      const states = await response.json();
      stateSelect.innerHTML = '<option value="">Selecione</option>' + states
        .map((state) => `<option value="${state.nome}" data-uf="${state.sigla}">${state.nome}</option>`)
        .join("");
      stateSelect.dataset.loaded = "1";
    } catch (err) {
      setFieldEnabled(stateBrazilField, false);
      setFieldEnabled(cityBrazilField, false);
      setFieldEnabled(stateOtherField, true);
      setFieldEnabled(cityOtherField, true);
    }
  }

  async function loadBrazilCities(uf) {
    if (!citySelect) return;
    citySelect.innerHTML = '<option value="">Carregando cidades...</option>';
    citySelect.disabled = true;
    try {
      const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);
      if (!response.ok) throw new Error("IBGE indisponível");
      const cities = await response.json();
      citySelect.innerHTML = '<option value="">Selecione</option>' + cities
        .map((city) => `<option value="${city.nome}">${city.nome}</option>`)
        .join("");
      citySelect.disabled = false;
    } catch (err) {
      citySelect.innerHTML = '<option value="">Não foi possível carregar</option>';
      setFieldEnabled(cityBrazilField, false);
      setFieldEnabled(cityOtherField, true);
    }
  }

  function syncLocationFields() {
    const isBrazil = ["brasil", "brazil", "br"].includes(normalize(countryInput.value));
    setFieldEnabled(stateBrazilField, isBrazil);
    setFieldEnabled(cityBrazilField, isBrazil);
    setFieldEnabled(stateOtherField, !isBrazil);
    setFieldEnabled(cityOtherField, !isBrazil);

    if (isBrazil) loadBrazilStates();
  }

  function syncCatteryFields() {
    const hasCattery = hasCatterySelect.value === "Sim";
    const noCattery = hasCatterySelect.value === "Não";
    catteryFields.forEach((field) => setFieldEnabled(field, hasCattery));
    noCatteryFields.forEach((field) => setFieldEnabled(field, noCattery));
  }

  function setSubmitStatus(message, type) {
    if (!submitStatus) return;
    submitStatus.textContent = message || "";
    submitStatus.classList.toggle("success", type === "success");
    submitStatus.classList.toggle("error", type === "error");
  }

  fillCountries();
  syncLocationFields();
  syncCatteryFields();

  if (form.dataset.leadStatus === "ok") {
    setSubmitStatus("Formulário enviado. Nossa equipe entrará em contato.", "success");
  } else if (form.dataset.leadStatus === "erro") {
    setSubmitStatus("Não foi possível enviar agora. Confira nome, e-mail e WhatsApp.", "error");
  }

  countryInput?.addEventListener("change", syncLocationFields);
  countryInput?.addEventListener("input", syncLocationFields);
  hasCatterySelect?.addEventListener("change", syncCatteryFields);
  stateSelect?.addEventListener("change", () => {
    const option = stateSelect.selectedOptions[0];
    if (option?.dataset.uf) loadBrazilCities(option.dataset.uf);
  });

  form.addEventListener("submit", () => {
    setSubmitStatus("Enviando...", "");
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.originalText = submitButton.textContent;
      submitButton.textContent = "Enviando...";
    }
  });
})();
