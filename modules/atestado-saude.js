const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

module.exports = (requireAuth, requireAdmin) => {
  const router = express.Router();

  const FILE_PATH = path.join(
    __dirname,
    "../public/uploads/shared/atestado-saude-reproducao.pdf"
  );

  // ============================
  // USER → DOWNLOAD
  // ============================
  router.get("/services/atestado-saude-reproducao", requireAuth, (req, res) => {
    if (!fs.existsSync(FILE_PATH)) {
      return res.status(404).send("Arquivo não disponível.");
    }

    res.download(FILE_PATH, "Atestado-de-Saude-para-Reproducao.pdf");
  });

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
        cb(null, path.join(__dirname, "../public/uploads/shared"));
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
