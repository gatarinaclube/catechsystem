function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCountry(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isBrazilCountry(value) {
  return ["brasil", "brazil", "br"].includes(normalizeCountry(value));
}

function countryFromBody(body = {}) {
  const selected = clean(body.country);
  const custom = clean(body.otherCountry);
  if (isBrazilCountry(selected) || !selected) return "Brasil";
  if (normalizeCountry(selected) === "outro pais") return custom || null;
  return selected;
}

function countryOptionsFromClients(clients = [], currentCountry = "") {
  const options = ["Brasil"];
  const add = (value) => {
    const country = clean(value);
    if (!country || isBrazilCountry(country) || normalizeCountry(country) === "outro pais") return;
    if (!options.some((item) => item.toLowerCase() === country.toLowerCase())) {
      options.push(country);
    }
  };

  clients.forEach((client) => add(client.country));
  add(currentCountry);
  return options;
}

function phoneForCountry(rawPhone, country, formatBrazilPhone) {
  const phone = clean(rawPhone);
  if (!phone) return null;
  return isBrazilCountry(country) ? formatBrazilPhone(phone) || null : phone;
}

function documentForCountry(rawDocument, country, formatBrazilDocument) {
  const document = clean(rawDocument);
  if (!document) return null;
  return isBrazilCountry(country) ? formatBrazilDocument(document) || null : document;
}

function validateClientData(data = {}) {
  if (!clean(data.fullName)) {
    throw new Error("Informe o nome do cliente.");
  }
  if (!isBrazilCountry(data.country)) {
    if (!clean(data.phone)) {
      throw new Error("Informe o telefone do cliente para países fora do Brasil.");
    }
    if (!clean(data.email)) {
      throw new Error("Informe o e-mail do cliente para países fora do Brasil.");
    }
  }
}

module.exports = {
  countryFromBody,
  countryOptionsFromClients,
  documentForCountry,
  isBrazilCountry,
  phoneForCountry,
  validateClientData,
};
