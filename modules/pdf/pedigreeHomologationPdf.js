const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");

async function generatePedigreeHomologationPDF(
  service,
  pedigreeHomologation,
  cat,
  user,
  resStream
) {
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(resStream);

  const marginLeft = doc.page.margins.left;
  const usableWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const COLOR_GREEN = "#1f7a3f";

  /* =======================
     CABEÇALHO
  ======================= */
  const titleText = "HOMOLOGAÇÃO DE PEDIGREE FIFe";
  const titleY = doc.y;
  const centerX = marginLeft + usableWidth / 2;

  doc.fontSize(16).text(titleText, marginLeft, titleY, {
    width: usableWidth,
    align: "center",
  });

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

  doc.moveDown(2);

  /* =======================
     DADOS DO SERVIÇO
  ======================= */
  const createdBR = service.createdAt.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  const boxTop = doc.y;
  doc.fontSize(11);

  doc.font("Helvetica-Bold").text("Código do serviço: ", { continued: true });
  doc.font("Helvetica").text(service.id);

  doc.font("Helvetica-Bold").text("Tipo de serviço: ", { continued: true });
  doc.font("Helvetica").text("Homologação de Pedigree");

  doc.font("Helvetica-Bold").text("Data da solicitação: ", { continued: true });
  doc.font("Helvetica").text(createdBR);

  doc.font("Helvetica-Bold").text("Associado: ", { continued: true });
  doc.font("Helvetica").text(user.name);

  const boxBottom = doc.y;
  doc
    .rect(
      marginLeft - 5,
      boxTop - 5,
      usableWidth + 10,
      boxBottom - boxTop + 10
    )
    .stroke();

  doc.moveDown(1);

  /* =======================
     DADOS DO GATO
  ======================= */
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLOR_GREEN)
    .text("DADOS DO GATO")
    .fillColor("black")
    .moveDown(0.3);

  const box2Top = doc.y;
  doc.fontSize(10);

  doc.font("Helvetica-Bold").text("Nome: ", { continued: true });
  doc.font("Helvetica").text(cat.name || "-");

  doc.font("Helvetica-Bold").text("Raça: ", { continued: true });
  doc.font("Helvetica").text(cat.breed || "-");

  doc.font("Helvetica-Bold").text("Código EMS: ", { continued: true });
  doc.font("Helvetica").text(cat.emsCode || "-");

  const box2Bottom = doc.y;
  doc
    .rect(
      marginLeft - 5,
      box2Top - 5,
      usableWidth + 10,
      box2Bottom - box2Top + 10
    )
    .stroke();

  doc.moveDown(1);

  /* =======================
     INFORMAÇÕES DO PEDIGREE
  ======================= */
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLOR_GREEN)
    .text("INFORMAÇÕES DO PEDIGREE")
    .fillColor("black")
    .moveDown(0.3);

  const box3Top = doc.y;
  doc.fontSize(10);

  doc.font("Helvetica-Bold").text("Tipo de homologação: ", { continued: true });
  doc.font("Helvetica").text(pedigreeHomologation.homologationType || "-");

  const box3Bottom = doc.y;
  doc
    .rect(
      marginLeft - 5,
      box3Top - 5,
      usableWidth + 10,
      box3Bottom - box3Top + 10
    )
    .stroke();

  doc.moveDown(1);

  /* ================================
     LINHA DO TEMPO DE STATUS
  ================================ */
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLOR_GREEN)
    .text("LINHA DO TEMPO DE STATUS")
    .fillColor("black")
    .moveDown(0.3);

  const mapStatus = {
    ENVIADO_GATARINA: "Enviado para Gatarina",
    COM_PENDENCIA: "Serviço com Pendência",
    ENVIADO_FFB: "Enviado para FFB",
    RECEBIDO_FFB: "Recebido da FFB",
    ENVIADO_ASSOCIADO: "Enviado ao Associado",
  };

  if (!service.statuses || service.statuses.length === 0) {
    doc.fontSize(10).text("Nenhum status registrado até o momento.");
  } else {
    service.statuses.forEach((st, index) => {
      const dt = st.createdAt.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      });

      doc.fontSize(10).text(
        `${index + 1}. ${mapStatus[st.status] || st.status} - ${dt}`
      );
    });
  }

  doc.end();
}

module.exports = { generatePedigreeHomologationPDF };
