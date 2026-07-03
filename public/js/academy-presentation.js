(function () {
  const form = document.querySelector("[data-presentation-interest-form]");

  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function maskCpf(value) {
    const digits = onlyDigits(value).slice(0, 11);
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  function maskZipCode(value) {
    return onlyDigits(value).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
  }

  function maskBrazilPhone(value) {
    const digits = onlyDigits(value).slice(0, 11);
    if (digits.length <= 10) {
      return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
    }
    return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
  }

  function setAddressFieldsEnabled(enabled) {
    if (!form) return;
    form.querySelectorAll("[data-brazil-address-field]").forEach((container) => {
      container.hidden = !enabled;
      container.querySelectorAll("input").forEach((input) => {
        input.disabled = !enabled;
        input.required = enabled;
      });
    });
  }

  async function lookupZipCode() {
    const zipCodeInput = form?.querySelector("[data-zipcode-input]");
    if (!zipCodeInput) return;
    const zip = onlyDigits(zipCodeInput.value);
    if (zip.length !== 8) return;
    try {
      const response = await fetch(`https://viacep.com.br/ws/${zip}/json/`);
      if (!response.ok) throw new Error("CEP indisponivel");
      const data = await response.json();
      if (data.erro) return;
      const street = form.querySelector('[name="street"]');
      const district = form.querySelector('[name="district"]');
      if (street && data.logradouro) street.value = data.logradouro;
      if (district && data.bairro) district.value = data.bairro;
    } catch (err) {
      // Mantem preenchimento manual se o serviço estiver indisponível.
    }
  }

  if (form) {
    const countryInput = form.querySelector("[data-country-input]");
    const cpfInput = form.querySelector("[data-cpf-input]");
    const zipCodeInput = form.querySelector("[data-zipcode-input]");
    const whatsappInput = form.querySelector('[name="whatsapp"]');

    function syncPresentationLocation() {
      const isBrazil = ["brasil", "brazil", "br"].includes(normalize(countryInput?.value));
      setAddressFieldsEnabled(isBrazil);
      if (!isBrazil) return;
      if (whatsappInput) whatsappInput.value = maskBrazilPhone(whatsappInput.value);
    }

    cpfInput?.addEventListener("input", () => {
      cpfInput.value = maskCpf(cpfInput.value);
    });
    zipCodeInput?.addEventListener("input", () => {
      zipCodeInput.value = maskZipCode(zipCodeInput.value);
    });
    zipCodeInput?.addEventListener("blur", lookupZipCode);
    whatsappInput?.addEventListener("input", () => {
      const isBrazil = ["brasil", "brazil", "br"].includes(normalize(countryInput?.value));
      if (isBrazil) whatsappInput.value = maskBrazilPhone(whatsappInput.value);
    });
    countryInput?.addEventListener("change", syncPresentationLocation);
    countryInput?.addEventListener("input", syncPresentationLocation);
    syncPresentationLocation();
  }

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal-on-scroll").forEach((element) => observer.observe(element));
  } else {
    document.querySelectorAll(".reveal-on-scroll").forEach((element) => element.classList.add("is-visible"));
  }
})();
