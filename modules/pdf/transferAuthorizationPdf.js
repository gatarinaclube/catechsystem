const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");

/**
 * Gera o PDF "Autorização de Transferência de Propriedade" (modelo em branco).
 * Retorna um Buffer (para download direto no navegador).
 */
function generateTransferAuthorizationPDF() {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const buffers = [];
  doc.on("data", buffers.push.bind(buffers));

  const marginLeft = doc.page.margins.left;
  const usableWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  /* =======================
     CABEÇALHO (IGUAL)
  ======================= */
  const titleText = "AUTORIZAÇÃO DE TRANSFERÊNCIA";
  const titleY = doc.y;
  const centerX = marginLeft + usableWidth / 2;

  doc.fontSize(16).text(titleText, marginLeft, titleY, {
    width: usableWidth,
    align: "center",
  });

  // ---- LOGOS ----
  const logoSize = 36;
  const logoGap = 8;

  const logoLeft1 = "logos/logo1.png";
  const logoLeft2 = "logos/logo2.png";
  const logoRight = "logos/logo3.png";

  const logoY = titleY - 4;

  let leftX = centerX - 260;
  [logoLeft1, logoLeft2].forEach((relPath) => {
    const abs = path.join(__dirname, "../../public", relPath);
    if (fs.existsSync(abs)) {
      doc.image(abs, leftX, logoY, { width: logoSize, height: logoSize });
      leftX += logoSize + logoGap;
    }
  });

  const rightLogo = path.join(__dirname, "../../public", logoRight);
  if (fs.existsSync(rightLogo)) {
    doc.image(rightLogo, centerX + 180, logoY - 2, {
      width: logoSize + 40,
      height: logoSize + 6,
    });
  }

  doc.moveDown(0.8);

  doc.fontSize(11).text("Sistema CaTech / Gatarina Clube", { align: "center" });

  doc.moveDown(1);

  // Linha separadora
  doc
    .moveTo(marginLeft, doc.y)
    .lineTo(marginLeft + usableWidth, doc.y)
    .strokeColor("#cccccc")
    .stroke();

  doc.moveDown(1);

  /* =======================
     FUNÇÃO LINHA ALINHADA (IGUAL)
  ======================= */
  doc.font("Helvetica").fontSize(11);

  const lineAligned = (label) => {
    const startY = doc.y;

    doc.font("Helvetica-Bold").text(label, marginLeft, startY);

    const labelWidth = doc.widthOfString(label);
    const lineStartX = marginLeft + labelWidth + 6;
    const lineEndX = marginLeft + usableWidth;
    const lineY = startY + 11;

    doc
      .moveTo(lineStartX, lineY)
      .lineTo(lineEndX, lineY)
      .strokeColor("#000000")
      .stroke();

    doc.moveDown(0.9);
  };

  /* =======================
     CONTEÚDO
  ======================= */

  // --- DADOS DO GATO ---
  doc.fontSize(12).font("Helvetica-Bold").text("DADOS DO GATO");
  doc.moveDown(0.6);
  doc.font("Helvetica").fontSize(11);

  lineAligned("Nome:");
  lineAligned("Sexo:");
  lineAligned("Data de Nascimento:");
  lineAligned("Raça:");
  lineAligned("Cor:");
  lineAligned("EMS:");
  lineAligned("Microchip:");
  lineAligned("Registro FFB:");

  doc.moveDown(0.2);

  // --- STATUS (DESTAQUE) ---
  doc.font("Helvetica-Bold").fontSize(11).text("Status:", marginLeft, doc.y);

  // “checkboxes” visuais (círculo vazio) + texto
  const statusY = doc.y + 2;
  const r = 5;

  // posição base após "Status:"
  const statusLabelWidth = doc.widthOfString("Status:");
  let x = marginLeft + statusLabelWidth + 14;

// ( ) For Breeding
doc.circle(x, statusY + 6, r).stroke();
doc.font("Helvetica").text(" For Breeding", x + 10, statusY, { lineBreak: false });

// ( ) Not For Breeding
x += 170;
doc.circle(x, statusY + 6, r).stroke();
doc.font("Helvetica").text(" Not For Breeding", x + 10, statusY, { lineBreak: false });

doc.y = statusY + 22;
doc.moveDown(1.2);


  // --- VENDEDOR ---
  // --- VENDEDOR ---
doc.x = marginLeft; // 🔴 RESETAR alinhamento horizontal
doc.fontSize(12).font("Helvetica-Bold").text("VENDEDOR");

  doc.moveDown(0.6);
  doc.font("Helvetica").fontSize(11);

  lineAligned("Nome:");
  lineAligned("Gatil:");
  lineAligned("Email:");
  lineAligned("CPF:");

  doc.moveDown(0.6);

  // --- COMPRADOR ---
  doc.fontSize(12).font("Helvetica-Bold").text("COMPRADOR");
  doc.moveDown(0.6);
  doc.font("Helvetica").fontSize(11);

  lineAligned("Nome:");
  lineAligned("Gatil:");
  lineAligned("Email:");
  lineAligned("CPF:");

  doc.moveDown(1.2);

  // --- LOCAL E DATA ---
  const dateLabel = "Local e data:";
  const dateY = doc.y;

  doc.font("Helvetica-Bold").text(dateLabel, marginLeft, dateY);

  const dateLabelWidth = doc.widthOfString(dateLabel);
  const dateLineStartX = marginLeft + dateLabelWidth + 6;
  const dateLineEndX = marginLeft + usableWidth;
  const dateLineY = dateY + 11;

  doc
    .moveTo(dateLineStartX, dateLineY)
    .lineTo(dateLineEndX, dateLineY)
    .strokeColor("#000000")
    .stroke();

  doc.moveDown(4);

  /* =======================
     ASSINATURAS (2 COLUNAS)
  ======================= */
  const midX = marginLeft + usableWidth / 2;
  const gap = 20;
  const lineHalf = (usableWidth - gap) / 2;

  const ySign = doc.y + 10;

  // Linha vendedor
  doc
    .moveTo(marginLeft, ySign)
    .lineTo(marginLeft + lineHalf, ySign)
    .strokeColor("#000000")
    .stroke();

  // Linha comprador
  doc
    .moveTo(midX + gap / 2, ySign)
    .lineTo(midX + gap / 2 + lineHalf, ySign)
    .strokeColor("#000000")
    .stroke();

  doc.moveDown(0.8);

  doc.font("Helvetica").fontSize(11);

  // Texto assinaturas centralizados em cada metade
  doc.text("Assinatura do Vendedor", marginLeft, doc.y, {
    width: lineHalf,
    align: "center",
  });

  doc.text("Assinatura do Comprador", midX + gap / 2, doc.y - 13, {
    width: lineHalf,
    align: "center",
  });

  doc.moveDown(1,2);

  doc
  .font("Helvetica-Oblique")
  .fontSize(9)
  .fillColor("#555555")
  .text(
    "Este documento não é válido como uma transferência, serve apenas como autorização para ser realizada a solicitação de transferência de propriedade.",
    marginLeft,
    doc.y,
    {
      width: usableWidth,
      align: "center",
    }
  );

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
  });
}

module.exports = { generateTransferAuthorizationPDF };
