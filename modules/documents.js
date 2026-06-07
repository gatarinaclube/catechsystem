const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const PDFDocument = require("pdfkit");
const { PDFDocument: EditablePdfDocument, rgb, StandardFonts } = require("pdf-lib");
const { buildDisplayName, formatDate, formatDateInput, parseDate } = require("../utils/cattery-admin");
const { sendStatusEmail } = require("../utils/mailer");
const { buildUserSmtpConfig, shapeSmtpSettings } = require("../utils/userSmtp");

const DOCUMENT_TYPES = {
  SALE_CONTRACT: {
    label: "Contrato de Venda",
    route: "contrato-venda",
    defaultTitle: "Contrato de Venda",
    defaultBody: `CONTRATO DE VENDA DE FILHOTE

Pelo presente instrumento particular, o vendedor declara realizar a venda do gato/filhote selecionado ao comprador indicado, conforme as condições combinadas entre as partes.

O comprador declara estar ciente das características do animal, das orientações de manejo, saúde, adaptação e cuidados necessários.

O vendedor se compromete a entregar ao comprador as informações disponíveis sobre o animal, incluindo dados de identificação, registro, vacinação, vermifugação e demais documentos pertinentes quando aplicável.

As partes declaram estar de acordo com os termos acima.`,
  },
  HEALTH_CERTIFICATE: {
    label: "Atestado de Saúde",
    route: "atestado-saude",
    defaultTitle: "Atestado de Saúde",
    defaultBody: `Declaro que o animal acima foi identificado e examinado por mim, e está clinicamente sadio e isento de doenças ectoparasitas e infectocontagiosas, estando devidamente vacinado e vermifugado, dentro das necessidades de sua idade.

Declaro ainda que se trata de animal NÃO braquicefálico, e encontra-se em perfeitas condições de saúde, estando apto para transporte/viagem terrestre ou aérea.`,
  },
  CARE_MANUAL: {
    label: "Manual de Cuidados Básicos",
    route: "manual-cuidados",
    defaultTitle: "Manual de Cuidados Básicos",
    defaultBody: `MANUAL DE CUIDADOS BÁSICOS

Adaptação: mantenha o filhote em ambiente tranquilo nos primeiros dias, com caixa de areia, água, alimento e local seguro para descanso.

Alimentação: mantenha a ração indicada e faça mudanças alimentares de forma gradual.

Higiene: acompanhe caixa de areia, limpeza do ambiente e rotina de escovação conforme a pelagem.

Saúde: siga o calendário de vacinação, vermifugação e consultas veterinárias recomendadas.

Segurança: evite acesso à rua, janelas sem proteção e contato com animais sem controle sanitário.`,
  },
};

const TYPES_BY_ROUTE = Object.fromEntries(
  Object.entries(DOCUMENT_TYPES).map(([type, config]) => [config.route, type])
);

