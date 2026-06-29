const {
  createServiceDoc,
  drawDocumentHeader,
  drawKeyValueBox,
  drawStatusBox,
  drawTextBox,
  formatDateTimeBR,
} = require("./pdfTheme");

function parseBreeds(raw) {
  try {
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

async function generateCatteryRegistrationPDF(service, catteryRegistration, user, resStream) {
  const doc = createServiceDoc(resStream, "Registro de Gatil FIFe");
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let y = doc.y;

  drawDocumentHeader(doc, "REGISTRO DE GATIL - FIFe", "Sistema PetGus / Gatarina Clube");
  y = doc.y;

  y = drawKeyValueBox(doc, "DADOS DO SERVICO", [
    { label: "Codigo do servico", value: service.id },
    { label: "Tipo de servico", value: "Registro de Gatil - FIFe" },
    { label: "Data da solicitacao", value: formatDateTimeBR(service.createdAt) },
    { label: "Associado", value: user?.name },
  ], left, y, width);

  y = drawKeyValueBox(doc, "DADOS DO SOLICITANTE", [
    { label: "Nome", value: user?.name },
    { label: "Endereco", value: [user?.address, user?.city, user?.state, user?.cep, user?.country].filter(Boolean).join(" - ") },
    { label: "Telefone", value: user?.phones },
    { label: "E-mail", value: user?.email },
  ], left, y, width);

  y = drawKeyValueBox(doc, "INFORMACOES DO GATIL", [
    { label: "Nome (opcao 1)", value: catteryRegistration?.nameOption1 },
    { label: "Nome (opcao 2)", value: catteryRegistration?.nameOption2 },
    { label: "Nome (opcao 3)", value: catteryRegistration?.nameOption3 },
    { label: "Quantas racas pretende criar", value: catteryRegistration?.numberOfCats },
  ], left, y, width);

  const breeds = parseBreeds(catteryRegistration?.breedsJson);
  y = drawTextBox(doc, "QUAIS RACAS", breeds.length ? breeds.map((breed, index) => `${index + 1}. ${breed}`) : ["-"], left, y, width, {
    fontSize: 7.5,
    lineHeight: 10,
  });

  drawStatusBox(doc, service.statuses, left, y, width);
  doc.end();
}

module.exports = { generateCatteryRegistrationPDF };
