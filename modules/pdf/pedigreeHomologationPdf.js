const {
  createServiceDoc,
  drawDocumentHeader,
  drawKeyValueBox,
  drawStatusBox,
  formatDateTimeBR,
} = require("./pdfTheme");

async function generatePedigreeHomologationPDF(service, pedigreeHomologation, cat, user, resStream) {
  const doc = createServiceDoc(resStream, "Homologacao de Pedigree FIFe");
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let y = doc.y;

  drawDocumentHeader(doc, "HOMOLOGACAO DE PEDIGREE FIFe", "Homologacao de Pedigree");
  y = doc.y;

  y = drawKeyValueBox(doc, "DADOS DO SERVICO", [
    { label: "Codigo do servico", value: service.id },
    { label: "Tipo de servico", value: "Homologacao de Pedigree" },
    { label: "Data da solicitacao", value: formatDateTimeBR(service.createdAt) },
    { label: "Associado", value: user?.name },
  ], left, y, width);

  y = drawKeyValueBox(doc, "DADOS DO GATO", [
    { label: "Nome", value: cat?.name },
    { label: "Raca", value: cat?.breed },
    { label: "Codigo EMS", value: cat?.emsCode },
  ], left, y, width);

  y = drawKeyValueBox(doc, "INFORMACOES DO PEDIGREE", [
    { label: "Tipo de homologacao", value: pedigreeHomologation?.homologationType },
  ], left, y, width, { columns: 1 });

  drawStatusBox(doc, service.statuses, left, y, width);
  doc.end();
}

module.exports = { generatePedigreeHomologationPDF };
