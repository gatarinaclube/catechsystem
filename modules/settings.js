const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const MEMBERSHIP_OPTIONS = ["FIFe", "TICa", "WCF"];
const EXAM_OPTIONS = ["PKDef", "PKD", "PRA", "HCM - Genético", "HCM - Doppler"];
const BREED_OPTIONS = [
  "ABY","SOM","ACL","ACS","BAL","SIA","BEN","BLH","BSH","BML","BOM","BUR",
  "CHA","CRX","DRX","DSP","EUR","EXO","PER","GRX","HCL","HCS","JBS","KBL",
  "KBS","KOR","LPL","LPS","LYO","MAU","MCO","NEM","NFO","OCI","OLH","OSH",
  "PEB","RAG","RUS","SBI","SIB","SNO","SOK","SPH","SRL","SRS","THA","TUA","TUV",
];

function createLogoUploadMiddleware() {
  const diskRoot =
    process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");
  const uploadDir = path.join(diskRoot, "settings-logos");

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `logo-${req.session.userId}-${uniqueSuffix}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
      if (!allowedTypes.includes(file.mimetype)) {
        return cb(new Error("Envie o logo em PNG, JPG ou WEBP."));
      }
      cb(null, true);
    },
  });
}

function normalizeList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function filterAllowed(values, allowedValues) {
  const allowed = new Set(allowedValues);
  return normalizeList(values).filter((value, index, array) => {
    return allowed.has(value) && array.indexOf(value) === index;
  });
}

function parseJsonList(value) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();
  const logoUpload = createLogoUploadMiddleware();

  async function getSettings(userId) {
    const rows = await prisma.$queryRaw`
      SELECT "catteryName", "logoPath", "membershipsJson", "breedsJson", "examsJson"
      FROM "UserSettings"
      WHERE "userId" = ${userId}
      LIMIT 1
    `;

    const settings = rows[0] || {};

    return {
      catteryName: settings.catteryName || "",
      logoPath: settings.logoPath || "",
      memberships: filterAllowed(parseJsonList(settings.membershipsJson), MEMBERSHIP_OPTIONS),
      breeds: filterAllowed(parseJsonList(settings.breedsJson), BREED_OPTIONS),
      exams: filterAllowed(parseJsonList(settings.examsJson), EXAM_OPTIONS),
    };
  }

  router.get("/settings", requireAuth, requirePermission("admin.settings"), async (req, res) => {
    try {
      const settings = await getSettings(req.session.userId);

      res.render("settings/index", {
        user: req.user,
        currentPath: req.path,
        settings,
        membershipOptions: MEMBERSHIP_OPTIONS,
        breedOptions: BREED_OPTIONS,
        examOptions: EXAM_OPTIONS,
        success: req.query.saved === "1",
        error: null,
      });
    } catch (err) {
      console.error("Erro ao abrir configurações:", err);
      res.status(500).send("Erro ao abrir configurações.");
    }
  });

  router.post("/settings", requireAuth, requirePermission("admin.settings"), (req, res, next) => {
    logoUpload.single("logo")(req, res, (err) => {
      if (err) {
        req.uploadError = err.message || "Erro ao enviar o logo.";
      }
      next();
    });
  }, async (req, res) => {
    const existingSettings = await getSettings(req.session.userId);
    const settings = {
      catteryName: (req.body.catteryName || "").trim(),
      logoPath: req.file ? `/uploads/settings-logos/${req.file.filename}` : existingSettings.logoPath,
      memberships: filterAllowed(req.body.memberships, MEMBERSHIP_OPTIONS),
      breeds: filterAllowed(req.body.breeds, BREED_OPTIONS),
      exams: filterAllowed(req.body.exams, EXAM_OPTIONS),
    };

    try {
      if (req.uploadError) {
        throw new Error(req.uploadError);
      }

      await prisma.$executeRaw`
        INSERT INTO "UserSettings" (
          "userId",
          "catteryName",
          "logoPath",
          "membershipsJson",
          "breedsJson",
          "examsJson",
          "updatedAt"
        )
        VALUES (
          ${req.session.userId},
          ${settings.catteryName || null},
          ${settings.logoPath || null},
          ${JSON.stringify(settings.memberships)},
          ${JSON.stringify(settings.breeds)},
          ${JSON.stringify(settings.exams)},
          CURRENT_TIMESTAMP
        )
        ON CONFLICT ("userId") DO UPDATE SET
          "catteryName" = EXCLUDED."catteryName",
          "logoPath" = EXCLUDED."logoPath",
          "membershipsJson" = EXCLUDED."membershipsJson",
          "breedsJson" = EXCLUDED."breedsJson",
          "examsJson" = EXCLUDED."examsJson",
          "updatedAt" = CURRENT_TIMESTAMP
      `;

      res.redirect("/settings?saved=1");
    } catch (err) {
      console.error("Erro ao salvar configurações:", err);
      res.status(500).render("settings/index", {
        user: req.user,
        currentPath: "/settings",
        settings,
        membershipOptions: MEMBERSHIP_OPTIONS,
        breedOptions: BREED_OPTIONS,
        examOptions: EXAM_OPTIONS,
        success: false,
        error: "Erro ao salvar configurações.",
      });
    }
  });

  return router;
};
