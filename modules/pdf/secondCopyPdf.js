const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const { applyPdfTheme } = require("./pdfTheme");

/* ============================================================
   CORES INSTITUCIONAIS
============================================================ */
const COLOR_GREEN = "#1f7a3f";
const COLOR_RED = "#b71c1c";

/* ============================================================
   CABEÇALHO PADRÃO (IGUAL AOS DEMAIS PDFs)
============================================================ */
function drawHeader(doc, service) {
  const marginLeft = doc.page.margins.left;
  const usableWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const title = "SEGUNDA VIA E ALTERAÇÕES";

  const titleY = doc.y;
  doc
    .fontSize(16)
    .text(title, marginLeft, titleY, {
      width: usableWidth,
      align: "center",
    });

  doc.moveDown(0.6);

  doc.fontSize(11).text("Sistema CaTech / Gatarina Clube", {
    align: "center",
  });

  doc.moveDown(1);

  const createdAtBR = service.createdAt.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  const top = doc.y;

  doc.fontSize(10);

  doc.font("Helvetica-Bold").text("Código do Serviço: ", { continued: true });
  doc.font("Helvetica").text(service.id);

  doc.font("Helvetica-Bold").text("Tipo de Serviço: ", { continued: true });
  doc.font("Helvetica").text(service.type);

  doc.font("Helvetica-Bold").text("Data da Solicitação: ", { continued: true });
  doc.font("Helvetica").text(createdAtBR);

  doc.font("Helvetica-Bold").text("Solicitante: ", { continued: true });
  doc.font("Helvetica").text(service.user.name);

  const bottom = doc.y;

  doc
    .rect(
      marginLeft - 5,
      top - 5,
      usableWidth + 10,
      bottom - top + 10
    )
    .stroke();

  doc.moveDown(1);
}

/* ============================================================
   QUADRO PADRÃO
============================================================ */
function drawBox(doc, title, lines = []) {
  const marginLeft = doc.page.margins.left;
  const usableWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLOR_GREEN)
    .text(title)
    .fillColor("black")
    .moveDown(0.3);

  const top = doc.y;

  doc.font("Helvetica").fontSize(10);

  lines.forEach(line => {
    doc.text(line);
  });

  const bottom = doc.y;

  doc
    .rect(
      marginLeft - 5,
      top - 5,
      usableWidth + 10,
      bottom - top + 10
    )
    .stroke();

  doc.moveDown(0.8);
}

/* ============================================================
   INFORMAÇÕES DO GATO
============================================================ */
function drawCatInfo(doc, cat) {
  drawBox(doc, "INFORMAÇÕES DO GATO", [
    `Nome do Gato: ${cat.name || "-"}`,
    `Registro FFB: ${(cat.pedigreeType || "-")} ${(cat.pedigreeNumber || "")}`,
    `Sexo: ${cat.gender === "M" ? "Macho" : cat.gender === "F" ? "Fêmea" : "-"}`,
    `Microchip: ${cat.microchip || "-"}`,
    `Raça: ${cat.breed || "-"}`,
    `Cor e EMS: ${cat.emsCode || "-"}`,
  ]);
}

/* ============================================================
   LINHA DO TEMPO (STATUS)
============================================================ */
function drawStatusTimeline(doc, statuses) {
  const mapStatus = {
    ENVIADO_GATARINA: "Enviado para Gatarina",
    COM_PENDENCIA: "Serviço com Pendência",
    ENVIADO_FFB: "Enviado para FFB",
    RECEBIDO_FFB: "Recebido da FFB",
    ENVIADO_ASSOCIADO: "Enviado ao Associado",
  };

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("LINHA DO TEMPO DE STATUS")
    .moveDown(0.3);

  statuses.forEach((st, index) => {
    const dt = st.createdAt.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });

    doc
      .font("Helvetica")
      .fontSize(10)
      .text(`${index + 1}. ${mapStatus[st.status] || st.status} - ${dt}`);
  });
}

