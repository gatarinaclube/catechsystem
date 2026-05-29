const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const { applyPdfTheme } = require("./pdfTheme");

/**
 * Gera o PDF do Pedido de Transferência
 * Usado por ADMIN (ZIP) e USER (download direto)
 */
async function generateTransferPDF(service, transfer, cat, user, resStream) {
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(resStream);
  applyPdfTheme(doc);

  const marginLeft = doc.page.margins.left;
  const usableWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // 🎨 Cores institucionais Gatarina
  const COLOR_GREEN = "#1f7a3f";

  /* =======================
     CABEÇALHO COM LOGOS
  ======================= */
  const titleText = "PEDIDO DE TRANSFERÊNCIA";
  const titleY = doc.y;
  const centerX = marginLeft + usableWidth / 2;

  doc
    .fontSize(16)
    .text(titleText, marginLeft, titleY, {
      width: usableWidth,
      align: "center",
    });

  // ---- CONFIG LOGOS ----
  const logoSize = 36;
  const logoGap = 8;

  const logoLeft1 = "logos/logo1.png";
  const logoLeft2 = "logos/logo2.png";
  const logoRight = "logos/logo3.png";

  const logoY = titleY - 4;

  // Logos à esquerda
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

  // Logo à direita
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

  const headTop = doc.y;
  doc.fontSize(11);

  doc.font("Helvetica-Bold").text("Código do serviço: ", { continued: true });
  doc.font("Helvetica").text(service.id);

  doc.font("Helvetica-Bold").text("Tipo de serviço: ", { continued: true });
  doc.font("Helvetica").text("Transferência de Propriedade - TRA");

  doc.font("Helvetica-Bold").text("Data da solicitação: ", { continued: true });
  doc.font("Helvetica").text(createdBR);

  doc.font("Helvetica-Bold").text("Associado: ", { continued: true });
  doc.font("Helvetica").text(user.name);

  const headBottom = doc.y;
  doc
    .rect(
      marginLeft - 5,
      headTop - 5,
      usableWidth + 10,
      headBottom - headTop + 10
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

  const boxTop = doc.y;
  doc.font("Helvetica").fontSize(10);

  const regNumber =
    `${cat.pedigreeType || ""} ${cat.pedigreeNumber || ""}`.trim() || "-";

  const birthD = cat.birthDate
    ? `${String(cat.birthDate.getUTCDate()).padStart(2, "0")}/${String(
        cat.birthDate.getUTCMonth() + 1
      ).padStart(2, "0")}/${cat.birthDate.getUTCFullYear()}`
    : "-";

  doc.font("Helvetica-Bold").text("Nome do gato: ", { continued: true });
  doc.font("Helvetica").text(cat.name || "-");

  doc.font("Helvetica-Bold").text("Registro: ", { continued: true });
  doc.font("Helvetica").text(regNumber);

  const breedEmsText = [
  cat.breed,
  cat.emsCode
].filter(Boolean).join(" ");

doc.font("Helvetica-Bold").text("Raça, EMS e Cor: ", { continued: true });
doc.font("Helvetica").text(breedEmsText || "-");

  doc.font("Helvetica-Bold").text("Microchip: ", { continued: true });
  doc.font("Helvetica").text(cat.microchip || "-");

  const genderText =
  cat.gender === "M"
    ? "Macho"
    : cat.gender === "F"
    ? "Fêmea"
    : "-";

doc.font("Helvetica-Bold").text("Sexo: ", { continued: true });
doc.font("Helvetica").text(genderText);

  doc.font("Helvetica-Bold").text("Data de nascimento: ", { continued: true });
  doc.font("Helvetica").text(birthD);

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
     INFORMAÇÕES DE TRANSFERÊNCIA
  ======================= */
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLOR_GREEN)
    .text("INFORMAÇÕES DE TRANSFERÊNCIA")
    .fillColor("black")
    .moveDown(0.3);

  const box2Top = doc.y;
  doc.font("Helvetica").fontSize(10);

  const breedingText =
  transfer.breedingStatus === "BREEDING"
    ? "For Breeding"
    : "Not For Breeding";

doc.font("Helvetica-Bold").text("Uso para reprodução: ", { continued: true });
doc.font("Helvetica").text(breedingText);

doc.font("Helvetica-Bold").text("Proprietário atual: ", { continued: true });
doc.font("Helvetica").text(transfer.oldOwnerName || "-");

doc.font("Helvetica-Bold").text("Novo proprietário: ", { continued: true });
doc.font("Helvetica").text(transfer.newOwnerName || "-");

// AUTORIZAÇÃO DE TRANSFERÊNCIA (SOMENTE QUANDO ANTIGO PROPRIETÁRIO = OUTRO)
if (transfer.authorizationFile) {
  doc
    .moveDown(0.2)
    .font("Helvetica-Oblique")
    .fontSize(9)
    .fillColor("#555555")
    .text("Autorização de Transferência: ANEXADA AO PROCESSO")
    .fillColor("black")
    .fontSize(10)
    .font("Helvetica");
}


const memberText =
  transfer.memberType === "FIFE" ? "Sim" : "Não";

// MOSTRA MEMBRO FIFe APENAS SE ANTIGO PROPRIETÁRIO FOR "EU MESMO"
if (transfer.memberType) {
  doc.font("Helvetica-Bold").text("Membro FIFe: ", { continued: true });
  doc.font("Helvetica").text(
    transfer.memberType === "FIFE"
      ? "Sim"
      : "Não"
  );
}


  if (transfer.memberType === "NAO_FIFE") {
    doc.moveDown(0.3);
 
    [
      ["Endereço", transfer.address],
      ["Bairro", transfer.district],
      ["Cidade", transfer.city],
      ["Estado", transfer.state],
      ["CEP", transfer.cep],
      ["Telefone", transfer.phone],
      ["E-mail", transfer.email],
    ].forEach(([label, value]) => {
      doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
      doc.font("Helvetica").text(value || "-");
    });
  }

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

  /* ================================
     LINHA DO TEMPO (PADRÃO MAPA)
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
    .text(
      "Nenhum status registrado até o momento.",
      marginLeft,
      doc.y
    );
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

  doc.end();
}

module.exports = { generateTransferPDF };
