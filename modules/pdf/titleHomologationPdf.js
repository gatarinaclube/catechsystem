const {
  createServiceDoc,
  drawDocumentHeader,
  drawKeyValueBox,
  drawStatusBox,
  drawTextBox,
  formatDateBR,
  formatDateTimeBR,
} = require("./pdfTheme");

function parseCertificates(raw) {
  try {
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

async function generateTitleHomologationPDF(service, titleHomologation, cat, user, resStream) {
  const doc = createServiceDoc(resStream, "Homologacao de Titulo FIFe");
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let y = doc.y;

  drawDocumentHeader(doc, "HOMOLOGACAO DE TITULO FIFe", "Homologacao de Titulo FIFe");
  y = doc.y;

  y = drawKeyValueBox(doc, "DADOS DO SERVICO", [
    { label: "Codigo do servico", value: service.id },
    { label: "Tipo de servico", value: "Homologacao de Titulo FIFe" },
    { label: "Data da solicitacao", value: formatDateTimeBR(service.createdAt) },
    { label: "Associado", value: user?.name },
  ], left, y, width);

  y = drawKeyValueBox(doc, "DADOS DO GATO", [
    { label: "Nome", value: cat?.name },
    { label: "Raca", value: cat?.breed },
    { label: "Codigo EMS", value: cat?.emsCode },
    { label: "Registro", value: `${cat?.pedigreeType || ""} ${cat?.pedigreeNumber || ""}`.trim() || "-" },
  ], left, y, width);

  const certificates = parseCertificates(titleHomologation?.certificatesJson);
  const certificateLines = certificates.length
    ? certificates.map((cert, index) => (
      `Certificado ${index + 1}: ${cert.judge || "-"} - Data: ${formatDateBR(cert.date)}`
    ))
    : ["Nenhum certificado informado."];

  y = drawKeyValueBox(doc, "INFORMACOES DO TITULO", [
    { label: "Titulo solicitado", value: titleHomologation?.requestedTitle },
    { label: "Certificado(s) de titulo(s)", value: "ANEXADO(S) AO PROCESSO" },
  ], left, y, width);

  y = drawTextBox(doc, "CERTIFICADOS INFORMADOS", certificateLines, left, y, width, {
    fontSize: 7.2,
    lineHeight: 10,
  });

  drawStatusBox(doc, service.statuses, left, y, width);
  doc.end();
}

module.exports = { generateTitleHomologationPDF };
