const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");

async function generateTitleHomologationPDF(
  service,
  titleHomologation,
  cat,
  user,
  resStream
) {
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(resStream);

  const marginLeft = doc.page.margins.left;
  const usableWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // 🎨 CORES GATARINA
  const COLOR_GREEN = "#1f7a3f";

  /* =======================
     CABEÇALHO
  ======================= */
  const titleText = "HOMOLOGAÇÃO DE TÍTULO FIFe";
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
  doc.font("Helvetica").text("Homologação de Título FIFe");

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

  doc.font("Helvetica-Bold").text("Registro: ", { continued: true });
  doc.font("Helvetica").text(
    `${cat.pedigreeType || ""} ${cat.pedigreeNumber || ""}`.trim() || "-"
  );

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
   INFORMAÇÕES DO TÍTULO
======================= */
doc
  .font("Helvetica-Bold")
  .fontSize(11)
  .fillColor(COLOR_GREEN)
  .text("INFORMAÇÕES DO TÍTULO")
  .fillColor("black")
  .moveDown(0.3);

const boxTitleTop = doc.y;
doc.fontSize(10);

// Título solicitado
doc.font("Helvetica-Bold").text("Título solicitado: ", { continued: true });
doc.font("Helvetica").text(titleHomologation.requestedTitle || "-");

doc.moveDown(0.4);

// Certificados (juiz + data)
let certificates = [];
try {
  certificates = titleHomologation.certificatesJson
    ? JSON.parse(titleHomologation.certificatesJson)
    : [];
} catch (err) {
  certificates = [];
}

if (certificates.length === 0) {
  doc.font("Helvetica").text("Nenhum certificado informado.");
} else {
  certificates.forEach((cert, index) => {
    const dateFormatted = cert.date
      ? new Date(cert.date).toLocaleDateString("pt-BR")
      : "-";

    doc
      .font("Helvetica-Bold")
      .text(`Certificado ${index + 1}: `, { continued: true });

    doc
      .font("Helvetica")
      .text(cert.judge || "-", { continued: true });

    doc
      .font("Helvetica-Bold")
      .text(" – Data: ", { continued: true });

    doc
      .font("Helvetica")
      .text(dateFormatted);

    doc.moveDown(0.4);
  });
}



const boxTitleBottom = doc.y;
doc
  .rect(
    marginLeft - 5,
    boxTitleTop - 5,
    usableWidth + 10,
    boxTitleBottom - boxTitleTop + 10
  )
  .stroke();

doc.moveDown(1);

doc
    .moveDown(0.2)
    .font("Helvetica-Oblique")
    .fontSize(9)
    .fillColor("#555555")
    .text("Certificado(s) de Título(s): ANEXADO(S) AO PROCESSO")
    .fillColor("black")
    .fontSize(10)
    .font("Helvetica");

/* ================================
   LINHA DO TEMPO DE STATUS
================================ */
doc
  .font("Helvetica-Bold")
  .fontSize(11)
  .fillColor(COLOR_GREEN)
  .text("LINHA DO TEMPO DE STATUS", marginLeft, doc.y, {
    align: "left",
  })
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
  doc
    .font("Helvetica")
    .fontSize(10)
    .text("Nenhum status registrado até o momento.", marginLeft, doc.y);
} else {
  service.statuses.forEach((st, index) => {
    const dt = st.createdAt.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });

    doc
      .font("Helvetica")
      .fontSize(10)
      .text(
        `${index + 1}. ${mapStatus[st.status] || st.status} - ${dt}`,
        marginLeft,
        doc.y
      );
  });
}

doc.moveDown(0.5);



  doc.end();
}

module.exports = { generateTitleHomologationPDF };
