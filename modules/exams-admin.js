const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const archiver = require("archiver");
const { canViewAllData } = require("../utils/access");
const { getFileUploadLimit, validateFilesForRole } = require("../utils/planLimits");
const {
  parseDate,
  formatDate,
  formatDateInput,
  addYears,
  buildDisplayName,
  classifyOperationalCat,
} = require("../utils/cattery-admin");

const CATEGORY_META = [
  { key: "sires", label: "Padreadores", color: "#2563eb" },
  { key: "dams", label: "Matrizes", color: "#db2777" },
  { key: "kittens", label: "Filhotes", color: "#16a34a" },
  { key: "founders", label: "Fundadores", color: "#f59e0b" },
];

const SourceOptions = ["Antecedente", "Próprio", "Realizar"];
const PkdefResults = ["N/N", "N/K"];
const PrabfResults = ["N/N", "N/PRA"];
const UPLOADS_ROOT = process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");
const EXAMS_UPLOAD_DIR = path.join(UPLOADS_ROOT, "exams");

if (!fs.existsSync(EXAMS_UPLOAD_DIR)) {
  fs.mkdirSync(EXAMS_UPLOAD_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, EXAMS_UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      cb(null, `exam-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: getFileUploadLimit("ADMIN").bytes, files: 12 },
  fileFilter: (req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    cb(allowed.includes(file.mimetype) ? null : new Error("Envie exames em PDF ou imagem."), allowed.includes(file.mimetype));
  },
});

function safeJsonParse(value, fallback = []) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function examFilePath(file) {
  return file ? `/uploads/exams/${file.filename}` : null;
}

function filesByField(files = []) {
  const map = new Map();
  files.forEach((file) => {
    if (!map.has(file.fieldname)) map.set(file.fieldname, []);
    map.get(file.fieldname).push(file);
  });
  return map;
}

function parseExamDocs(value) {
  const parsed = safeJsonParse(value, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function sortHistory(history) {
  return [...history]
    .map((value) => ({
      ...value,
      date: formatDateInput(value.date),
    }))
    .sort((a, b) => {
      const aDate = parseDate(a.date);
      const bDate = parseDate(b.date);
      if (!aDate && !bDate) return 0;
      if (!aDate) return -1;
      if (!bDate) return 1;
      return aDate - bDate;
    });
}

function computeNextEco(birthDate, history) {
  const sorted = sortHistory(history).filter((item) => parseDate(item.date));
  const birth = parseDate(birthDate);

  if (!sorted.length) {
    return birth ? addYears(birth, 1) : null;
  }

  const last = parseDate(sorted[sorted.length - 1].date);
  return last ? addYears(last, 1) : null;
}

function isUrgentRow(pkdefSource, prabfSource, nextEco) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (pkdefSource === "Realizar" || prabfSource === "Realizar") {
    return true;
  }

  return Boolean(nextEco && nextEco < today);
}

function safeFileName(value) {
  return String(value || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "arquivo";
}

function resolveUploadPath(filePath) {
  if (!filePath) return null;
  let rel = String(filePath).replace(/\\/g, "/").trim();
  const uploadsIndex = rel.indexOf("/uploads/");
  if (uploadsIndex >= 0) rel = rel.slice(uploadsIndex + "/uploads/".length);
  rel = rel.replace(/^\/+/, "");
  while (rel.startsWith("uploads/")) rel = rel.replace(/^uploads\//, "");

  const roots = [
    process.env.UPLOADS_DIR || "/var/data/uploads",
    path.join(__dirname, "..", "public", "uploads"),
  ];

  for (const root of roots) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) return abs;
  }

  return null;
}

function examConfig(type) {
  if (type === "pkdef") {
    return {
      label: "PKDef",
      sourceField: "pkdefSource",
      resultField: "pkdefResult",
      docKey: "pkdef",
    };
  }

  return {
    label: "PRA",
    sourceField: "prabfSource",
    resultField: "prabfResult",
    docKey: "pra",
  };
}

function ownsNnExam(cat, config) {
  const docs = parseExamDocs(cat?.examDocsJson);
  const plan = cat?.examPlan || {};
  return plan[config.sourceField] === "Próprio" &&
    plan[config.resultField] === "N/N" &&
    docs[config.docKey];
}

async function loadCatForPrint(prisma, scope, catId) {
  return prisma.cat.findFirst({
    where: { id: Number(catId), ...scope },
    include: { examPlan: true },
  });
}

async function loadAncestor(prisma, id) {
  if (!id) return null;
  return prisma.cat.findUnique({
    where: { id },
    include: { examPlan: true },
  });
}

async function collectGeneticExamDocs(prisma, cat, type, relationLabel = "Gato", seen = new Set()) {
  if (!cat || seen.has(cat.id)) return { complete: false, docs: [] };
  seen.add(cat.id);

  const config = examConfig(type);
  const ownDocs = parseExamDocs(cat.examDocsJson);
  const displayName = buildDisplayName(cat);

  if (ownsNnExam(cat, config)) {
    return {
      complete: true,
      docs: [{
        file: ownDocs[config.docKey],
        label: `${config.label} - ${relationLabel} - ${displayName}`,
      }],
    };
  }

  const father = await loadAncestor(prisma, cat.fatherId);
  const mother = await loadAncestor(prisma, cat.motherId);
  const fatherResult = father
    ? await collectGeneticExamDocs(prisma, father, type, `${relationLabel} - Pai`, new Set(seen))
    : { complete: false, docs: [] };
  const motherResult = mother
    ? await collectGeneticExamDocs(prisma, mother, type, `${relationLabel} - Mãe`, new Set(seen))
    : { complete: false, docs: [] };

  return {
    complete: Boolean(father && mother && fatherResult.complete && motherResult.complete),
    docs: [...fatherResult.docs, ...motherResult.docs],
  };
}

function hcmDocs(cat, onlyLatest = false) {
  const history = sortHistory(safeJsonParse(cat?.examPlan?.ecoHistoryJson, []))
    .filter((item) => item.date && item.file)
    .sort((a, b) => {
      const aDate = parseDate(a.date);
      const bDate = parseDate(b.date);
      return (bDate || 0) - (aDate || 0);
    });

  return (onlyLatest ? history.slice(0, 1) : history).map((item) => ({
    file: item.file,
    label: `HCM - ${buildDisplayName(cat)} - ${formatDate(item.date) || item.date}`,
  }));
}

function sendExamArchive(res, cat, typeLabel, docs) {
  const usableDocs = docs
    .map((doc) => ({ ...doc, abs: resolveUploadPath(doc.file) }))
    .filter((doc) => doc.abs);

  if (!usableDocs.length) {
    return res.status(404).send("Nenhum arquivo de exame encontrado para impressão.");
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeFileName(typeLabel)}-${safeFileName(buildDisplayName(cat))}.zip"`
  );

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);

  const usedNames = new Map();
  usableDocs.forEach((doc) => {
    const ext = path.extname(doc.abs) || path.extname(doc.file || "") || ".pdf";
    const base = safeFileName(doc.label);
    const count = (usedNames.get(base) || 0) + 1;
    usedNames.set(base, count);
    archive.file(doc.abs, { name: `${base}${count > 1 ? `-${count}` : ""}${ext}` });
  });

  archive.finalize();
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  function ownerScope(req) {
    return canViewAllData(req.session?.userRole) ? {} : { ownerId: req.session.userId };
  }

  async function ensureCatAccess(req, catId) {
    const cat = await prisma.cat.findFirst({
      where: { id: catId, ...ownerScope(req) },
      select: { id: true },
    });
    return Boolean(cat);
  }

  router.get(
    "/admin/exams",
    requireAuth,
    requirePermission("admin.exams"),
    async (req, res) => {
      const cats = await prisma.cat.findMany({
        where: ownerScope(req),
        include: {
          examPlan: true,
        },
        orderBy: { name: "asc" },
      });

      const grouped = Object.fromEntries(
        CATEGORY_META.map((category) => [category.key, []])
      );

      cats.forEach((cat) => {
        const category = classifyOperationalCat(cat, {
          includeDeliveredKittensInHistory: false,
        });
        if (!category) return;

        const ecoHistory = safeJsonParse(cat.examPlan?.ecoHistoryJson, [
          { date: "" },
        ]);
        const nextEco = computeNextEco(cat.birthDate, ecoHistory);
        const pkdefSource = cat.examPlan?.pkdefSource || "";
        const pkdefResult = cat.examPlan?.pkdefResult || "";
        const prabfSource = cat.examPlan?.prabfSource || "";
        const prabfResult = cat.examPlan?.prabfResult || "";
        const urgent = isUrgentRow(pkdefSource, prabfSource, nextEco);
        const examDocs = parseExamDocs(cat.examDocsJson);

        grouped[category].push({
          cat,
          displayName: buildDisplayName(cat),
          birthDateLabel: formatDate(cat.birthDate) || "-",
          pkdefSource,
          pkdefResult,
          prabfSource,
          prabfResult,
          ecoHistory,
          examDocs,
          nextEco,
          urgent,
        });
      });

      Object.values(grouped).forEach((rows) => {
        rows.sort((a, b) => {
          if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;

          const aNext = a.nextEco || new Date(8640000000000000);
          const bNext = b.nextEco || new Date(8640000000000000);
          return aNext - bNext;
        });
      });

      res.render("admin-exams/index", {
        user: req.user,
        currentPath: req.path,
        categories: CATEGORY_META,
        grouped,
        printCats: cats
          .map((cat) => ({ id: cat.id, label: buildDisplayName(cat) }))
          .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
        sourceOptions: SourceOptions,
        pkdefResults: PkdefResults,
        prabfResults: PrabfResults,
        formatDate,
      });
    }
  );

  router.get(
    "/admin/exams/print",
    requireAuth,
    requirePermission("admin.exams"),
    async (req, res) => {
      const cat = await loadCatForPrint(prisma, ownerScope(req), req.query.catId);
      if (!cat) return res.status(404).send("Gato não encontrado.");

      const type = String(req.query.type || "");
      let docs = [];
      let label = "Exames";

      if (type === "pkdef") {
        docs = (await collectGeneticExamDocs(prisma, cat, "pkdef")).docs;
        label = "PKDef";
      } else if (type === "pra") {
        docs = (await collectGeneticExamDocs(prisma, cat, "pra")).docs;
        label = "PRA";
      } else if (type === "hcm-latest") {
        docs = hcmDocs(cat, true);
        label = "Ultimo-HCM";
      } else if (type === "hcm-all") {
        docs = hcmDocs(cat, false);
        label = "Todos-HCM";
      } else if (type === "all") {
        docs = [
          ...(await collectGeneticExamDocs(prisma, cat, "pkdef")).docs,
          ...(await collectGeneticExamDocs(prisma, cat, "pra")).docs,
          ...hcmDocs(cat, false),
        ];
        label = "Todos-Exames";
      } else {
        return res.status(400).send("Tipo de impressão inválido.");
      }

      return sendExamArchive(res, cat, label, docs);
    }
  );

  router.post(
    "/admin/exams/:catId",
    requireAuth,
    requirePermission("admin.exams"),
    (req, res, next) => {
      upload.any()(req, res, (err) => {
        if (!err) return next();
        const message = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
          ? `Um dos arquivos ultrapassa ${getFileUploadLimit(req.session?.userRole).label}.`
          : err.message || "Erro ao enviar arquivo de exame.";
        if (req.get("X-Autosave") === "true") return res.status(400).send(message);
        return res.status(400).send(message);
      });
    },
    async (req, res) => {
      try {
        const catId = Number(req.params.catId);
        if (!(await ensureCatAccess(req, catId))) {
          return res.status(403).send("Você não tem acesso a este gato.");
        }
        validateFilesForRole(req.files || [], req.session?.userRole);
        const existingCat = await prisma.cat.findUnique({
          where: { id: catId },
          select: { examDocsJson: true },
        });
        const examDocs = parseExamDocs(existingCat?.examDocsJson);
        const uploaded = filesByField(req.files || []);
        const ecoDates = [].concat(req.body.ecoDates || []);
        const ecoFiles = [].concat(req.body.ecoFiles || []);

        const ecoHistory = ecoDates
          .map((date, index) => ({
            date: formatDateInput(date),
            file: examFilePath(uploaded.get(`hcmDoc_${index}`)?.[0]) || ecoFiles[index] || "",
          }))
          .filter((item) => item.date !== "");

        const pkdefUpload = examFilePath(uploaded.get("pkdefDoc")?.[0]);
        const prabfUpload = examFilePath(uploaded.get("prabfDoc")?.[0]);

        if (pkdefUpload) examDocs.pkdef = pkdefUpload;
        if (prabfUpload) examDocs.pra = prabfUpload;
        examDocs.hcm = ecoHistory
          .filter((item) => item.file)
          .map((item) => ({ date: item.date, file: item.file }));

        await prisma.examPlan.upsert({
          where: { catId },
          create: {
            catId,
            pkdefSource: req.body.pkdefSource || null,
            pkdefResult: req.body.pkdefResult || null,
            prabfSource: req.body.prabfSource || null,
            prabfResult: req.body.prabfResult || null,
            ecoHistoryJson: JSON.stringify(ecoHistory),
          },
          update: {
            pkdefSource: req.body.pkdefSource || null,
            pkdefResult: req.body.pkdefResult || null,
            prabfSource: req.body.prabfSource || null,
            prabfResult: req.body.prabfResult || null,
            ecoHistoryJson: JSON.stringify(ecoHistory),
          },
        });

        await prisma.cat.update({
          where: { id: catId },
          data: { examDocsJson: JSON.stringify(examDocs) },
        });

        if (req.get("X-Autosave") === "true") {
          return res.sendStatus(204);
        }

        res.redirect("/admin/exams");
      } catch (err) {
        const message = err.message || "Erro ao salvar exames.";
        if (req.get("X-Autosave") === "true") return res.status(err.status || 400).send(message);
        return res.status(err.status || 400).send(message);
      }
    }
  );

  return router;
};
