const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { isAdminRole, normalizeRole } = require("../utils/access");

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  const UPLOADS_ROOT =
    process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");

  const uploadDir = path.join(UPLOADS_ROOT, "second-copy");

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },

    filename: (req, file, cb) => {
      const safeName = file.originalname
        .replace(/\s+/g, "_")
        .replace(/[^\w.-]/g, "");
      cb(null, `${Date.now()}-${safeName}`);
    },
  });

  const upload = multer({ storage });

  // FORM
router.get(
  "/services/segunda-via-alteracoes",
  requireAuth,
  requirePermission("service.secondCopy"),
  async (req, res) => {
  try {
    const userId = req.session.userId;
    const role = normalizeRole(req.session.userRole);

    const cats = await prisma.cat.findMany({
      where: isAdminRole(role) ? {} : { ownerId: userId },
      orderBy: { name: "asc" },
    });

    return res.render("service-forms/second-copy-alterations", {
      user: req.user,          // já vem do middleware
      cats,
      currentPath: req.path,
    });
  } catch (err) {
    console.error("Erro ao abrir Segunda Via / Alterações:", err);
    return res.status(500).send("Erro ao abrir formulário");
  }
  }
);


  // SUBMIT
  router.post(
    "/services/segunda-via-alteracoes",
    requireAuth,
    requirePermission("service.secondCopy"),
    upload.array("attachments", 5),
    async (req, res) => {
      const { catId, requestType, details, newValue } = req.body;

// ✅ GARANTIR QUE details e newValue SEJAM STRING (não array)
const detailsStr = Array.isArray(details)
  ? details.filter(Boolean).join("\n")
  : (details || null);

const newValueStr = Array.isArray(newValue)
  ? newValue.filter(Boolean).join(" | ")
  : (newValue || null);


      const userId = req.session.userId;

      const service = await prisma.serviceRequest.create({
        data: {
          userId,
          type: "Segunda Via e Alterações",
          description: requestType,
        },
      });

      await prisma.serviceStatus.create({
        data: {
          serviceId: service.id,
          status: "ENVIADO_GATARINA",
        },
      });

      await prisma.secondCopyRequest.create({
        data: {
          serviceRequestId: service.id,
          catId: catId ? Number(catId) : null,
          requestType,
          details: detailsStr,
          newValue: newValueStr,
          attachmentsJson: JSON.stringify(
  (req.files || []).map(f => `/uploads/second-copy/${f.filename}`)
),
        },
      });

      res.redirect("/my-services");
    }
  );

  return router;
};
