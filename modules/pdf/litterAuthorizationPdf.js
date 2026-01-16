const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");

/**
 * Gera o PDF "Autorização Registro Ninhada" (modelo em branco).
 * Retorna um Buffer (para download direto no navegador).
 */
function generateLitterAuthorizationPDF() {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const buffers = [];
  doc.on("data", buffers.push.bind(buffers));

  const marginLeft = doc.page.margins.left;
  const usableWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  /* =======================
     CABEÇALHO
  ======================= */
  const titleText = "AUTORIZAÇÃO REGISTRO NINHADA";
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
      doc.image(abs, leftX, logoY, {
        width: logoSize,
        height: logoSize,
      });
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

  doc.fontSize(11).text("Sistema CaTech / Gatarina Clube", {
    align: "center",
  });

  doc.moveDown(1);

  // Linha separadora
  doc
    .moveTo(marginLeft, doc.y)
    .lineTo(marginLeft + usableWidth, doc.y)
    .strokeColor("#cccccc")
    .stroke();

  doc.moveDown(1);

  /* =======================
     CONTEÚDO
  ======================= */
  doc.fontSize(12).font("Helvetica-Bold").text("DADOS DO MACHO");
  doc.moveDown(0.6);

  doc.font("Helvetica").fontSize(11);

const lineAligned = (label) => {
  const startY = doc.y;

  // Texto do rótulo
  doc.font("Helvetica-Bold").text(label, marginLeft, startY);

  // Largura do texto do rótulo
  const labelWidth = doc.widthOfString(label);

  // Posição inicial da linha (um pequeno espaço após o texto)
  const lineStartX = marginLeft + labelWidth + 6;

  // Posição final da linha (sempre alinhada à direita)
  const lineEndX = marginLeft + usableWidth;

  // Altura da linha (centralizada com o texto)
  const lineY = startY + 11;

  // Desenhar linha
  doc
    .moveTo(lineStartX, lineY)
    .lineTo(lineEndX, lineY)
    .strokeColor("#000000")
    .stroke();

  // Espaçamento vertical entre campos (MAIOR que antes)
  doc.moveDown(0.9);
};

  lineAligned("Nome:");
lineAligned("Raça:");
lineAligned("Cor:");
lineAligned("EMS:");
lineAligned("Microchip:");
lineAligned("Registro FFB:");


  doc.moveDown(0.8);

  doc.fontSize(12).font("Helvetica-Bold").text("DADOS DO PROPRIETÁRIO");
  doc.moveDown(0.6);

  doc.font("Helvetica").fontSize(11);
lineAligned("Nome:");
lineAligned("Gatil:");
lineAligned("Email:");
lineAligned("CPF:");

  doc.moveDown(3);


doc
  .font("Helvetica")
  .fontSize(11)
  .text(
    "Autorizo o registro de ninhada conforme informações descritas neste documento, com a fêmea:",
    {
      align: "left",
    }
  );

  doc.moveDown(0.6);


  doc.font("Helvetica").fontSize(11);
  lineAligned("Nome da Fêmea:");

  doc.moveDown(1.2);




// Local e data
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

  doc.moveDown(5);

  // Assinatura
  const signY = doc.y + 10;
  doc
    .moveTo(marginLeft + 60, signY)
    .lineTo(marginLeft + usableWidth - 60, signY)
    .strokeColor("#000000")
    .stroke();

  doc.moveDown(0.8);
  doc.font("Helvetica").fontSize(11).text("Assinatura do Proprietário", {
    align: "center",
  });

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
  });
}

module.exports = { generateLitterAuthorizationPDF };
