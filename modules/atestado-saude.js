const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

module.exports = (requireAuth, requireAdmin, requirePermission) => {
  const router = express.Router();

  const UPLOADS_ROOT =
    process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");
  const sharedDir = path.join(UPLOADS_ROOT, "shared");
  const FILE_PATH = path.join(sharedDir, "atestado-saude-reproducao.pdf");
  const legacyFilePath = path.join(
    __dirname,
    "..",
    "public",
    "uploads",
    "shared",
    "atestado-saude-reproducao.pdf"
  );

  if (!fs.existsSync(sharedDir)) {
    fs.mkdirSync(sharedDir, { recursive: true });
  }

  // ============================
  // USER → DOWNLOAD
  // ============================
  router.get(
    "/services/atestado-saude-reproducao",
    requireAuth,
    requirePermission("services.downloads"),
    (req, res) => {
      const availablePath = fs.existsSync(FILE_PATH)
        ? FILE_PATH
        : legacyFilePath;

      if (!fs.existsSync(availablePath)) {
        return res.status(404).send("Arquivo não disponível.");
      }

      res.download(availablePath, "Atestado-de-Saude-para-Reproducao.pdf");
    }
  );

  // ============================
  // ADMIN → TELA DE UPLOAD
  // ============================
  router.get(
    "/admin/atestado-saude-reproducao",
    requireAuth,
    requireAdmin,
    (req, res) => {
      res.render("admin/atestado-saude-upload", {
        user: req.user,
        currentPath: req.path,
      });
    }
  );

  // ============================
  // ADMIN → SUBSTITUIR ARQUIVO
  // ============================
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, sharedDir);
      },
      filename: (req, file, cb) => {
        cb(null, "atestado-saude-reproducao.pdf"); // sempre substitui
      },
    }),
    fileFilter: (req, file, cb) => {
      if (file.mimetype !== "application/pdf") {
        return cb(new Error("Apenas PDF é permitido"));
      }
      cb(null, true);
    },
  });

  router.post(
    "/admin/atestado-saude-reproducao",
    requireAuth,
    requireAdmin,
    upload.single("file"),
    (req, res) => {
      if (!req.file) {
        return res.status(400).send("Nenhum arquivo enviado.");
      }

      res.redirect("/services");
    }
  );

  return router;
};