function createUploadMiddleware() {
  const diskRoot = process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");
  const uploadDir = path.join(diskRoot, "documents");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `document-${req.session.userId}-${unique}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 6 },
  });
}

function parseAttachments(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function externalPdfAttachment(document) {
  return parseAttachments(document?.attachmentsJson).find((file) =>
    String(file?.mimeType || "").includes("pdf") || /\.pdf$/i.test(file?.path || file?.originalName || "")
  ) || null;
}

function compact(value) {
  return String(value || "").trim();
}

function parseNullablePositiveInt(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.floor(number);
}

function parseCoordinate(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.max(0, Math.min(1, number));
}

function getClientIp(req) {
  return compact(req.headers["x-forwarded-for"]).split(",")[0] || req.socket?.remoteAddress || req.ip || "";
}

function browserFromUserAgent(userAgent) {
  const ua = String(userAgent || "");
  if (/Edg\//.test(ua)) return "Microsoft Edge";
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return "Google Chrome";
  if (/Firefox\//.test(ua)) return "Mozilla Firefox";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari";
  if (/OPR\//.test(ua)) return "Opera";
  return ua ? "Navegador não identificado" : "";
}

function publicBaseUrl(req) {
  const configured = compact(process.env.PUBLIC_BASE_URL || process.env.APP_URL);
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function hashOtp(token, otp) {
  return crypto.createHash("sha256").update(`${token}:${otp}`).digest("hex");
}

function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function signatureEventLabel(type) {
  const labels = {
    EMAIL_SENT: "Recebeu o e-mail",
    EMAIL_OPENED: "Abriu o e-mail",
    DOCUMENT_VIEWED: "Visualizou o documento",
    OTP_SENT: "Código OTP enviado",
    OTP_VERIFIED: "Código OTP validado",
    SIGNED: "Assinou o documento",
    LINK_CREATED: "Link de assinatura criado",
    CONTRACT_UPDATED: "Contrato retificado",
    CONTRACT_BLOCKED: "Contrato bloqueado",
    CONTRACT_UNBLOCKED: "Contrato desbloqueado",
    CONTRACT_CANCELED: "Contrato cancelado",
  };
  return labels[type] || type;
}

function signatureStatusLabel(status) {
  const labels = {
    PENDING: "Pendente",
    SENT: "Enviado",
    OPENED: "E-mail aberto",
    VIEWED: "Visualizado",
    OTP_SENT: "OTP enviado",
    SIGNED: "Assinado",
    BLOCKED: "Bloqueado",
    CANCELED: "Cancelado",
  };
  return labels[status] || status || "Pendente";
}

function signatureTimeline(request) {
  const events = request?.events || [];
  const latest = (type) => events.find((event) => event.type === type);
  return [
    {
      title: "Recebeu o e-mail",
      value: latest("EMAIL_SENT") ? `em ${formatDateTime(latest("EMAIL_SENT").createdAt)}` : "Ainda não enviado",
    },
    {
      title: "Abriu o e-mail",
      value: latest("EMAIL_OPENED") ? `em ${formatDateTime(latest("EMAIL_OPENED").createdAt)}` : "Ainda não abriu o e-mail",
    },
    {
      title: "Visualizou o documento",
      value: latest("DOCUMENT_VIEWED") ? `em ${formatDateTime(latest("DOCUMENT_VIEWED").createdAt)}` : "Ainda não visualizou o documento.",
    },
    {
      title: "Assinatura",
      value: latest("SIGNED") ? `assinado em ${formatDateTime(latest("SIGNED").createdAt)}` : "Ainda não assinou o documento",
    },
  ];
}

function signatureIsAccessible(request) {
  return request && !["BLOCKED", "CANCELED"].includes(request.status);
}

function selectedTypeFromRoute(route) {
  return TYPES_BY_ROUTE[route] || "SALE_CONTRACT";
}

function localUploadPath(webPath) {
  if (!webPath) return null;
  const clean = String(webPath).replace(/\\/g, "/");
  const uploadsIndex = clean.indexOf("/uploads/");
  const relative = uploadsIndex >= 0
    ? clean.slice(uploadsIndex + "/uploads/".length)
    : clean.replace(/^\/?uploads\/?/, "");
  const root = process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");
  const candidates = [
    path.join(root, relative),
    path.join(__dirname, "..", "public", clean.replace(/^\//, "")),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function evidenceUploadPath(filename) {
  const root = process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");
  const dir = path.join(root, "documents", "signed");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return {
    local: path.join(dir, filename),
    web: `/uploads/documents/signed/${filename}`,
  };
}

function shapeCat(cat) {
  if (!cat) return null;
  return {
    ...cat,
    displayName: buildDisplayName(cat),
    birthDateLabel: formatDate(cat.birthDate),
  };
}

function renderTemplate(text, { document, cat, client, settings }) {
  const replacements = {
    comprador: client?.fullName || "Comprador não informado",
    compradorDocumento: client?.document || "",
    compradorEmail: client?.email || "",
    compradorTelefone: client?.phone || "",
    gato: cat?.displayName || "Gato não selecionado",
    microchip: cat?.microchip || "",
    nascimento: cat?.birthDateLabel || "",
    gatil: settings?.catteryName || "",
    veterinario: settings?.veterinarian || settings?.veterinarianName || "",
    crmv: [settings?.crmv, settings?.crmvUf].filter(Boolean).join("-"),
    clinicaVeterinaria: settings?.veterinarianClinicName || "",
    nomeFantasiaVeterinaria: settings?.veterinarianTradeName || "",
    cnpjVeterinario: settings?.veterinarianCnpj || "",
    dataDocumento: formatDate(document?.documentDate) || formatDate(new Date()),
  };

  return String(text || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => replacements[key] || "");
}

function drawHeader(doc, { title, settings, logoChoice }) {
  const logoPath = logoChoice === "CATTERY"
    ? settings?.logoPath
    : logoChoice === "VET"
      ? settings?.veterinarianLogoPath
      : null;
  const localLogo = localUploadPath(logoPath);

  if (localLogo) {
    try {
      doc.image(localLogo, 48, 34, { fit: [110, 55], align: "left" });
    } catch {
      // Documento continua sem logo se o arquivo estiver indisponível ou inválido.
    }
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(15)
    .fillColor("#1f2933")
    .text(title, 48, 44, { align: "right", width: 500 });
  doc
    .moveTo(48, 98)
    .lineTo(547, 98)
    .strokeColor("#d6a84f")
    .lineWidth(1)
    .stroke();
  doc.moveDown(2.4);
}

function drawInfoBox(doc, rows) {
  const filtered = rows.filter((row) => compact(row.value));
  if (!filtered.length) return;

  const startY = doc.y;
  doc.roundedRect(48, startY, 499, 26 + filtered.length * 17, 6).fillAndStroke("#f8fafc", "#e5e7eb");
  doc.fillColor("#374151").font("Helvetica-Bold").fontSize(9).text("Informações do documento", 62, startY + 10);
  doc.font("Helvetica").fontSize(8.5);
  filtered.forEach((row, index) => {
    doc.fillColor("#6b7280").text(`${row.label}:`, 62, startY + 28 + index * 17, { continued: true });
    doc.fillColor("#111827").text(` ${row.value}`);
  });
  doc.y = startY + 38 + filtered.length * 17;
}

function drawHealthField(doc, label, value, x, y, width, height = 38) {
  doc.roundedRect(x, y, width, height, 5).fillAndStroke("#ffffff", "#d8dee6");
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#64748b").text(label.toUpperCase(), x + 9, y + 7, {
    width: width - 18,
  });
  doc.font("Helvetica").fontSize(10).fillColor("#111827").text(compact(value) || "-", x + 9, y + 20, {
    width: width - 18,
    ellipsis: true,
  });
}

function drawTableCell(doc, x, y, width, height, label, value, options = {}) {
  doc.rect(x, y, width, height).strokeColor("#111827").lineWidth(0.65).stroke();
  doc.font("Helvetica-Bold").fontSize(7.8).fillColor("#111827").text(`${label}:`, x + 5, y + 6, {
    width: width - 10,
    continued: Boolean(value),
  });
  if (value) {
    doc.font("Helvetica").fillColor(options.valueColor || "#111827").text(` ${value}`, {
      width: width - 10,
      ellipsis: true,
    });
  }
}

function drawSectionTitle(doc, number, title, y) {
  doc.rect(46, y, 503, 24).fillAndStroke("#d9d9d9", "#111827");
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text(`${number}.  ${title}`, 68, y + 7);
}

function drawHealthCertificatePdf(doc, { document, cat, settings, user }) {
  const logoPath = document.logoChoice === "CATTERY"
    ? settings?.logoPath
    : document.logoChoice === "VET"
      ? settings?.veterinarianLogoPath
      : null;
  const localLogo = localUploadPath(logoPath);

  doc.rect(0, 0, 595.28, 841.89).fill("#ffffff");

  if (localLogo) {
    try {
      doc.image(localLogo, 34, 12, { fit: [78, 78] });
    } catch {
      // O documento continua sem logo se o arquivo não puder ser carregado.
    }
  }

  const vetName = settings?.veterinarian || settings?.veterinarianName || "Médico Veterinário";
  const crmv = [settings?.crmv, settings?.crmvUf].filter(Boolean).join("-");
  const crmvLabel = settings?.crmvUf ? `CRMV/${settings.crmvUf}` : "CRMV";
  const clinicName = settings?.veterinarianClinicName || settings?.catteryName || vetName;
  const tradeName = settings?.veterinarianTradeName || clinicName;
  const clinicCity = settings?.veterinarianCity || user?.city || "";
  const clinicCep = settings?.veterinarianCep || user?.cep || "";
  const clinicState = settings?.veterinarianState || user?.state || "";
  const clinicAddress = settings?.veterinarianAddress || user?.address || "";
  const issueDate = formatDate(document.documentDate) || formatDate(new Date());

  doc.font("Helvetica-Bold").fontSize(18).fillColor("#111827").text(clinicName, 125, 22, {
    width: 415,
    align: "right",
  });
  doc.font("Helvetica").fontSize(8).fillColor("#111827").text(clinicAddress, 125, 51, {
    width: 415,
    align: "right",
  });
  doc.font("Helvetica-Bold").fontSize(12).text(settings?.veterinarianPhone ? `Telefone: ${settings.veterinarianPhone}` : "", 125, 66, {
    width: 415,
    align: "right",
  });

  doc.rect(46, 102, 503, 26).strokeColor("#111827").lineWidth(0.8).stroke();
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#111827").text("ATESTADO DE SAÚDE ANIMAL", 46, 109, {
    width: 503,
    align: "center",
  });

  drawSectionTitle(doc, 1, "PROPRIETÁRIO DO ANIMAL", 128);
  drawTableCell(doc, 46, 152, 300, 22, "Nome Completo", user?.name || settings?.catteryName);
  drawTableCell(doc, 346, 152, 203, 22, "CPF/RG", user?.cpf);
  drawTableCell(doc, 46, 174, 503, 22, "Endereço", user?.address);
  drawTableCell(doc, 46, 196, 176, 22, "Cidade", user?.city);
  drawTableCell(doc, 222, 196, 154, 22, "CEP", user?.cep);
  drawTableCell(doc, 376, 196, 173, 22, "Estado", user?.state);
  drawTableCell(doc, 46, 218, 255, 22, "Telefone", user?.phones);
  drawTableCell(doc, 301, 218, 248, 22, "E-mail", user?.email);

  drawSectionTitle(doc, 2, "IDENTIFICAÇÃO DO ANIMAL", 255);
  drawTableCell(doc, 46, 279, 503, 22, "Nome", cat?.displayName, { valueColor: "#ff0000" });
  drawTableCell(doc, 46, 301, 174, 22, "Espécie", "Felina");
  drawTableCell(doc, 220, 301, 178, 22, "Raça", cat?.breed);
  drawTableCell(doc, 398, 301, 151, 22, "Sexo", cat?.gender === "M" ? "Macho" : cat?.gender === "F" ? "Fêmea" : cat?.gender, { valueColor: "#ff0000" });
  drawTableCell(doc, 46, 323, 252, 22, "Data de Nascimento", cat?.birthDateLabel, { valueColor: "#ff0000" });
  drawTableCell(doc, 298, 323, 251, 22, "Microchip Nº", cat?.microchip, { valueColor: "#ff0000" });

  drawSectionTitle(doc, 3, "DECLARAÇÃO DO MÉDICO VETERINÁRIO", 360);
  doc.rect(46, 384, 503, 178).strokeColor("#111827").lineWidth(0.65).stroke();
  doc.font("Helvetica-Oblique").fontSize(10).fillColor("#111827").text(
    renderTemplate(document.body, { document, cat, client: null, settings }),
    58,
    420,
    { width: 479, align: "justify", lineGap: 6 }
  );

  drawTableCell(doc, 46, 562, 342, 22, "Médico Veterinário Emitente", vetName, { valueColor: "#ff0000" });
  drawTableCell(doc, 388, 562, 161, 22, crmvLabel, crmv, { valueColor: "#ff0000" });
  drawTableCell(doc, 46, 584, 503, 22, "Clínica Veterinária", clinicName);
  drawTableCell(doc, 46, 606, 312, 22, "Nome Fantasia", tradeName);
  drawTableCell(doc, 358, 606, 191, 22, "CNPJ", settings?.veterinarianCnpj);
  drawTableCell(doc, 46, 628, 503, 22, "Endereço", clinicAddress);
  drawTableCell(doc, 46, 650, 176, 22, "Cidade", clinicCity);
  drawTableCell(doc, 222, 650, 154, 22, "CEP", clinicCep);
  drawTableCell(doc, 376, 650, 173, 22, "Estado", clinicState);
  drawTableCell(doc, 46, 672, 252, 22, "Telefone", settings?.veterinarianPhone);
  drawTableCell(doc, 298, 672, 251, 22, "Celular", settings?.veterinarianMobile);
  doc.rect(46, 694, 503, 48).strokeColor("#111827").lineWidth(0.65).stroke();
  doc.font("Helvetica-Bold").fontSize(7.8).fillColor("#111827").text("Assinatura e Carimbo:", 52, 699);

  doc.rect(46, 742, 503, 25).strokeColor("#111827").lineWidth(0.65).stroke();
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#ff0000").text(
    `${clinicCity || user?.city || "Cidade"}, ${issueDate}`,
    46,
    748,
    { width: 503, align: "center" }
  );
  doc.font("Helvetica").fontSize(7).fillColor("#111827").text(
    [clinicAddress, [clinicCity, clinicState].filter(Boolean).join("/"), settings?.veterinarianPhone].filter(Boolean).join(" · "),
    46,
    800,
    { width: 503, align: "center" }
  );
  doc.font("Helvetica-Bold").fontSize(7).text("Página 01/01", 46, 812, {
    width: 499,
    align: "right",
  });
}

function buildDocumentPdfBuffer({ document, cat, client, settings, user, signatureRequest = null }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const config = DOCUMENT_TYPES[document.type] || DOCUMENT_TYPES.SALE_CONTRACT;
    const title = document.title || config.label;
    if (document.type === "HEALTH_CERTIFICATE") {
      drawHealthCertificatePdf(doc, { document, cat, settings, user });
      doc.end();
      return;
    }

    drawHeader(doc, {
      title,
      settings,
      logoChoice: document.type === "HEALTH_CERTIFICATE" ? document.logoChoice : null,
    });

    if (document.type === "HEALTH_CERTIFICATE") {
      drawInfoBox(doc, [
        { label: "Veterinário", value: settings?.veterinarian || settings?.veterinarianName },
        { label: "CRMV", value: [settings?.crmv, settings?.crmvUf].filter(Boolean).join("-") },
        { label: "Endereço", value: settings?.veterinarianAddress },
        { label: "Telefone", value: settings?.veterinarianPhone },
        { label: "E-mail", value: settings?.veterinarianEmail },
        { label: "Data do atestado", value: formatDate(document.documentDate) },
      ]);
    } else {
      drawInfoBox(doc, [
        { label: "Gatil", value: settings?.catteryName || user?.fifeCatteryName || user?.name },
        { label: "Comprador", value: client?.fullName },
        { label: "Gato", value: cat?.displayName },
        { label: "Microchip", value: cat?.microchip },
      ]);
    }

    doc.moveDown(1.3);
    doc
      .font("Helvetica")
      .fontSize(10.5)
      .fillColor("#111827")
      .text(renderTemplate(document.body, { document, cat, client, settings }), {
        align: "justify",
        lineGap: 4,
      });

    if (document.type === "SALE_CONTRACT") {
      doc.moveDown(2.4);
      const y = doc.y + 20;
      doc.moveTo(60, y).lineTo(250, y).strokeColor("#111827").stroke();
      doc.moveTo(345, y).lineTo(535, y).strokeColor("#111827").stroke();
      doc.fontSize(8.5).fillColor("#374151").text("Vendedor", 60, y + 8, { width: 190, align: "center" });
      doc.text(signatureRequest?.signatureText || "Comprador", 345, y + 8, { width: 190, align: "center" });
    }

    if (signatureRequest?.signedAt) {
      doc.addPage();
      drawHeader(doc, { title: "Relatório de Evidências", settings, logoChoice: null });
      drawInfoBox(doc, [
        { label: "Assinante", value: signatureRequest.signerName },
        { label: "Documento", value: signatureRequest.signerDocument },
        { label: "E-mail", value: signatureRequest.signerEmail },
        { label: "Data e hora da assinatura", value: formatDateTime(signatureRequest.signedAt) },
        { label: "IP", value: signatureRequest.ipAddress },
        { label: "Navegador", value: signatureRequest.browser || signatureRequest.userAgent },
        { label: "Geolocalização", value: signatureRequest.latitude && signatureRequest.longitude ? `${signatureRequest.latitude}, ${signatureRequest.longitude}` : "Não informada" },
        { label: "Hash SHA-256 do documento", value: signatureRequest.documentHash },
      ]);
      doc.moveDown(1.2);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827").text("Log de auditoria");
      doc.moveDown(0.4);
      (signatureRequest.events || []).forEach((event) => {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#374151")
          .text(`${formatDateTime(event.createdAt)} - ${signatureEventLabel(event.type)}${event.message ? ` - ${event.message}` : ""}`);
        if (event.ipAddress || event.userAgent) {
          doc.fontSize(8).fillColor("#6b7280").text(`IP: ${event.ipAddress || "-"} · Navegador: ${browserFromUserAgent(event.userAgent) || "-"}`);
        }
        doc.moveDown(0.3);
      });
    }

    doc.fontSize(8).fillColor("#6b7280").text(`Emitido em ${formatDate(new Date())}`, 48, 780, {
      width: 499,
      align: "right",
    });
    doc.end();
  });
}

async function buildSignedExternalPdfBuffer({ document, signatureRequest }) {
  const attachment = externalPdfAttachment(document);
  const local = localUploadPath(attachment?.path);
  if (!local) {
    throw new Error("Arquivo PDF externo não encontrado.");
  }

  const pdfDoc = await EditablePdfDocument.load(fs.readFileSync(local));
  const pages = pdfDoc.getPages();
  const pageIndex = Math.min(Math.max(Number(signatureRequest.signaturePage || 1) - 1, 0), pages.length - 1);
  const page = pages[pageIndex];
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const x = Number.isFinite(Number(signatureRequest.signatureX)) ? Number(signatureRequest.signatureX) : 0.62;
  const y = Number.isFinite(Number(signatureRequest.signatureY)) ? Number(signatureRequest.signatureY) : 0.82;
  const signatureX = Math.max(24, Math.min(width - 210, x * width));
  const signatureY = Math.max(40, Math.min(height - 40, height - y * height));

  page.drawRectangle({
    x: signatureX,
    y: signatureY,
    width: 190,
    height: 44,
    borderColor: rgb(0.12, 0.42, 0.22),
    borderWidth: 1,
    color: rgb(0.94, 0.99, 0.96),
    opacity: 0.92,
  });
  page.drawText("Assinado eletronicamente por", {
    x: signatureX + 8,
    y: signatureY + 27,
    size: 7,
    font: regularFont,
    color: rgb(0.23, 0.28, 0.35),
  });
  page.drawText(signatureRequest.signatureText || signatureRequest.signerName || "Assinante", {
    x: signatureX + 8,
    y: signatureY + 13,
    size: 10,
    font,
    color: rgb(0.08, 0.26, 0.14),
  });
  page.drawText(formatDateTime(signatureRequest.signedAt), {
    x: signatureX + 8,
    y: signatureY + 4,
    size: 6,
    font: regularFont,
    color: rgb(0.39, 0.45, 0.55),
  });

  const evidencePage = pdfDoc.addPage([595.28, 841.89]);
  evidencePage.drawText("Relatório de Evidências", {
    x: 48,
    y: 785,
    size: 18,
    font,
    color: rgb(0.12, 0.16, 0.2),
  });
  const rows = [
    ["Documento", document.title || "Documento"],
    ["Assinante", signatureRequest.signerName || ""],
    ["Documento do assinante", signatureRequest.signerDocument || ""],
    ["E-mail", signatureRequest.signerEmail || ""],
    ["Data e hora", formatDateTime(signatureRequest.signedAt)],
    ["IP", signatureRequest.ipAddress || ""],
    ["Navegador", signatureRequest.browser || signatureRequest.userAgent || ""],
    ["Geolocalização", signatureRequest.latitude && signatureRequest.longitude ? `${signatureRequest.latitude}, ${signatureRequest.longitude}` : "Não informada"],
    ["Hash SHA-256", signatureRequest.documentHash || ""],
  ];
  let currentY = 742;
  rows.forEach(([label, value]) => {
    evidencePage.drawText(`${label}:`, { x: 48, y: currentY, size: 9, font, color: rgb(0.23, 0.28, 0.35) });
    evidencePage.drawText(String(value || "-"), { x: 170, y: currentY, size: 9, font: regularFont, color: rgb(0.07, 0.09, 0.12) });
    currentY -= 18;
  });
  currentY -= 10;
  evidencePage.drawText("Log de auditoria", { x: 48, y: currentY, size: 11, font, color: rgb(0.12, 0.16, 0.2) });
  currentY -= 18;
  (signatureRequest.events || []).forEach((event) => {
    if (currentY < 60) return;
    evidencePage.drawText(`${formatDateTime(event.createdAt)} - ${signatureEventLabel(event.type)}`, {
      x: 48,
      y: currentY,
      size: 8,
      font: regularFont,
      color: rgb(0.23, 0.28, 0.35),
    });
    currentY -= 13;
  });

  return Buffer.from(await pdfDoc.save());
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();
  const upload = createUploadMiddleware();

  async function loadOptions(userId) {
    const [cats, clients, settings, user] = await Promise.all([
      prisma.cat.findMany({
        where: { ownerId: userId },
        include: {
          owner: { include: { settings: true } },
          mother: true,
          litterKitten: { include: { litter: true } },
        },
        orderBy: [{ name: "asc" }],
      }),
      prisma.revenueClient.findMany({
        where: { ownerId: userId, deletedAt: null },
        orderBy: { fullName: "asc" },
      }),
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.user.findUnique({ where: { id: userId } }),
    ]);
    return {
      cats: cats.map(shapeCat),
      clients,
      settings: settings || {},
      smtpSettings: shapeSmtpSettings(settings),
      user,
    };
  }

  async function loadDocument(id, userId) {
    return prisma.catteryDocument.findFirst({
      where: { id: Number(id), ownerId: userId },
      include: {
        cat: {
          include: {
            owner: { include: { settings: true } },
            mother: true,
            litterKitten: { include: { litter: true } },
          },
        },
        client: true,
        emailLogs: { orderBy: { sentAt: "desc" }, take: 10 },
        signatureRequests: {
          orderBy: { createdAt: "desc" },
          include: { events: { orderBy: { createdAt: "desc" } } },
          take: 5,
        },
      },
    });
  }

  async function logSignatureEvent(requestId, type, req, message = null, location = {}) {
    return prisma.documentSignatureEvent.create({
      data: {
        requestId,
        type,
        message,
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || "",
        latitude: location.latitude === undefined || location.latitude === "" ? null : Number(location.latitude),
        longitude: location.longitude === undefined || location.longitude === "" ? null : Number(location.longitude),
      },
    });
  }

  async function notifyUnsignedSignatureRequests(document, req) {
    if (!document || document.type !== "SALE_CONTRACT") return;
    const requests = await prisma.documentSignatureRequest.findMany({
      where: {
        documentId: document.id,
        ownerId: req.session.userId,
        status: { notIn: ["SIGNED", "CANCELED", "BLOCKED"] },
      },
      include: { document: { include: { cat: true, client: true } } },
    });
    if (!requests.length) return;

    const [settings, user, reloaded] = await Promise.all([
      prisma.userSettings.findUnique({ where: { userId: req.session.userId } }),
      prisma.user.findUnique({ where: { id: req.session.userId } }),
      loadDocument(document.id, req.session.userId),
    ]);
    const pdfBuffer = await buildDocumentPdfBuffer({
      document: reloaded,
      cat: shapeCat(reloaded.cat),
      client: reloaded.client,
      settings: settings || {},
      user,
    });
    const documentHash = hashBuffer(pdfBuffer);
    const smtpConfig = buildUserSmtpConfig(settings);

    for (const request of requests) {
      await prisma.documentSignatureRequest.update({
        where: { id: request.id },
        data: { documentHash },
      });
      await logSignatureEvent(request.id, "CONTRACT_UPDATED", req, "Contrato retificado pelo usuário antes da assinatura.");
      if (smtpConfig && request.signerEmail) {
        const signUrl = `${publicBaseUrl(req)}/assinatura/${request.token}`;
        await sendStatusEmail({
          to: request.signerEmail,
          subject: `Contrato retificado - ${document.title || "Contrato"}`,
          html: `
            <p>Olá${request.signerName ? `, ${request.signerName}` : ""}.</p>
            <p>O contrato enviado anteriormente foi retificado antes da assinatura.</p>
            <p>Por favor, acesse novamente o link abaixo para ler a versão atualizada:</p>
            <p><a href="${signUrl}" style="display:inline-block;padding:12px 18px;background:#8a3328;color:#fff;text-decoration:none;border-radius:6px;">Abrir contrato retificado</a></p>
            <p>Se o botão não abrir, copie este link: ${signUrl}</p>
          `,
          smtpConfig,
          from: smtpConfig.from,
        });
        await logSignatureEvent(request.id, "EMAIL_SENT", req, "E-mail de retificação aceito pelo SMTP.");
      }
    }
  }

  async function shapeSignatureRequestForList(request, req) {
    const url = `${publicBaseUrl(req)}/assinatura/${request.token}`;
    return {
      ...request,
      statusLabel: signatureStatusLabel(request.status),
      publicUrl: url,
      whatsappUrl: `https://wa.me/?text=${encodeURIComponent(`Segue o link para leitura e assinatura do documento: ${url}`)}`,
      timeline: signatureTimeline(request),
    };
  }

  async function documentHashForSignature(document, req) {
    if (["EXTERNAL_CONTRACT", "SIGNATURE_DOCUMENT"].includes(document.type)) {
      const pdf = externalPdfAttachment(document);
      const local = localUploadPath(pdf?.path);
      if (local) return hashBuffer(fs.readFileSync(local));
    }
    const settings = await prisma.userSettings.findUnique({ where: { userId: req.session.userId } });
    const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
    const buffer = await buildDocumentPdfBuffer({
      document,
      cat: shapeCat(document.cat),
      client: document.client,
      settings: settings || {},
      user,
    });
    return hashBuffer(buffer);
  }

  async function sendSignatureEmail({ req, document, signatureRequest, settings }) {
    const smtpConfig = buildUserSmtpConfig(settings);
    if (!signatureRequest.signerEmail || !smtpConfig) return false;

    const signUrl = `${publicBaseUrl(req)}/assinatura/${signatureRequest.token}`;
    const pixelUrl = `${publicBaseUrl(req)}/assinatura/${signatureRequest.token}/pixel.png`;
    await sendStatusEmail({
      to: signatureRequest.signerEmail,
      subject: `Assinatura eletrônica - ${document.title || "Documento"}`,
      html: `
        <p>Olá${signatureRequest.signerName ? `, ${signatureRequest.signerName}` : ""}.</p>
        <p>Você recebeu um documento para leitura e assinatura eletrônica.</p>
        <p><a href="${signUrl}" style="display:inline-block;padding:12px 18px;background:#8a3328;color:#fff;text-decoration:none;border-radius:6px;">Abrir documento</a></p>
        <p>Se o botão não abrir, copie este link: ${signUrl}</p>
        <img src="${pixelUrl}" width="1" height="1" alt="" />
      `,
      smtpConfig,
      from: smtpConfig.from,
    });
    await logSignatureEvent(signatureRequest.id, "EMAIL_SENT", req, "E-mail aceito pelo SMTP.");
    await prisma.documentSignatureRequest.update({
      where: { id: signatureRequest.id },
      data: { status: "SENT" },
    });
    return true;
  }

  router.get("/documentos", requireAuth, requirePermission("admin.documents"), async (req, res, next) => {
    try {
      const documents = await prisma.catteryDocument.findMany({
        where: { ownerId: req.session.userId },
        include: { cat: true, client: true },
        orderBy: { updatedAt: "desc" },
      });
      const grouped = Object.fromEntries(Object.keys(DOCUMENT_TYPES).map((type) => [type, []]));
      documents.forEach((document) => grouped[document.type]?.push(document));
      res.render("documents/index", {
        user: req.user,
        currentPath: "/documentos",
        documentTypes: DOCUMENT_TYPES,
        grouped,
        success: req.query.saved === "1" || req.query.sent === "1",
        error: req.query.error || null,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/documentos/assinaturas", requireAuth, requirePermission("admin.documents"), async (req, res, next) => {
    try {
      const [systemContracts, signatureRequests, settings] = await Promise.all([
        prisma.catteryDocument.findMany({
          where: {
            ownerId: req.session.userId,
            type: "SALE_CONTRACT",
            signatureRequests: { none: { status: "SIGNED" } },
          },
          include: { client: true, cat: true },
          orderBy: { updatedAt: "desc" },
        }),
        prisma.documentSignatureRequest.findMany({
          where: { ownerId: req.session.userId },
          include: {
            document: { include: { client: true, cat: true } },
            events: { orderBy: { createdAt: "desc" } },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.userSettings.findUnique({ where: { userId: req.session.userId } }),
      ]);

      res.render("documents/signatures", {
        user: req.user,
        currentPath: "/documentos",
        systemContracts,
        signatureRequests: await Promise.all(signatureRequests.map((request) => shapeSignatureRequestForList(request, req))),
        smtpSettings: shapeSmtpSettings(settings),
        success: req.query.saved === "1",
        error: req.query.error || null,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/documentos/assinaturas/criar",
    requireAuth,
    requirePermission("admin.documents"),
    upload.single("signaturePdf"),
    async (req, res, next) => {
      try {
        const documentKind = req.body.documentKind === "OTHER" ? "OTHER" : "CONTRACT";
        const contractSource = req.body.contractSource === "EXTERNAL" ? "EXTERNAL" : "SYSTEM";
        const signerName = compact(req.body.signerName);
        const signerEmail = compact(req.body.signerEmail);
        const signerDocument = compact(req.body.signerDocument);
        const signerPhone = compact(req.body.signerPhone);
        let document = null;
        let signatureSource = "SYSTEM_CONTRACT";

        if (documentKind === "CONTRACT" && contractSource === "SYSTEM") {
          document = await loadDocument(req.body.systemDocumentId, req.session.userId);
          if (!document || document.type !== "SALE_CONTRACT") {
            return res.redirect("/documentos/assinaturas?error=Selecione um contrato do sistema válido.");
          }
          signatureSource = "SYSTEM_CONTRACT";
        } else {
          if (!req.file) {
            return res.redirect("/documentos/assinaturas?error=Selecione um arquivo PDF para assinatura.");
          }
          if (!String(req.file.mimetype || "").includes("pdf") && !/\.pdf$/i.test(req.file.originalname || "")) {
            return res.redirect("/documentos/assinaturas?error=O arquivo para assinatura precisa ser PDF.");
          }
          const title = compact(req.body.externalTitle) || (documentKind === "CONTRACT" ? "Contrato externo" : "Documento para assinatura");
          document = await prisma.catteryDocument.create({
            data: {
              ownerId: req.session.userId,
              type: documentKind === "CONTRACT" ? "EXTERNAL_CONTRACT" : "SIGNATURE_DOCUMENT",
              title,
              body: "",
              attachmentsJson: JSON.stringify([{
                path: `/uploads/documents/${req.file.filename}`,
                originalName: req.file.originalname,
                mimeType: req.file.mimetype,
                size: req.file.size,
              }]),
            },
            include: { cat: true, client: true },
          });
          signatureSource = documentKind === "CONTRACT" ? "EXTERNAL_CONTRACT" : "EXTERNAL_DOCUMENT";
        }

        const token = crypto.randomBytes(32).toString("hex");
        const documentHash = await documentHashForSignature(document, req);
        const signatureRequest = await prisma.documentSignatureRequest.create({
          data: {
            ownerId: req.session.userId,
            documentId: document.id,
            token,
            signerName: signerName || document.client?.fullName || null,
            signerEmail: signerEmail || document.client?.email || null,
            signerDocument: signerDocument || document.client?.document || null,
            signerPhone: signerPhone || document.client?.phone || null,
            signatureSource,
            signaturePage: parseNullablePositiveInt(req.body.signaturePage) || 1,
            signatureX: parseCoordinate(req.body.signatureX),
            signatureY: parseCoordinate(req.body.signatureY),
            status: "PENDING",
            documentHash,
          },
        });
        await logSignatureEvent(signatureRequest.id, "LINK_CREATED", req, "Link público criado.");

        const settings = await prisma.userSettings.findUnique({ where: { userId: req.session.userId } });
        await sendSignatureEmail({ req, document, signatureRequest, settings });

        res.redirect("/documentos/assinaturas?saved=1");
      } catch (err) {
        next(err);
      }
    }
  );

  router.get("/documentos/novo/:route", requireAuth, requirePermission("admin.documents"), async (req, res, next) => {
    try {
      const type = selectedTypeFromRoute(req.params.route);
      const options = await loadOptions(req.session.userId);
      const config = DOCUMENT_TYPES[type];
      res.render("documents/form", {
        user: req.user,
        currentPath: "/documentos",
        documentTypes: DOCUMENT_TYPES,
        type,
        config,
        document: {
          id: null,
          type,
          title: config.defaultTitle,
          body: type === "HEALTH_CERTIFICATE"
            ? options.settings.healthCertificateDeclarationText || config.defaultBody
            : config.defaultBody,
          catId: "",
          clientId: "",
          documentDate: formatDateInput(new Date()),
          logoChoice: type === "HEALTH_CERTIFICATE"
            ? options.settings.healthCertificateLogoPreference || "NONE"
            : "NONE",
          attachments: [],
          emailLogs: [],
        },
        ...options,
        success: false,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/documentos/:id/editar", requireAuth, requirePermission("admin.documents"), async (req, res, next) => {
    try {
      const document = await loadDocument(req.params.id, req.session.userId);
      if (!document) return res.redirect("/documentos?error=Documento não encontrado.");
      const options = await loadOptions(req.session.userId);
      const type = document.type;
      res.render("documents/form", {
        user: req.user,
        currentPath: "/documentos",
        documentTypes: DOCUMENT_TYPES,
        type,
        config: DOCUMENT_TYPES[type],
        document: {
          ...document,
          cat: shapeCat(document.cat),
          documentDate: formatDateInput(document.documentDate),
          attachments: parseAttachments(document.attachmentsJson),
          signatureRequests: (document.signatureRequests || []).map((request) => {
            const url = `${publicBaseUrl(req)}/assinatura/${request.token}`;
            return {
              ...request,
              statusLabel: signatureStatusLabel(request.status),
              publicUrl: url,
              whatsappUrl: `https://wa.me/?text=${encodeURIComponent(`Segue o link para leitura e assinatura do contrato: ${url}`)}`,
              timeline: signatureTimeline(request),
            };
          }),
        },
        ...options,
        success: req.query.saved === "1" || req.query.sent === "1",
        error: req.query.error || null,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/documentos/salvar", requireAuth, requirePermission("admin.documents"), upload.array("manualFiles", 6), async (req, res, next) => {
    try {
      const type = DOCUMENT_TYPES[req.body.type] ? req.body.type : "SALE_CONTRACT";
      const id = Number(req.body.id || 0);
      const existing = id ? await loadDocument(id, req.session.userId) : null;
      if (id && !existing) return res.redirect("/documentos?error=Documento não encontrado.");
      if (existing && type === "SALE_CONTRACT") {
        const signedCount = await prisma.documentSignatureRequest.count({
          where: { documentId: existing.id, ownerId: req.session.userId, status: "SIGNED" },
        });
        if (signedCount > 0) {
          return res.redirect(`/documentos/${existing.id}/editar?error=Contrato já assinado não pode ser editado. Crie um novo contrato se precisar de outra versão.`);
        }
      }

      const previousAttachments = parseAttachments(existing?.attachmentsJson);
      const newAttachments = (req.files || []).map((file) => ({
        path: `/uploads/documents/${file.filename}`,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      }));
      const attachments = type === "CARE_MANUAL"
        ? previousAttachments.concat(newAttachments)
        : [];
      const logoChoice = ["CATTERY", "VET", "NONE"].includes(req.body.logoChoice)
        ? req.body.logoChoice
        : "NONE";

      const data = {
        ownerId: req.session.userId,
        type,
        title: compact(req.body.title) || DOCUMENT_TYPES[type].defaultTitle,
        body: compact(req.body.body) || DOCUMENT_TYPES[type].defaultBody,
        catId: req.body.catId ? Number(req.body.catId) : null,
        clientId: req.body.clientId ? Number(req.body.clientId) : null,
        documentDate: parseDate(req.body.documentDate) || null,
        logoChoice: type === "HEALTH_CERTIFICATE" ? logoChoice : null,
        attachmentsJson: type === "CARE_MANUAL" ? JSON.stringify(attachments) : null,
      };

      const saved = existing
        ? await prisma.catteryDocument.update({ where: { id: existing.id }, data })
        : await prisma.catteryDocument.create({ data });

      if (type === "HEALTH_CERTIFICATE") {
        await prisma.userSettings.upsert({
          where: { userId: req.session.userId },
          update: {
            healthCertificateLogoPreference: logoChoice,
            healthCertificateDeclarationText: data.body,
          },
          create: {
            userId: req.session.userId,
            healthCertificateLogoPreference: logoChoice,
            healthCertificateDeclarationText: data.body,
          },
        });
      }

      if (existing && type === "SALE_CONTRACT") {
        await notifyUnsignedSignatureRequests(saved, req);
      }

      res.redirect(`/documentos/${saved.id}/editar?saved=1`);
    } catch (err) {
      next(err);
    }
  });

  router.post("/documentos/:id/assinatura/criar", requireAuth, requirePermission("admin.documents"), async (req, res, next) => {
    try {
      const document = await loadDocument(req.params.id, req.session.userId);
      if (!document || document.type !== "SALE_CONTRACT") {
        return res.redirect("/documentos?error=Contrato não encontrado.");
      }

      const settings = await prisma.userSettings.findUnique({ where: { userId: req.session.userId } });
      const smtpConfig = buildUserSmtpConfig(settings);
      const signerEmail = compact(req.body.signerEmail || document.client?.email);
      const signerName = compact(req.body.signerName || document.client?.fullName);
      const signerDocument = compact(req.body.signerDocument || document.client?.document);
      const signerPhone = compact(req.body.signerPhone || document.client?.phone);
      const token = crypto.randomBytes(32).toString("hex");
      const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
      const unsignedPdf = await buildDocumentPdfBuffer({
        document,
        cat: shapeCat(document.cat),
        client: document.client,
        settings: settings || {},
        user,
      });

      const signatureRequest = await prisma.documentSignatureRequest.create({
        data: {
          ownerId: req.session.userId,
          documentId: document.id,
          token,
          signerName: signerName || null,
          signerEmail: signerEmail || null,
          signerDocument: signerDocument || null,
          signerPhone: signerPhone || null,
          status: "PENDING",
          documentHash: hashBuffer(unsignedPdf),
        },
      });
      await logSignatureEvent(signatureRequest.id, "LINK_CREATED", req, "Link público criado.");

      const signUrl = `${publicBaseUrl(req)}/assinatura/${token}`;
      const pixelUrl = `${publicBaseUrl(req)}/assinatura/${token}/pixel.png`;
      if (signerEmail && smtpConfig) {
        await sendStatusEmail({
          to: signerEmail,
          subject: `Assinatura eletrônica - ${document.title || "Contrato"}`,
          html: `
            <p>Olá${signerName ? `, ${signerName}` : ""}.</p>
            <p>Você recebeu um contrato para leitura e assinatura eletrônica.</p>
            <p><a href="${signUrl}" style="display:inline-block;padding:12px 18px;background:#8a3328;color:#fff;text-decoration:none;border-radius:6px;">Abrir contrato</a></p>
            <p>Se o botão não abrir, copie este link: ${signUrl}</p>
            <img src="${pixelUrl}" width="1" height="1" alt="" />
          `,
          smtpConfig,
          from: smtpConfig.from,
        });
        await logSignatureEvent(signatureRequest.id, "EMAIL_SENT", req, "E-mail aceito pelo SMTP.");
        await prisma.documentSignatureRequest.update({
          where: { id: signatureRequest.id },
          data: { status: "SENT" },
        });
      }

      res.redirect(`/documentos/${document.id}/editar?saved=1`);
    } catch (err) {
      next(err);
    }
  });

  router.post("/documentos/:id/assinatura/:requestId/:action", requireAuth, requirePermission("admin.documents"), async (req, res, next) => {
    try {
      const document = await loadDocument(req.params.id, req.session.userId);
      if (!document || document.type !== "SALE_CONTRACT") {
        return res.redirect("/documentos?error=Contrato não encontrado.");
      }
      const signatureRequest = await prisma.documentSignatureRequest.findFirst({
        where: {
          id: Number(req.params.requestId),
          documentId: document.id,
          ownerId: req.session.userId,
        },
      });
      if (!signatureRequest) {
        return res.redirect(`/documentos/${document.id}/editar?error=Link de assinatura não encontrado.`);
      }
      if (signatureRequest.status === "SIGNED") {
        return res.redirect(`/documentos/${document.id}/editar?error=Contrato já assinado não pode ser bloqueado ou cancelado.`);
      }

      const action = req.params.action;
      if (action === "cancelar") {
        await prisma.documentSignatureRequest.update({
          where: { id: signatureRequest.id },
          data: { status: "CANCELED" },
        });
        await logSignatureEvent(signatureRequest.id, "CONTRACT_CANCELED", req, "Contrato cancelado pelo usuário.");
      } else if (action === "bloquear") {
        await prisma.documentSignatureRequest.update({
          where: { id: signatureRequest.id },
          data: { status: "BLOCKED" },
        });
        await logSignatureEvent(signatureRequest.id, "CONTRACT_BLOCKED", req, "Contrato bloqueado pelo usuário.");
      } else if (action === "desbloquear") {
        if (signatureRequest.status !== "BLOCKED") {
          return res.redirect(`/documentos/${document.id}/editar?error=Somente contratos bloqueados podem ser desbloqueados.`);
        }
        await prisma.documentSignatureRequest.update({
          where: { id: signatureRequest.id },
          data: { status: "VIEWED" },
        });
        await logSignatureEvent(signatureRequest.id, "CONTRACT_UNBLOCKED", req, "Contrato desbloqueado pelo usuário.");
      }

      const target = req.query.returnTo === "assinaturas"
        ? "/documentos/assinaturas?saved=1"
        : `/documentos/${document.id}/editar?saved=1`;
      res.redirect(target);
    } catch (err) {
      next(err);
    }
  });

  router.get("/documentos/:id/pdf", requireAuth, requirePermission("admin.documents"), async (req, res, next) => {
    try {
      const document = await loadDocument(req.params.id, req.session.userId);
      if (!document) return res.redirect("/documentos?error=Documento não encontrado.");
      const settings = await prisma.userSettings.findUnique({ where: { userId: req.session.userId } });
      const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
      const buffer = await buildDocumentPdfBuffer({
        document,
        cat: shapeCat(document.cat),
        client: document.client,
        settings: settings || {},
        user,
      });
      const filename = `${(document.title || "documento").replace(/[^\wÀ-ÿ-]+/g, "-")}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  });

  router.post("/documentos/:id/enviar", requireAuth, requirePermission("admin.documents"), async (req, res, next) => {
    const document = await loadDocument(req.params.id, req.session.userId);
    if (!document || document.type !== "CARE_MANUAL") return res.redirect("/documentos?error=Manual não encontrado.");

    const settings = await prisma.userSettings.findUnique({ where: { userId: req.session.userId } });
    const smtpConfig = buildUserSmtpConfig(settings);
    const recipientEmail = compact(req.body.recipientEmail);
    const recipientName = compact(req.body.recipientName);

    if (!smtpConfig) {
      return res.redirect(`/documentos/${document.id}/editar?error=Configure o SMTP próprio em Configurações antes de enviar.`);
    }
    if (!recipientEmail) {
      return res.redirect(`/documentos/${document.id}/editar?error=Informe um e-mail para envio.`);
    }

    try {
      const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
      const buffer = await buildDocumentPdfBuffer({
        document,
        cat: shapeCat(document.cat),
        client: document.client,
        settings: settings || {},
        user,
      });
      const attachments = [
        { filename: `${document.title || "manual"}.pdf`, content: buffer },
        ...parseAttachments(document.attachmentsJson)
          .map((file) => {
            const localPath = localUploadPath(file.path);
            return localPath ? { filename: file.originalName || path.basename(localPath), path: localPath } : null;
          })
          .filter(Boolean),
      ];

      await sendStatusEmail({
        to: recipientEmail,
        subject: document.title || "Manual de Cuidados Básicos",
        html: `<p>Olá${recipientName ? `, ${recipientName}` : ""}.</p><p>Segue em anexo o manual de cuidados básicos enviado pelo gatil.</p>`,
        smtpConfig,
        from: smtpConfig.from,
        attachments,
      });
      await prisma.documentEmailLog.create({
        data: {
          ownerId: req.session.userId,
          documentId: document.id,
          recipientEmail,
          recipientName: recipientName || null,
          status: "ENVIADO",
          message: "E-mail aceito pelo SMTP.",
        },
      });
      res.redirect(`/documentos/${document.id}/editar?sent=1`);
    } catch (err) {
      console.error("Erro ao enviar manual:", err);
      await prisma.documentEmailLog.create({
        data: {
          ownerId: req.session.userId,
          documentId: document.id,
          recipientEmail,
          recipientName: recipientName || null,
          status: "ERRO",
          message: err.message || "Falha ao enviar.",
        },
      });
      res.redirect(`/documentos/${document.id}/editar?error=Erro ao enviar o manual.`);
    }
  });

  async function loadSignatureRequestByToken(token) {
    return prisma.documentSignatureRequest.findUnique({
      where: { token },
      include: {
        document: {
          include: {
            owner: { include: { settings: true } },
            cat: {
              include: {
                owner: { include: { settings: true } },
                mother: true,
                litterKitten: { include: { litter: true } },
              },
            },
            client: true,
          },
        },
        events: { orderBy: { createdAt: "asc" } },
      },
    });
  }

  router.get("/assinatura/:token/pixel.png", async (req, res) => {
    const request = await loadSignatureRequestByToken(req.params.token);
    if (signatureIsAccessible(request) && !request.events.some((event) => event.type === "EMAIL_OPENED")) {
      await logSignatureEvent(request.id, "EMAIL_OPENED", req, "Imagem de rastreamento carregada.");
      await prisma.documentSignatureRequest.update({
        where: { id: request.id },
        data: { status: request.status === "SIGNED" ? "SIGNED" : "OPENED" },
      });
    }
    const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(pixel);
  });

  router.get("/assinatura/:token", async (req, res, next) => {
    try {
      const signatureRequest = await loadSignatureRequestByToken(req.params.token);
      if (!signatureRequest) return res.status(404).send("Link de assinatura não encontrado.");
      if (!signatureIsAccessible(signatureRequest)) {
        return res.render("documents/sign-public", {
          signatureRequest,
          document: signatureRequest.document,
          cat: null,
          client: null,
          settings: signatureRequest.document.owner?.settings || {},
          externalPdf: null,
          bodyText: "",
          success: null,
          error: signatureRequest.status === "CANCELED"
            ? "Este contrato foi cancelado pelo remetente e não está mais disponível."
            : "Este contrato está bloqueado temporariamente pelo remetente.",
          unavailableStatus: signatureRequest.status,
        });
      }
      if (!signatureRequest.events.some((event) => event.type === "DOCUMENT_VIEWED")) {
        await logSignatureEvent(signatureRequest.id, "DOCUMENT_VIEWED", req, "Documento aberto pelo cliente.");
        await prisma.documentSignatureRequest.update({
          where: { id: signatureRequest.id },
          data: { status: signatureRequest.status === "SIGNED" ? "SIGNED" : "VIEWED" },
        });
      }
      res.render("documents/sign-public", {
        signatureRequest,
        document: signatureRequest.document,
        cat: shapeCat(signatureRequest.document.cat),
        client: signatureRequest.document.client,
        settings: signatureRequest.document.owner?.settings || {},
        externalPdf: externalPdfAttachment(signatureRequest.document),
        bodyText: renderTemplate(signatureRequest.document.body, {
          document: signatureRequest.document,
          cat: shapeCat(signatureRequest.document.cat),
          client: signatureRequest.document.client,
          settings: signatureRequest.document.owner?.settings || {},
        }),
        success: req.query.otp === "1" ? "Código enviado para o e-mail informado." : null,
        error: req.query.error || null,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/assinatura/:token/otp", async (req, res, next) => {
    try {
      const signatureRequest = await loadSignatureRequestByToken(req.params.token);
      if (!signatureRequest) return res.status(404).send("Link de assinatura não encontrado.");
      if (!signatureIsAccessible(signatureRequest)) return res.status(403).send("Este contrato não está disponível para acesso.");
      if (signatureRequest.status === "SIGNED") return res.redirect(`/assinatura/${req.params.token}`);

      const signerEmail = compact(req.body.signerEmail || signatureRequest.signerEmail);
      const signerName = compact(req.body.signerName || signatureRequest.signerName);
      const signerDocument = compact(req.body.signerDocument || signatureRequest.signerDocument);
      if (!signerEmail || !signerName || !signerDocument) {
        return res.redirect(`/assinatura/${req.params.token}?error=Informe nome, documento e e-mail para receber o código.`);
      }
      const settings = signatureRequest.document.owner?.settings;
      const smtpConfig = buildUserSmtpConfig(settings);
      if (!smtpConfig) {
        return res.redirect(`/assinatura/${req.params.token}?error=O remetente ainda não possui SMTP configurado.`);
      }
      const otp = generateOtp();
      await prisma.documentSignatureRequest.update({
        where: { id: signatureRequest.id },
        data: {
          signerEmail,
          signerName,
          signerDocument,
          otpHash: hashOtp(signatureRequest.token, otp),
          otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
          status: "OTP_SENT",
        },
      });
      await sendStatusEmail({
        to: signerEmail,
        subject: "Código de assinatura eletrônica",
        html: `<p>Seu código de assinatura eletrônica é:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${otp}</p><p>Este código expira em 10 minutos.</p>`,
        smtpConfig,
        from: smtpConfig.from,
      });
      await logSignatureEvent(signatureRequest.id, "OTP_SENT", req, "Código OTP enviado por e-mail.");
      res.redirect(`/assinatura/${req.params.token}?otp=1`);
    } catch (err) {
      next(err);
    }
  });

  router.post("/assinatura/:token/assinar", async (req, res, next) => {
    try {
      const signatureRequest = await loadSignatureRequestByToken(req.params.token);
      if (!signatureRequest) return res.status(404).send("Link de assinatura não encontrado.");
      if (!signatureIsAccessible(signatureRequest)) return res.status(403).send("Este contrato não está disponível para assinatura.");
      if (signatureRequest.status === "SIGNED") return res.redirect(`/assinatura/${req.params.token}`);

      const otp = compact(req.body.otp);
      const expectedHash = signatureRequest.otpHash || "";
      if (!otp || hashOtp(signatureRequest.token, otp) !== expectedHash) {
        return res.redirect(`/assinatura/${req.params.token}?error=Código OTP inválido.`);
      }
      if (!signatureRequest.otpExpiresAt || new Date(signatureRequest.otpExpiresAt).getTime() < Date.now()) {
        return res.redirect(`/assinatura/${req.params.token}?error=Código OTP expirado. Solicite um novo código.`);
      }
      if (req.body.acceptTerms !== "on") {
        return res.redirect(`/assinatura/${req.params.token}?error=Confirme a leitura e aceite do contrato para assinar.`);
      }

      const latitude = compact(req.body.latitude);
      const longitude = compact(req.body.longitude);
      const signedAt = new Date();
      await logSignatureEvent(signatureRequest.id, "OTP_VERIFIED", req, "Código OTP validado.", { latitude, longitude });
      const updated = await prisma.documentSignatureRequest.update({
        where: { id: signatureRequest.id },
        data: {
          status: "SIGNED",
          signedAt,
          otpVerifiedAt: signedAt,
          signatureText: compact(req.body.signatureText || signatureRequest.signerName),
          ipAddress: getClientIp(req),
          userAgent: req.headers["user-agent"] || "",
          browser: browserFromUserAgent(req.headers["user-agent"]),
          latitude: latitude ? Number(latitude) : null,
          longitude: longitude ? Number(longitude) : null,
        },
        include: {
          document: {
            include: {
              owner: { include: { settings: true } },
              cat: {
                include: {
                  owner: { include: { settings: true } },
                  mother: true,
                  litterKitten: { include: { litter: true } },
                },
              },
              client: true,
            },
          },
          events: { orderBy: { createdAt: "asc" } },
        },
      });
      await logSignatureEvent(signatureRequest.id, "SIGNED", req, "Contrato assinado eletronicamente.", { latitude, longitude });
      const finalRequest = await loadSignatureRequestByToken(req.params.token);
      const pdfBuffer = ["EXTERNAL_CONTRACT", "SIGNATURE_DOCUMENT"].includes(finalRequest.document.type)
        ? await buildSignedExternalPdfBuffer({ document: finalRequest.document, signatureRequest: finalRequest })
        : await buildDocumentPdfBuffer({
            document: finalRequest.document,
            cat: shapeCat(finalRequest.document.cat),
            client: finalRequest.document.client,
            settings: finalRequest.document.owner?.settings || {},
            user: finalRequest.document.owner,
            signatureRequest: finalRequest,
          });
      const target = evidenceUploadPath(`documento-assinado-${updated.id}.pdf`);
      fs.writeFileSync(target.local, pdfBuffer);
      await prisma.documentSignatureRequest.update({
        where: { id: signatureRequest.id },
        data: { evidencePdfPath: target.web },
      });
      res.redirect(`/assinatura/${req.params.token}`);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
