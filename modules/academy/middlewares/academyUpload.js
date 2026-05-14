const fs = require("fs");
const path = require("path");
const multer = require("multer");

const ACADEMY_UPLOAD_TYPES = {
  "image/jpeg": "IMAGE",
  "image/png": "IMAGE",
  "image/webp": "IMAGE",
  "image/gif": "IMAGE",
  "application/pdf": "DOCUMENT",
  "video/mp4": "VIDEO",
  "video/webm": "VIDEO",
};

function createAcademyUpload() {
  const diskRoot =
    process.env.UPLOADS_DIR || path.join(__dirname, "..", "..", "..", "public", "uploads");
  const uploadDir = path.join(diskRoot, "academy");

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeBase = path
        .basename(file.originalname, ext)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase()
        .slice(0, 40) || "arquivo";
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeBase}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!ACADEMY_UPLOAD_TYPES[file.mimetype]) {
        return cb(new Error("Arquivo não permitido. Use imagens, PDF, MP4 ou WebM."));
      }
      cb(null, true);
    },
  });
}

function academyMediaTypeForMime(mimeType) {
  return ACADEMY_UPLOAD_TYPES[mimeType] || "FILE";
}

module.exports = {
  createAcademyUpload,
  academyMediaTypeForMime,
};
