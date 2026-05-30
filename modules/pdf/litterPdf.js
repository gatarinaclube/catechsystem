const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const {
  createServiceDoc,
  drawDocumentHeader,
  drawKeyValueBox,
  drawStatusBox,
  drawTable,
  formatDateBR,
  formatDateTimeBR,
} = require("./pdfTheme");

function toTitleCase(text) {
  if (!text || typeof text !== "string") return text;
  return text
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function drawLitterPdfContent(doc, service, litter, kittens, sire, dam) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let y = doc.y;

  drawDocumentHeader(doc, "MAPA DE REGISTRO DE NINHADA", "Registro de Ninhada - LO");
  y = doc.y;

  y = drawKeyValueBox(doc, "DADOS DO SERVICO", [
    { label: "Codigo do servico", value: service.id },
    { label: "Tipo de servico", value: "Registro de Ninhada - LO" },
    { label: "Data da solicitacao", value: formatDateTimeBR(service.createdAt) },
    { label: "Nome", value: service.user?.name },
    { label: "E-mail", value: service.user?.email },
  ], left, y, width, { columns: 2, rowHeight: 14 });

  const maleFfb = sire
    ? `${sire.pedigreeType || ""} ${sire.pedigreeNumber || ""}`.trim() || "-"
    : litter?.maleFfbLo || "-";
  const femaleFfb = dam
    ? `${dam.pedigreeType || ""} ${dam.pedigreeNumber || ""}`.trim() || "-"
    : litter?.femaleFfbLo || "-";

  const half = (width - 8) / 2;
  const blockY = y;
  drawKeyValueBox(doc, "DADOS DO MACHO", [
    { label: "Nome", value: litter?.maleName },
    { label: "Microchip", value: litter?.maleMicrochip },
    { label: "Registro FFB", value: maleFfb },
    { label: "Raca", value: litter?.maleBreed },
    { label: "Cod. EMS", value: litter?.maleEms },
  ], left, blockY, half, { columns: 1, rowHeight: 12, gap: 0, labelSize: 6.9, valueSize: 6.9 });

  y = drawKeyValueBox(doc, "DADOS DA FEMEA", [
    { label: "Nome", value: dam?.name || litter?.femaleName },
    { label: "Microchip", value: dam?.microchip || litter?.femaleMicrochip },
    { label: "Registro FFB", value: femaleFfb },
    { label: "Raca", value: dam?.breed || litter?.femaleBreed },
    { label: "Cod. EMS", value: dam?.emsCode || litter?.femaleEms },
  ], left + half + 8, blockY, half, { columns: 1, rowHeight: 12, gap: 7, labelSize: 6.9, valueSize: 6.9 });

  if (litter?.maleOwnership === "NOT_OWNER") {
    y = drawKeyValueBox(doc, "PROPRIEDADE DO MACHO", [
      { label: "Proprietario", value: litter.externalOwnerName },
      { label: "E-mail", value: litter.externalOwnerEmail },
      { label: "Gatil", value: litter.externalOwnerCattery },
      { label: "CPF", value: litter.externalOwnerCpf },
      { label: "Telefone", value: litter.externalOwnerPhone },
      { label: "Autorizacao de reproducao", value: litter.externalOwnerAuthorization ? "ANEXADA AO PROCESSO" : "-" },
    ], left, y, width, { columns: 3, rowHeight: 13 });
  }

  y = drawKeyValueBox(doc, "DADOS DE NASCIMENTO", [
    { label: "Gatil", value: litter?.catteryName },
    { label: "Pais", value: litter?.catteryCountry },
    { label: "No. de filhotes", value: litter?.litterCount },
    { label: "Data de nascimento", value: formatDateBR(litter?.litterBirthDate) },
  ], left, y, width, { rowHeight: 13 });

  const catteryName = (litter?.catteryName || "").trim();
  const sortedKittens = Array.isArray(kittens)
    ? [...kittens].sort((a, b) => (a.index || 0) - (b.index || 0))
    : [];
  const litterLimit = Number.isFinite(Number(litter?.litterCount))
    ? parseInt(litter.litterCount, 10)
    : null;
  const rows = (litterLimit && litterLimit > 0 ? sortedKittens.slice(0, litterLimit) : sortedKittens)
    .map((k, index) => {
      const kittenName = toTitleCase(k.name);
      return {
        n: k.index || index + 1,
        name: catteryName && kittenName ? `${catteryName} ${kittenName}` : kittenName || "-",
        sex: k.sex === "F" ? "Femea" : k.sex === "M" ? "Macho" : "-",
        microchip: k.microchip || "-",
        breeding: (k.breeding || "").toLowerCase() === "breeding" ? "For Breeding" : "Not For Breeding",
        breed: `${(k.breed || "-").toUpperCase()} / ${k.emsEyes || k.emsCode || "-"}`,
      };
    });

  y = drawTable(doc, "DADOS DOS FILHOTES", [
    { key: "n", label: "No.", width: 22 },
    { key: "name", label: "Nome do Filhote", width: 156 },
    { key: "sex", label: "Sexo", width: 44 },
    { key: "microchip", label: "Microchip", width: 96 },
    { key: "breeding", label: "Breeding?", width: 76 },
    { key: "breed", label: "Raca / EMS e Cor", width: width - 22 - 156 - 44 - 96 - 76 - 12 },
  ], rows, left, y, width, {
    rowHeight: 18,
    headerHeight: 13,
    fontSize: 6.2,
  });

  drawStatusBox(doc, service.statuses, left, y, width, {
    fontSize: 6.7,
    lineHeight: 9,
  });
}

