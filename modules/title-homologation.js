
const fs = require("fs");
const path = require("path");

// ===============================
// PADRÃO DE UPLOAD (IGUAL AO SERVER)
// ===============================
const UPLOADS_ROOT =
  process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");

const uploadDir = path.join(UPLOADS_ROOT, "title-certificates");

// garante que a pasta exista
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const multer = require("multer");
const { getFileUploadLimit, validateFilesForRole } = require("../utils/planLimits");

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const safeName = file.originalname
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")   // remove acentos
        .replace(/[^a-zA-Z0-9._-]/g, "_"); // remove caracteres estranhos

      const unique =
        Date.now() + "-" + Math.round(Math.random() * 1e9);

      cb(null, `${unique}-${safeName}`);
    },
  }),
  limits: { fileSize: getFileUploadLimit("ADMIN").bytes },
});

const express = require("express");
const { isAdminRole, normalizeRole } = require("../utils/access");
const {
  notifyNewService,
  notifyUserServiceConfirmation,
} = require("../utils/adminNotifications");

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  function getAuthInfo(req) {
    const userId = req.session.userId;
    const role = normalizeRole(req.session.userRole);
    const isAdmin = isAdminRole(role);
    return { userId, role, isAdmin };
  }

  function parseCertificateRows(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      return Object.keys(value)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => value[key]);
    }
    if (typeof value === "string" && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  // ============================
  // FORMULÁRIO
  // ============================
  router.get(
    "/services/title-homologation",
    requireAuth,
    requirePermission("service.titleHomologation"),
    async (req, res) => {
    try {
      const { userId, isAdmin } = getAuthInfo(req);

      const cats = await prisma.cat.findMany({
        where: isAdmin ? {} : { ownerId: userId },
        orderBy: { name: "asc" },
      });

      res.render("service-forms/title-homologation", {
        user: req.user,
        currentPath: req.path,
        cats,
      });
    } catch (err) {
      console.error("Erro ao abrir Homologação de Títulos:", err);
      res.status(500).send("Erro ao abrir formulário");
    }
    }
  );

  // ============================
  // SUBMISSÃO
  // ============================
 router.post(
  "/services/title-homologation",
  requireAuth,
  requirePermission("service.titleHomologation"),
  upload.array("certificatesFiles"),
  async (req, res) => {
    try {
const { userId } = getAuthInfo(req);
const { catId, requestedTitle, certificates } = req.body;
const role = normalizeRole(req.session.userRole);

const cat = await prisma.cat.findFirst({
  where: {
    id: Number(catId),
    ...(isAdminRole(role) ? {} : { ownerId: userId }),
  },
  select: { id: true },
});

if (!cat) {
  return res.status(400).send("Gato inválido para este usuário.");
}

// 🔹 certificados (dados textuais)
const certificateRows = parseCertificateRows(req.body.certificatesRows);
const parsedCertificates = certificateRows.length
  ? certificateRows
  : parseCertificateRows(certificates);

// 🔹 arquivos enviados (multer)
const uploadedFiles = req.files || [];
validateFilesForRole(uploadedFiles, req.session?.userRole);

console.log("REQ.FILES:", uploadedFiles.map(f => ({
  fieldname: f.fieldname,
  originalname: f.originalname,
  filename: f.filename
})));


// 🔥 VINCULAR ARQUIVO AO CERTIFICADO
uploadedFiles.forEach((file, index) => {
  if (!parsedCertificates[index]) {
    parsedCertificates[index] = { date: "", judge: "" };
  }
  parsedCertificates[index].file = `/uploads/title-certificates/${file.filename}`;
});

parsedCertificates.forEach((cert, index) => {
  if (uploadedFiles[index]) {
    cert.file = `/uploads/title-certificates/${uploadedFiles[index].filename}`;
  }
});

const certificatesToSave = parsedCertificates
  .map((cert) => ({
    date: typeof cert?.date === "string" ? cert.date.trim() : "",
    judge: typeof cert?.judge === "string" ? cert.judge.trim() : "",
    file: typeof cert?.file === "string" ? cert.file.trim() : "",
  }))
  .filter((cert) => cert.date || cert.judge || cert.file);

const service = await prisma.serviceRequest.create({
  data: {
    userId,
    type: "Homologação de Títulos",
    description: `Homologação do título ${requestedTitle}`,
    status: "ENVIADO_GATARINA",
    statuses: {
      create: { status: "ENVIADO_GATARINA" },
    },
    titleHomologation: {
      create: {
        catId: Number(catId),
        requestedTitle,
        certificatesJson: JSON.stringify(certificatesToSave),
      },
    },
  },
});

await notifyNewService(prisma, service);
await notifyUserServiceConfirmation(prisma, service);

      res.redirect("/my-services");
    } catch (err) {
      console.error("Erro ao salvar Homologação de Títulos:", err);
      res.status(500).send("Erro ao enviar solicitação");
    }
  });

  return router;
};
