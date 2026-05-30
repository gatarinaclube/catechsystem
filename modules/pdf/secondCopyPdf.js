const {
  createServiceDoc,
  drawDocumentHeader,
  drawKeyValueBox,
  drawStatusBox,
  formatDateTimeBR,
} = require("./pdfTheme");

const REQUEST_LABELS = {
  PEDIGREE_SECOND_COPY: "Segunda Via de Pedigree",
  TITLE_DIPLOMA_SECOND_COPY: "Segunda Via de Titulo",
  OWNERSHIP_DOC_SECOND_COPY: "Segunda Via de Propriedade",
  CHANGE_TO_NOT_BREEDING: "Mudanca de For Breeding para Not For Breeding",
  CHANGE_TO_BREEDING: "Mudanca de Not For Breeding para For Breeding",
  CHANGE_COLOR: "Mudanca de Cor",
  FIX_MICROCHIP: "Correcao de Microchip",
  FIX_SEX: "Correcao de Sexo",
  CATTERY_SECOND_COPY: "Segunda Via de Registro de Gatil",
  OTHER: "Outros",
};

function hasCat(type) {
  return [
    "PEDIGREE_SECOND_COPY",
    "TITLE_DIPLOMA_SECOND_COPY",
    "OWNERSHIP_DOC_SECOND_COPY",
    "CHANGE_TO_NOT_BREEDING",
    "CHANGE_TO_BREEDING",
    "CHANGE_COLOR",
    "FIX_MICROCHIP",
    "FIX_SEX",
  ].includes(type);
}

async function generateSecondCopyPDF(service, secondCopy, cat, output) {
  const isResponse = typeof output.setHeader === "function";

  if (isResponse) {
    output.setHeader("Content-Type", "application/pdf");
    output.setHeader("Content-Disposition", `attachment; filename=servico-${service.id}.pdf`);
  }

  const doc = createServiceDoc(output, "Segunda Via e Alteracoes");
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let y = doc.y;
  const type = secondCopy?.requestType;

  drawDocumentHeader(doc, "SEGUNDA VIA E ALTERACOES", service.type || "Servico FFB");
  y = doc.y;

  y = drawKeyValueBox(doc, "DADOS DO SERVICO", [
    { label: "Codigo do servico", value: service.id },
    { label: "Tipo de servico", value: service.type },
    { label: "Data da solicitacao", value: formatDateTimeBR(service.createdAt) },
    { label: "Solicitante", value: service.user?.name },
  ], left, y, width);

  if (hasCat(type)) {
    y = drawKeyValueBox(doc, "INFORMACOES DO GATO", [
      { label: "Nome do gato", value: cat?.name },
      { label: "Registro FFB", value: `${cat?.pedigreeType || ""} ${cat?.pedigreeNumber || ""}`.trim() || "-" },
      { label: "Sexo", value: cat?.gender === "M" ? "Macho" : cat?.gender === "F" ? "Femea" : "-" },
      { label: "Microchip", value: cat?.microchip },
      { label: "Raca", value: cat?.breed },
      { label: "Cor e EMS", value: cat?.emsCode },
    ], left, y, width);
  } else {
    y = drawKeyValueBox(doc, "INFORMACOES DO SOLICITANTE", [
      { label: "Nome do solicitante", value: service.user?.name },
    ], left, y, width, { columns: 1 });
  }

  const serviceItems = [
    { label: "Servico solicitado", value: REQUEST_LABELS[type] || type },
  ];

  if (type === "TITLE_DIPLOMA_SECOND_COPY" && secondCopy?.details) {
    serviceItems.push({ label: "Informacoes", value: secondCopy.details });
  }
  if (type === "CHANGE_TO_BREEDING" && secondCopy?.details) {
    serviceItems.push({ label: "Justificativa", value: secondCopy.details });
  }
  if (type === "CHANGE_COLOR") {
    serviceItems.push(
      { label: "Nova Cor / EMS", value: secondCopy?.newValue },
      { label: "Justificativa", value: secondCopy?.details },
      { label: "Justificativa de Mudanca ou Sumula", value: "ANEXADA AO PROCESSO" }
    );
  }
  if (type === "FIX_MICROCHIP") {
    serviceItems.push(
      { label: "Novo Microchip", value: secondCopy?.newValue },
      { label: "Novo Certificado ou Atestado Veterinario", value: "ANEXADO AO PROCESSO" }
    );
  }
  if (type === "FIX_SEX" && secondCopy?.details) {
    serviceItems.push({ label: "Justificativa", value: secondCopy.details });
  }
  if (type === "CATTERY_SECOND_COPY") {
    serviceItems.push({ label: "Nome do Gatil", value: service.user?.fifeCatteryName });
  }
  if (type === "OTHER" && secondCopy?.details) {
    serviceItems.push({ label: "Descricao", value: secondCopy.details });
  }

  y = drawKeyValueBox(doc, "INFORMACOES DO SERVICO", serviceItems, left, y, width, {
    columns: 1,
    rowHeight: 15,
  });

  drawStatusBox(doc, service.statuses, left, y, width);
  doc.end();
}

module.exports = {
  generateSecondCopyPDF,
};