function addUploadToArchive(archive, label, relPath) {
  if (!relPath) return;
  let p = String(relPath).replace(/\\/g, "/").trim();
  const uploadsIndex = p.indexOf("/uploads/");
  if (uploadsIndex >= 0) p = p.slice(uploadsIndex + "/uploads/".length);
  p = p.replace(/^\/+/, "");
  while (p.startsWith("uploads/")) p = p.replace(/^uploads\//, "");

  if (p.startsWith("var/data/") || p.startsWith("/var/data/")) {
    const absDirect = p.startsWith("/") ? p : `/${p}`;
    if (fs.existsSync(absDirect)) {
      archive.file(absDirect, { name: `${label} - ${path.basename(absDirect)}` });
    }
    return;
  }

  const roots = [
    process.env.UPLOADS_DIR || "/var/data/uploads",
    path.join(__dirname, "../../public/uploads"),
  ];

  for (const root of roots) {
    const abs = path.join(root, p);
    if (fs.existsSync(abs)) {
      archive.file(abs, { name: `${label} - ${path.basename(abs)}` });
      return;
    }
  }
}

async function generateLitterAdminBundle(service, litter, kittens, sire, dam, res) {
  try {
    const tmpDir = path.join(__dirname, "../../tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const pdfFilename = `ffb-servico-${service.id}.pdf`;
    const pdfPath = path.join(tmpDir, pdfFilename);
    const stream = fs.createWriteStream(pdfPath);
    const doc = createServiceDoc(stream, "Mapa de Registro de Ninhada");

    drawLitterPdfContent(doc, service, litter, kittens, sire, dam);
    doc.end();

    stream.on("finish", () => {
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename=Servico ${service.id} - Registro de Ninhada.zip`);

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);
      archive.file(pdfPath, { name: pdfFilename });

      if (sire) {
        addUploadToArchive(archive, "MACHO - Pedigree", sire.pedigreeFile);
        addUploadToArchive(archive, "MACHO - Atestado Reproducao", sire.reproductionFile);
      }

      if (dam) {
        addUploadToArchive(archive, "FEMEA - Pedigree", dam.pedigreeFile);
        addUploadToArchive(archive, "FEMEA - Atestado Reproducao", dam.reproductionFile);
      }

      if (litter?.externalOwnerAuthorization) {
        addUploadToArchive(archive, "AUTORIZACAO_REPRODUCAO_MACHO", litter.externalOwnerAuthorization);
      }

      archive.finalize();
    });
  } catch (err) {
    console.error("ERRO ADMIN:", err);
    res.status(500).send("Erro ao gerar PDF");
  }
}

async function generateLitterUserPDF(service, litter, kittens, sire, dam, res) {
  try {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=servico-${service.id}.pdf`);

    const doc = createServiceDoc(res, "Mapa de Registro de Ninhada");
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
