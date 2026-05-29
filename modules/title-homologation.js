
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
const parsedCertificates = certificates
  ? JSON.parse(certificates)
  : [];

// 🔹 arquivos enviados (multer)
const uploadedFiles = req.files || [];
validateFilesForRole(uploadedFiles, req.session?.userRole);

console.log("REQ.FILES:", uploadedFiles.map(f => ({
  fieldname: f.fieldname,
  originalname: f.originalname,
  filename: f.filename
})));


// 🔥 PASSO 4 — VINCULAR ARQUIVO AO CERTIFICADO (AQUI!)
parsedCertificates.forEach((cert, index) => {
  if (uploadedFiles[index]) {
    cert.file = `/uploads/title-certificates/${uploadedFiles[index].filename}`;
  }
});

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
        certificatesJson: JSON.stringify(parsedCertificates),
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
