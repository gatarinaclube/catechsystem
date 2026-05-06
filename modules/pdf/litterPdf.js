const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const archiver = require("archiver");

// 🔤 Converte texto para "Title Case"
// Ex: "TOMIFERR BENGAL" → "Tomiferr Bengal"
function toTitleCase(text) {
  if (!text || typeof text !== "string") return text;

  return text
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map(
      word => word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

/* ============================================================================
   FUNÇÃO BASE — DESENHA O CONTEÚDO DO PDF (USADO PELO ADMIN E PELO USER)
============================================================================ */
function drawLitterPdfContent(doc, service, litter, kittens, sire, dam) {
  const marginLeft = doc.page.margins.left;
  const usableWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // 🎨 Cores institucionais Gatarina
const COLOR_GREEN = "#1f7a3f";
const COLOR_RED = "#b71c1c";
const COLOR_LIGHT_BG = "#fafafa";
const COLOR_TABLE_HEADER = "#eeeeee";

/* =======================
   CABEÇALHO COM LOGOS
======================= */
const titleText = "MAPA DE REGISTRO DE NINHADA";

// posição Y base do título
const titleY = doc.y;

// centro horizontal da área útil
const centerX = marginLeft + usableWidth / 2;

// desenha o título centralizado
doc
  .fontSize(16)
  .text(titleText, marginLeft, titleY, {
    width: usableWidth,
    align: "center",
  });

const titleLineY = doc.y;

// ----- CONFIG LOGOS -----
const logoSize = 36;
const logoGap = 8;

// caminhos relativos
const logoLeft1 = "logos/logo1.png";
const logoLeft2 = "logos/logo2.png";
const logoRight = "logos/logo3.png";

// Y das logos (alinhadas verticalmente ao título)
const logoY = titleY - 4;

// ---- LOGOS À ESQUERDA DO TÍTULO ----
let leftX = centerX - 260; // distância segura do centro para a esquerda

[logoLeft1, logoLeft2].forEach((relPath) => {
  const absPath = path.join(__dirname, "../../public", relPath);
  if (fs.existsSync(absPath)) {
    doc.image(absPath, leftX, logoY, {
      width: logoSize,
      height: logoSize,
    });
    leftX += logoSize + logoGap;
  }
});

// ---- LOGO À DIREITA DO TÍTULO ----
const rightLogoPath = path.join(__dirname, "../../public", logoRight);
if (fs.existsSync(rightLogoPath)) {
  const rightX = centerX + 180; // mantém controle da distância
  doc.image(rightLogoPath, rightX, logoY - 2, {
    width: logoSize + 40,   // 🔹 aumenta só o da direita
    height: logoSize + 6,
  });
}

doc.moveDown(0.8);


// Cabeçalho adicional
doc.fontSize(11).text("Sistema CaTech / Gatarina Clube", {
  align: "center",
});

doc.moveDown(1);


  const createdAtBR = service.createdAt.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  const headTop = doc.y;
  doc.fontSize(11);

  doc
    .font("Helvetica-Bold")
    .text("Código do Serviço: ", { continued: true })
    .font("Helvetica")
    .text(service.id);
    
  doc
    .font("Helvetica-Bold")
    .text("Tipo de Serviço: ", { continued: true })
    .font("Helvetica")
    .text("Registro de Ninhada - LO");

  doc
    .font("Helvetica-Bold")
    .text("Data da Solicitação: ", { continued: true })
    .font("Helvetica")
    .text(createdAtBR);

  doc
    .font("Helvetica-Bold")
    .text("Nome: ", { continued: true })
    .font("Helvetica")
    .text(service.user.name);

  doc
    .font("Helvetica-Bold")
    .text("E-mail: ", { continued: true })
    .font("Helvetica")
    .text(service.user.email);

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

// =========================
// DADOS DO MACHO + FÊMEA + NASCIMENTO
// =========================
if (litter) {
  // -------- MACHO --------
  const maleFfbDisplay = sire
    ? (`${sire.pedigreeType || ""} ${sire.pedigreeNumber || ""}`.trim() || "-")
    : litter.maleFfbLo || "-";

doc
  .font("Helvetica-Bold")
  .fontSize(11)
  .fillColor(COLOR_GREEN)
  .text("DADOS DO MACHO")
  .fillColor("black")
  .moveDown(0.3);


  const machoTop = doc.y;
  doc.font("Helvetica").fontSize(10);

doc.font("Helvetica-Bold").text("Nome: ", { continued: true });
doc.font("Helvetica").text(litter.maleName || "-");

doc.font("Helvetica-Bold").text("Microchip: ", { continued: true });
doc.font("Helvetica").text(litter.maleMicrochip || "-");

doc.font("Helvetica-Bold").text("Registro FFB: ", { continued: true });
doc.font("Helvetica").text(maleFfbDisplay);

doc.font("Helvetica-Bold").text("Raça: ", { continued: true });
doc.font("Helvetica").text(litter.maleBreed || "-");

doc.font("Helvetica-Bold").text("Cód. EMS: ", { continued: true });
doc.font("Helvetica").text(litter.maleEms || "-");

  const machoBottom = doc.y;
  doc
    .rect(
      marginLeft - 5,
      machoTop - 5,
      usableWidth + 10,
      machoBottom - machoTop + 10
    )
    .stroke();

  doc.moveDown(0.8);


// =====================================================
// PROPRIEDADE DO MACHO (SOMENTE SE INFORMADO)
// =====================================================
if (litter.maleOwnership === "NOT_OWNER") {
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLOR_GREEN)
    .text("PROPRIEDADE DO MACHO")
    .fillColor("black")
    .moveDown(0.3);

  const propTop = doc.y;
  doc.font("Helvetica").fontSize(10);

  // ---- INFORMAÇÕES DO PROPRIETÁRIO ----

  doc.font("Helvetica-Bold").text("Proprietário: ", { continued: true });
  doc.font("Helvetica").text(litter.externalOwnerName || "-");

  doc.font("Helvetica-Bold").text("E-mail: ", { continued: true });
  doc.font("Helvetica").text(litter.externalOwnerEmail || "-");

  doc.font("Helvetica-Bold").text("Gatil: ", { continued: true });
  doc.font("Helvetica").text(litter.externalOwnerCattery || "-");

  doc.font("Helvetica-Bold").text("CPF: ", { continued: true });
  doc.font("Helvetica").text(litter.externalOwnerCpf || "-");

  doc.font("Helvetica-Bold").text("Telefone: ", { continued: true });
  doc.font("Helvetica").text(litter.externalOwnerPhone || "-");

  if (litter.externalOwnerAuthorization) {
  doc
    .font("Helvetica-Oblique")
    .fontSize(9)
    .fillColor("#555555")
    .text("Autorização de reprodução do macho: ANEXADA AO PROCESSO")
    .fillColor("black");
}

  const propBottom = doc.y;
  doc
    .rect(
      marginLeft - 5,
      propTop - 5,
      usableWidth + 10,
      propBottom - propTop + 10
    )
    .stroke();

  doc.moveDown(0.8);
}

  // -------- FÊMEA --------
  const femaleFfbDisplay = dam
    ? (`${dam.pedigreeType || ""} ${dam.pedigreeNumber || ""}`.trim() || "-")
    : litter.femaleFfbLo || "-";


    doc
  .font("Helvetica-Bold")
  .fontSize(11)
  .fillColor(COLOR_GREEN)
  .text("DADOS DA FÊMEA")
  .fillColor("black")
  .moveDown(0.3);

  const femeaTop = doc.y;
  doc.font("Helvetica").fontSize(10);

doc.font("Helvetica-Bold").text("Nome: ", { continued: true });
doc.font("Helvetica").text(dam?.name || litter.femaleName || "-");

doc.font("Helvetica-Bold").text("Microchip: ", { continued: true });
doc.font("Helvetica").text(dam?.microchip || litter.femaleMicrochip || "-");

doc.font("Helvetica-Bold").text("Registro FFB: ", { continued: true });
doc.font("Helvetica").text(femaleFfbDisplay);

doc.font("Helvetica-Bold").text("Raça: ", { continued: true });
doc.font("Helvetica").text(dam?.breed || litter.femaleBreed || "-");

doc.font("Helvetica-Bold").text("Cód. EMS: ", { continued: true });
doc.font("Helvetica").text(dam?.emsCode || litter.femaleEms || "-");

  const femeaBottom = doc.y;
  doc
    .rect(
      marginLeft - 5,
      femeaTop - 5,
      usableWidth + 10,
      femeaBottom - femeaTop + 10
    )
    .stroke();

  doc.moveDown(0.8);

  // -------- NASCIMENTO --------
doc
  .font("Helvetica-Bold")
  .fontSize(11)
  .fillColor(COLOR_GREEN)
  .text("DADOS DE NASCIMENTO")
  .fillColor("black")
  .moveDown(0.3);


  const nascTop = doc.y;
  doc.font("Helvetica").fontSize(10);

  let birthDateText = "-";
  if (litter.litterBirthDate) {
    const d = litter.litterBirthDate;
    birthDateText = `${String(d.getUTCDate()).padStart(2, "0")}/${String(
      d.getUTCMonth() + 1
    ).padStart(2, "0")}/${d.getUTCFullYear()}`;
  }

doc.font("Helvetica-Bold").text("Gatil: ", { continued: true });
doc.font("Helvetica").text(litter.catteryName || "-");

doc.font("Helvetica-Bold").text("País: ", { continued: true });
doc.font("Helvetica").text(litter.catteryCountry || "-");

doc.font("Helvetica-Bold").text("Nº De Filhotes: ", { continued: true });
doc.font("Helvetica").text(litter.litterCount || "-");

doc.font("Helvetica-Bold").text("Data De Nascimento: ", { continued: true });
doc.font("Helvetica").text(birthDateText);

  const nascBottom = doc.y;
  doc
    .rect(
      marginLeft - 5,
      nascTop - 5,
      usableWidth + 10,
      nascBottom - nascTop + 10
    )
    .stroke();

  doc.moveDown(1);
}

/* ================================
   TABELA FILHOTES (ZEBRADA)
================================ */
  doc
  .font("Helvetica-Bold")
  .fontSize(11)
  .fillColor(COLOR_GREEN)
  .text("DADOS DOS FILHOTES")
  .fillColor("black")
  .moveDown(0.3);

const tableLeft = marginLeft;

const colWidths = {
  n: 18,
  name: 200,
  sex: 50,
  micro: 120,
  breeding: usableWidth - (18 + 200 + 50 + 120) - 2,
};

const headerY = doc.y + 2;
let x = tableLeft;

// ===== CABEÇALHO =====
doc.font("Helvetica-Bold");

doc.text("Nº", x, headerY, { width: colWidths.n });
x += colWidths.n;

doc.text("Nome do Filhote", x, headerY, { width: colWidths.name });
x += colWidths.name;

doc.text("Sexo", x, headerY, { width: colWidths.sex });
x += colWidths.sex;

doc.text("Microchip", x, headerY, { width: colWidths.micro });
x += colWidths.micro;

doc.text("Breeding?", x, headerY, {
  width: colWidths.breeding,
});

doc.font("Helvetica");

// ===== DADOS =====
let rowY = headerY + 16;

// nome do gatil (uma vez só, fora do loop)
const catteryName = (litter?.catteryName || "").trim();

// ✅ LIMITAR FILHOTES PELO Nº INFORMADO EM litter.litterCount
const litterCountLimit = Number.isFinite(Number(litter?.litterCount))
  ? parseInt(litter.litterCount, 10)
  : null;

// ordena por índice e corta pelo limite (se houver)
const kittensToRender = Array.isArray(kittens)
  ? [...kittens].sort((a, b) => (a.index || 0) - (b.index || 0))
  : [];

const limitedKittens =
  litterCountLimit && litterCountLimit > 0
    ? kittensToRender.slice(0, litterCountLimit)
    : kittensToRender;

limitedKittens.forEach((k, idx) => {
  if (idx % 2 === 0) {
    doc.save();
    doc.rect(tableLeft, rowY - 2, usableWidth, 32).fill("#fdeaea");
    doc.restore();
  }

  let cx = tableLeft;

  // Nº
  doc.text(k.kittenNumber || k.index || idx + 1, cx, rowY, { width: colWidths.n });
  cx += colWidths.n;

  // Nome (gatil + filhote)
  const formattedKittenName = toTitleCase(k.name);
  const fullKittenName =
    catteryName && formattedKittenName
      ? `${catteryName} ${formattedKittenName}`
      : formattedKittenName || "-";

  doc.text(fullKittenName, cx, rowY, { width: colWidths.name });
  cx += colWidths.name;

  // Sexo (por extenso)
  const sexText =
    k.sex === "F" ? "Fêmea" :
    k.sex === "M" ? "Macho" :
    "-";

  doc.text(sexText, cx, rowY, { width: colWidths.sex });
  cx += colWidths.sex;

  // Microchip
  doc.text(k.microchip || "-", cx, rowY, { width: colWidths.micro });
  cx += colWidths.micro;

  // Breeding
  const breedingText =
    (k.breeding || "").toLowerCase() === "breeding"
      ? "For Breeding"
      : "Not For Breeding";

  doc.text(breedingText, cx, rowY, { width: colWidths.breeding });

  // ===== SEGUNDA LINHA =====
  const secondLineY = rowY + 14;

  doc.fontSize(9).fillColor("#555555");

  const breedText = (k.breed || "-").toUpperCase();
  const emsFullText = k.emsEyes || k.emsCode || "-";

  doc.text(
    `Raça: ${breedText}   |   Cód. EMS e Cor: ${emsFullText}`,
    tableLeft + colWidths.n,
    secondLineY,
    { width: usableWidth - colWidths.n }
  );

  doc.fontSize(10).fillColor("black");

  rowY += 32;
});

// ===== BORDA DA TABELA =====
doc
  .rect(
    marginLeft - 5,
    headerY - 5,
    usableWidth + 10,
    rowY - headerY + 5
  )
  .stroke();

doc.moveDown(1);


  /* ================================
     LINHA DO TEMPO
  ================================ */
doc
  .font("Helvetica-Bold")
  .fontSize(11)
  .text("LINHA DO TEMPO DE STATUS",
    marginLeft, // 👈 força início na margem esquerda
    doc.y,
    { align: "left" }
    
  )
  .moveDown(0.3);

  const mapStatus = {
    ENVIADO_GATARINA: "Enviado para Gatarina",
    COM_PENDENCIA: "Serviço com Pendência",
    ENVIADO_FFB: "Enviado para FFB",
    RECEBIDO_FFB: "Recebido da FFB",
    ENVIADO_ASSOCIADO: "Enviado ao Associado",
  };

service.statuses.forEach((st, index) => {
  const dt = st.createdAt.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  doc
    .font("Helvetica")
    .fontSize(10)
    .text(
      `${index + 1}. ${mapStatus[st.status] || st.status} - ${dt}`,
      marginLeft,   // 👈 começa na margem esquerda
      doc.y
    );
});
}

/* ============================================================================
   ADMIN → PDF + ZIP
============================================================================ */
async function generateLitterAdminBundle(service, litter, kittens, sire, dam, res) {
  try {
    const tmpDir = path.join(__dirname, "../../tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const pdfFilename = `ffb-servico-${service.id}.pdf`;
    const pdfPath = path.join(tmpDir, pdfFilename);

    const stream = fs.createWriteStream(pdfPath);
    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(stream);

    drawLitterPdfContent(doc, service, litter, kittens, sire, dam);

    doc.end();

stream.on("finish", () => {
  res.setHeader("Content-Type", "application/zip");
res.setHeader(
  "Content-Disposition",
  `attachment; filename=Serviço ${service.id} - Registro de Ninhada.zip`
);


  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);

  // ============================
  // PDF PRINCIPAL
  // ============================
  archive.file(pdfPath, { name: pdfFilename });

  // ============================
  // FUNÇÃO AUXILIAR (ROBUSTA)
  // ============================
// ✅ Diretório raiz REAL dos uploads
// Em produção (Render Disk): UPLOADS_DIR="/var/data/uploads"
// Em dev: cai no public/uploads
const UPLOADS_ROOT =
  process.env.UPLOADS_DIR || path.join(__dirname, "../../public/uploads");

// fallback do Render Disk (quando UPLOADS_DIR estiver definido, é /var/data/uploads)
const DISK_ROOT = process.env.UPLOADS_DIR || "/var/data/uploads";

function addIfExists(label, relPath) {
  if (!relPath) return;

  let p = String(relPath).replace(/\\/g, "/").trim();

  // 1) Se vier URL completa, pega só a parte depois de /uploads/
  const u = p.indexOf("/uploads/");
  if (u >= 0) p = p.slice(u + "/uploads/".length); // ex: cats/arquivo.pdf

  // 2) Remove / no começo
  p = p.replace(/^\/+/, "");

  // 3) Se vier "uploads/cats/..." remove o "uploads/"
  if (p.startsWith("uploads/")) p = p.replace(/^uploads\//, "");

  // 4) Corrige duplicações tipo "uploads/uploads/cats/..."
  while (p.startsWith("uploads/")) p = p.replace(/^uploads\//, "");

  // 5) ✅ Se o banco já tiver caminho absoluto, tenta direto
  // Ex: /var/data/uploads/cats/arquivo.pdf
  if (p.startsWith("var/data/") || p.startsWith("/var/data/")) {
    const absDirect = p.startsWith("/") ? p : "/" + p;
    const ok = fs.existsSync(absDirect);
    console.log("ADD FILE DIRECT:", { label, relPath, absDirect, ok });
    if (ok) {
      archive.file(absDirect, { name: `${label} - ${path.basename(absDirect)}` });
    }
    return;
  }

  const roots = [
    process.env.UPLOADS_DIR || "/var/data/uploads",        // Render Disk
    path.join(__dirname, "../../public/uploads"),          // dev/antigo
  ];

  let found = null;

  for (const root of roots) {
    const abs = path.join(root, p);
    const ok = fs.existsSync(abs);

    console.log("ADD FILE TRY:", { label, relPath, root, p, abs, ok });

    if (ok) {
      found = abs;
      break;
    }
  }

  if (found) {
    archive.file(found, { name: `${label} - ${path.basename(found)}` });
    console.log("ADD FILE OK:", { label, found });
  } else {
    console.log("ADD FILE NOT FOUND:", { label, relPath, p, roots });
  }
}


  // ============================
  // MACHO
  // ============================
  if (sire) {
    addIfExists("MACHO - Pedigree", sire.pedigreeFile);
    addIfExists("MACHO - Atestado Reprodução", sire.reproductionFile);
  }

  // ============================
  // FÊMEA
  // ============================
  if (dam) {
    addIfExists("FÊMEA - Pedigree", dam.pedigreeFile);
    addIfExists("FÊMEA - Atestado Reprodução", dam.reproductionFile);
  }

  // ========================================
// AUTORIZAÇÃO DE REPRODUÇÃO – MACHO EXTERNO
// ========================================
if (litter?.externalOwnerAuthorization) {
  addIfExists("AUTORIZACAO_REPRODUCAO_MACHO", litter.externalOwnerAuthorization);
}


  archive.finalize();
});


  } catch (err) {
    console.error("ERRO ADMIN:", err);
    res.status(500).send("Erro ao gerar PDF");
  }
}

/* ============================================================================
   USER → Somente PDF (sem ZIP)
============================================================================ */
async function generateLitterUserPDF(service, litter, kittens, sire, dam, res) {
  try {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=servico-${service.id}.pdf`
    );

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    drawLitterPdfContent(doc, service, litter, kittens, sire, dam);

    doc.end();
  } catch (err) {
    console.error("ERRO USER:", err);
    res.status(500).send("Erro ao gerar PDF");
  }
}

module.exports = {
  generateLitterAdminBundle,
  generateLitterUserPDF,
  
};