/* ============================================================
   CONTEÚDO PRINCIPAL (SWITCH POR requestType)
============================================================ */
function drawSecondCopyContent(doc, service, secondCopy, cat) {
  const type = secondCopy.requestType;

  // 🔹 Serviços COM gato
  const servicesWithCat = [
    "PEDIGREE_SECOND_COPY",
    "TITLE_DIPLOMA_SECOND_COPY",
    "OWNERSHIP_DOC_SECOND_COPY",
    "CHANGE_TO_NOT_BREEDING",
    "CHANGE_TO_BREEDING",
    "CHANGE_COLOR",
    "FIX_MICROCHIP",
    "FIX_SEX",
  ];

  if (servicesWithCat.includes(type)) {
    drawCatInfo(doc, cat);
  }

  // ================= SERVIÇO =================
  let lines = [];

  switch (type) {
    case "PEDIGREE_SECOND_COPY":
      lines.push("Serviço Solicitado: Segunda Via de Pedigree");
      break;

    case "TITLE_DIPLOMA_SECOND_COPY":
      lines.push("Serviço Solicitado: Segunda Via de Título");
      if (secondCopy.details) lines.push(`Informações: ${secondCopy.details}`);
      break;

    case "OWNERSHIP_DOC_SECOND_COPY":
      lines.push("Serviço Solicitado: Segunda Via de Propriedade");
      break;

    case "CHANGE_TO_NOT_BREEDING":
      lines.push("Serviço Solicitado: Mudança de For Breeding para Not For Breeding");
      break;

    case "CHANGE_TO_BREEDING":
      lines.push("Serviço Solicitado: Mudança de Not For Breeding para For Breeding");
      if (secondCopy.details) lines.push(`Justificativa: ${secondCopy.details}`);
      break;

    case "CHANGE_COLOR":
      lines.push("Serviço Solicitado: Mudança de Cor");
      lines.push(`Nova Cor / EMS: ${secondCopy.newValue || "-"}`);
      if (secondCopy.details) lines.push(`Justificativa: ${secondCopy.details}`);
      lines.push("Justificativa de Mudança ou Súmula: ANEXADA AO PROCESSO");
      break;

    case "FIX_MICROCHIP":
      lines.push("Serviço Solicitado: Correção de Microchip");
      lines.push(`Novo Microchip: ${secondCopy.newValue || "-"}`);
      lines.push("Novo Certificado de Microchip ou Atestado Veterinário: ANEXADO AO PROCESSO");
      break;

    case "FIX_SEX":
      lines.push("Serviço Solicitado: Correção de Sexo");
      if (secondCopy.details) lines.push(`Justificativa: ${secondCopy.details}`);
      break;

    case "CATTERY_SECOND_COPY":
      drawBox(doc, "INFORMAÇÕES DO SOLICITANTE", [
        `Nome do Solicitante: ${service.user.name}`,
      ]);
      lines.push("Serviço Solicitado: Segunda Via de Registro de Gatil");
      lines.push(`Nome do Gatil: ${service.user.fifeCatteryName || "-"}`);
      break;

    case "OTHER":
      drawBox(doc, "INFORMAÇÕES DO SOLICITANTE", [
        `Nome do Solicitante: ${service.user.name}`,
      ]);
      lines.push("Serviço Solicitado: Outros");
      if (secondCopy.details) lines.push(`Descrição: ${secondCopy.details}`);
      break;
  }

  drawBox(doc, "INFORMAÇÕES DO SERVIÇO", lines);
}

/* ============================================================
   GERADOR ÚNICO (ADMIN E USER)
============================================================ */
async function generateSecondCopyPDF(service, secondCopy, cat, output) {
  const isResponse = typeof output.setHeader === "function";

  if (isResponse) {
    output.setHeader("Content-Type", "application/pdf");
    output.setHeader(
      "Content-Disposition",
      `attachment; filename=servico-${service.id}.pdf`
    );
  }

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(output);
  applyPdfTheme(doc);

  drawHeader(doc, service);
  drawSecondCopyContent(doc, service, secondCopy, cat);
  drawStatusTimeline(doc, service.statuses);

  doc.end();
}

module.exports = {
  generateSecondCopyPDF,
};
