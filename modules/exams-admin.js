const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const archiver = require("archiver");
const { dataOwnerScope } = require("../utils/access");
const { getFileUploadLimit, validateFilesForRole } = require("../utils/planLimits");
const {
  examKittensTabEnabledFromSettings,
  selectedExamsFromSettings,
} = require("../utils/userPreferences");
const {
  parseDate,
  formatDate,
  formatDateInput,
  addMonths,
  addYears,
  buildDisplayName,
  catteryNameForCat,
  prefixWithCatteryName,
  classifyOperationalCat,
} = require("../utils/cattery-admin");

const CATEGORY_META = [
  { key: "sires", label: "Padreadores", color: "#2563eb" },
  { key: "dams", label: "Matrizes", color: "#db2777" },
  { key: "kittens", label: "Filhotes", color: "#16a34a" },
  { key: "founders", label: "Fundadores", color: "#f59e0b" },
];

const SourceOptions = ["Antecedente", "Próprio", "Realizar"];
const GENETIC_EXAMS = [
  {
    key: "pkdef",
    label: "PKDef",
    setting: "PKDef",
    planSourceField: "pkdefSource",
    planResultField: "pkdefResult",
    docKey: "pkdef",
    results: ["NN", "NK", "KK"],
    legacyResults: { "N/N": "NN", "N/K": "NK" },
  },
  {
    key: "pkd",
    label: "PKD",
    setting: "PKD",
    docKey: "pkd",
    results: ["NN", "ND", "DD"],
  },
  {
    key: "pra",
    label: "PRA",
    setting: "PRA",
    planSourceField: "prabfSource",
    planResultField: "prabfResult",
    docKey: "pra",
    results: ["NN", "NP", "PP"],
    legacyResults: { "N/N": "NN", "N/PRA": "NP" },
  },
  {
    key: "hcmGenetic",
    label: "HCM - Genético",
    setting: "HCM - Genético",
    docKey: "hcmGenetic",
    results: ["NN", "NH", "HH"],
  },
];
const HCM_DOPPLER_SETTING = "HCM - Doppler";
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

function normalizeGeneticResult(value, config) {
  const clean = String(value || "").trim().toUpperCase();
  if (!clean) return "";
  if (config.legacyResults?.[clean]) return config.legacyResults[clean];
  return clean.replace(/\//g, "");
}

function readGeneticExam(cat, config) {
  const docs = parseExamDocs(cat?.examDocsJson);
  const meta = docs.__genetic?.[config.key] || {};
  const source = config.planSourceField
    ? cat?.examPlan?.[config.planSourceField] || meta.source || ""
    : meta.source || "";
  const result = config.planResultField
    ? cat?.examPlan?.[config.planResultField] || meta.result || ""
    : meta.result || "";
  return {
    source,
    result: normalizeGeneticResult(result, config),
    file: docs[config.docKey] || meta.file || "",
  };
}

function buildExamDisplayName(cat) {
  const name = String(cat?.name || "").trim();
  if (!name) return buildDisplayName(cat);
  if (/^[A-Z]{2}\*/i.test(name)) return name;
  const catteryName = catteryNameForCat(cat);
  return [
    cat?.country ? `${cat.country}*` : null,
    prefixWithCatteryName(name, catteryName),
  ].filter(Boolean).join("");
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
  return last ? addMonths(last, 18) : null;
}

function isUrgentRow(geneticExams, nextEco) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if ((geneticExams || []).some((exam) => (
    exam.source === "Realizar" ||
    !exam.source ||
    !exam.result
  ))) {
    return true;
  }

  return Boolean(nextEco && nextEco < today);
}

function buildActiveExamFields(selectedExams) {
  return {
    genetic: GENETIC_EXAMS.filter((exam) => selectedExams.includes(exam.setting)),
    hcm: selectedExams.includes(HCM_DOPPLER_SETTING),
  };
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
  return GENETIC_EXAMS.find((exam) => exam.key === type || (type === "prabf" && exam.key === "pra"));
}

function ownsNnExam(cat, config) {
  const exam = readGeneticExam(cat, config);
  return exam.result === "NN";
}

async function loadCatForPrint(prisma, scope, catId) {
  return prisma.cat.findFirst({
    where: { id: Number(catId), ...scope },
    include: {
      owner: { include: { settings: true } },
      litterKitten: { include: { litter: true } },
      examPlan: true,
    },
  });
}

async function loadAncestor(prisma, id) {
  if (!id) return null;
  return prisma.cat.findUnique({
    where: { id },
    include: {
      owner: { include: { settings: true } },
      litterKitten: { include: { litter: true } },
      examPlan: true,
    },
  });
}

async function collectGeneticExamDocs(prisma, cat, type, relationLabel = "Gato", seen = new Set()) {
  if (!cat || seen.has(cat.id)) return { complete: false, docs: [] };
  seen.add(cat.id);

  const config = examConfig(type);
  if (!config) return { complete: false, docs: [] };
  const ownDocs = parseExamDocs(cat.examDocsJson);
  const displayName = buildDisplayName(cat);

  if (ownsNnExam(cat, config)) {
    return {
      complete: true,
      docs: ownDocs[config.docKey]
        ? [{
            file: ownDocs[config.docKey],
            label: `${config.label} - ${relationLabel} - ${displayName}`,
          }]
        : [],
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

async function resolveNnByAncestry(resolveAncestor, cat, config, cache = new Map(), seen = new Set()) {
  if (!cat || seen.has(cat.id)) return false;
  const cacheKey = `${cat.id}:${config.key}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  seen.add(cat.id);

  if (ownsNnExam(cat, config)) {
    cache.set(cacheKey, true);
    return true;
  }

  const father = await resolveAncestor(cat.fatherId);
  const mother = await resolveAncestor(cat.motherId);
  if (!father || !mother) {
    cache.set(cacheKey, false);
    return false;
  }

  const result = Boolean(
    await resolveNnByAncestry(resolveAncestor, father, config, cache, new Set(seen)) &&
    await resolveNnByAncestry(resolveAncestor, mother, config, cache, new Set(seen))
  );
  cache.set(cacheKey, result);
  return result;
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
    return dataOwnerScope(req);
  }

  async function ensureCatAccess(req, catId) {
    const cat = await prisma.cat.findFirst({
      where: { id: catId, ...ownerScope(req) },
      select: { id: true },
    });
    return Boolean(cat);
  }

  async function loadActiveExamFields(req, ownerId = req.session.userId) {
    const settings = await prisma.userSettings.findUnique({
      where: { userId: ownerId },
      select: { examsJson: true },
    });
    return buildActiveExamFields(selectedExamsFromSettings(settings, { defaultAll: true }));
  }

  router.get(
    "/admin/exams",
    requireAuth,
    requirePermission("admin.exams"),
    async (req, res) => {
      const cats = await prisma.cat.findMany({
        where: ownerScope(req),
        include: {
          owner: { include: { settings: true } },
          litterKitten: { include: { litter: true } },
          examPlan: true,
        },
        orderBy: { name: "asc" },
      });
      const ownerIds = Array.from(new Set(cats.map((cat) => cat.ownerId).filter(Boolean)));
      const settingsRows = ownerIds.length
        ? await prisma.userSettings.findMany({
            where: { userId: { in: ownerIds } },
            select: { userId: true, examsJson: true },
          })
        : [];
      const settingsByUserId = new Map(settingsRows.map((settings) => [settings.userId, settings]));
      let currentUserSettings = settingsByUserId.get(req.session.userId) || null;
      if (!currentUserSettings) {
        currentUserSettings = await prisma.userSettings.findUnique({
          where: { userId: req.session.userId },
          select: { userId: true, examsJson: true },
        });
      }
      const currentUserActiveExams = await loadActiveExamFields(req);
      const currentUserShowsKittensTab = examKittensTabEnabledFromSettings(currentUserSettings, { defaultEnabled: true });
      const defaultActiveExams = buildActiveExamFields(selectedExamsFromSettings(null, { defaultAll: true }));

      const grouped = Object.fromEntries(
        CATEGORY_META.map((category) => [category.key, []])
      );

      const ancestryCache = new Map();
      const catsById = new Map(cats.map((cat) => [cat.id, cat]));
      const ancestorLookupCache = new Map();
      async function resolveAncestor(id) {
        if (!id) return null;
        if (catsById.has(id)) return catsById.get(id);
        if (ancestorLookupCache.has(id)) return ancestorLookupCache.get(id);

        const promise = loadAncestor(prisma, id);
        ancestorLookupCache.set(id, promise);
        const ancestor = await promise;
        if (ancestor) catsById.set(id, ancestor);
        return ancestor;
      }

      for (const cat of cats) {
        const category = classifyOperationalCat(cat, {
          includeDeliveredKittensInHistory: false,
        });
        if (!category) continue;
        const ownerSettings = settingsByUserId.get(cat.ownerId) || null;
        const showKittensTab = examKittensTabEnabledFromSettings(ownerSettings, { defaultEnabled: true });
        if (category === "kittens" && !showKittensTab) continue;

        const ecoHistory = safeJsonParse(cat.examPlan?.ecoHistoryJson, [
          { date: "" },
        ]);
        const activeExams = ownerSettings
          ? buildActiveExamFields(selectedExamsFromSettings(ownerSettings, { defaultAll: true }))
          : defaultActiveExams;
        const hasEcoHistory = sortHistory(ecoHistory).some((item) => parseDate(item.date));
        const nextEco = activeExams.hcm && !(category === "founders" && hasEcoHistory)
          ? computeNextEco(cat.birthDate, ecoHistory)
          : null;
        const examDocs = parseExamDocs(cat.examDocsJson);
        const geneticExams = [];

        for (const config of activeExams.genetic) {
          const saved = readGeneticExam(cat, config);
          const inheritedNn = await resolveNnByAncestry(resolveAncestor, cat, config, ancestryCache);
          geneticExams.push({
            ...config,
            source: saved.source || (inheritedNn ? "Antecedente" : ""),
            result: saved.result || (inheritedNn ? "NN" : ""),
            file: saved.file,
            inheritedNn,
          });
        }

        const urgent = isUrgentRow(geneticExams, activeExams.hcm ? nextEco : null);
        const statusLabel = urgent ? "Exame Pendente" : "Exames Válidos";

        grouped[category].push({
          cat,
          displayName: buildExamDisplayName(cat),
          birthDateLabel: formatDate(cat.birthDate) || "-",
          geneticExams,
          ecoHistory,
          examDocs,
          nextEco,
          urgent,
          statusLabel,
          activeExams,
          isFounder: category === "founders",
        });
      }

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
        categories: CATEGORY_META.filter((category) => (
          category.key !== "kittens" || currentUserShowsKittensTab || grouped.kittens.length > 0
        )),
        grouped,
        printCats: cats
          .filter((cat) => {
            const category = classifyOperationalCat(cat, {
              includeDeliveredKittensInHistory: false,
            });
            if (category !== "kittens") return true;
            const ownerSettings = settingsByUserId.get(cat.ownerId) || null;
            return examKittensTabEnabledFromSettings(ownerSettings, { defaultEnabled: true });
          })
          .map((cat) => ({ id: cat.id, label: buildDisplayName(cat) }))
          .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
        sourceOptions: SourceOptions,
        activeExams: currentUserActiveExams,
        geneticExamConfigs: GENETIC_EXAMS,
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
      const printCategory = classifyOperationalCat(cat, {
        includeDeliveredKittensInHistory: false,
      });
      if (
        printCategory === "kittens" &&
        !examKittensTabEnabledFromSettings(cat.owner?.settings, { defaultEnabled: true })
      ) {
        return res.status(404).send("Filhotes não estão habilitados no módulo Exames.");
      }
      const activeExams = await loadActiveExamFields(req, cat.ownerId);

      const type = String(req.query.type || "");
      let docs = [];
      let label = "Exames";

      const activeGeneticKeys = new Set(activeExams.genetic.map((exam) => exam.key));
      if (activeGeneticKeys.has(type)) {
        const config = examConfig(type);
        docs = (await collectGeneticExamDocs(prisma, cat, type)).docs;
        label = config?.label || "Exame";
      } else if (type === "pkdef" && activeGeneticKeys.has("pkdef")) {
        docs = (await collectGeneticExamDocs(prisma, cat, "pkdef")).docs;
        label = "PKDef";
      } else if (type === "pra" && activeGeneticKeys.has("pra")) {
        docs = (await collectGeneticExamDocs(prisma, cat, "pra")).docs;
        label = "PRA";
      } else if (type === "hcm-latest" && activeExams.hcm) {
        docs = hcmDocs(cat, true);
        label = "Ultimo-HCM";
      } else if (type === "hcm-all" && activeExams.hcm) {
        docs = hcmDocs(cat, false);
        label = "Todos-HCM";
      } else if (type === "all") {
        docs = [
          ...(await Promise.all(activeExams.genetic.map((exam) => collectGeneticExamDocs(prisma, cat, exam.key))))
            .flatMap((result) => result.docs),
          ...(activeExams.hcm ? hcmDocs(cat, false) : []),
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
          include: {
            owner: { include: { settings: true } },
            litterKitten: { include: { litter: true } },
            examPlan: true,
          },
        });
        if (!existingCat) return res.status(404).send("Gato não encontrado.");
        const category = classifyOperationalCat(existingCat, {
          includeDeliveredKittensInHistory: false,
        });
        if (
          category === "kittens" &&
          !examKittensTabEnabledFromSettings(existingCat.owner?.settings, { defaultEnabled: true })
        ) {
          return res.status(403).send("Filhotes não estão habilitados no módulo Exames.");
        }
        const activeExams = await loadActiveExamFields(req, existingCat?.ownerId || req.session.userId);
        const examDocs = parseExamDocs(existingCat?.examDocsJson);
        const uploaded = filesByField(req.files || []);
        const ecoDates = [].concat(req.body.ecoDates || []);
        const ecoFiles = [].concat(req.body.ecoFiles || []);

        const ecoHistory = activeExams.hcm
          ? ecoDates
              .map((date, index) => ({
                date: formatDateInput(date),
                file: examFilePath(uploaded.get(`hcmDoc_${index}`)?.[0]) || ecoFiles[index] || "",
              }))
              .filter((item) => item.date !== "")
          : safeJsonParse(existingCat?.examPlan?.ecoHistoryJson, []);

        if (!examDocs.__genetic || typeof examDocs.__genetic !== "object" || Array.isArray(examDocs.__genetic)) {
          examDocs.__genetic = {};
        }

        const activeGeneticKeys = new Set(activeExams.genetic.map((exam) => exam.key));
        activeExams.genetic.forEach((config) => {
          const uploadPath = examFilePath(uploaded.get(`${config.key}Doc`)?.[0]);
          if (req.body[`${config.key}DeleteDoc`] === "1") {
            delete examDocs[config.docKey];
          }
          if (uploadPath) examDocs[config.docKey] = uploadPath;
          examDocs.__genetic[config.key] = {
            source: req.body[`${config.key}Source`] || null,
            result: normalizeGeneticResult(req.body[`${config.key}Result`], config) || null,
            file: examDocs[config.docKey] || "",
          };
        });
        if (activeExams.hcm) {
          examDocs.hcm = ecoHistory
            .filter((item) => item.file)
            .map((item) => ({ date: item.date, file: item.file }));
        }

        const pkdefConfig = GENETIC_EXAMS.find((exam) => exam.key === "pkdef");
        const praConfig = GENETIC_EXAMS.find((exam) => exam.key === "pra");
        const planData = {
          pkdefSource: activeGeneticKeys.has("pkdef") ? req.body.pkdefSource || null : existingCat?.examPlan?.pkdefSource || null,
          pkdefResult: activeGeneticKeys.has("pkdef") ? normalizeGeneticResult(req.body.pkdefResult, pkdefConfig) || null : existingCat?.examPlan?.pkdefResult || null,
          prabfSource: activeGeneticKeys.has("pra") ? req.body.praSource || null : existingCat?.examPlan?.prabfSource || null,
          prabfResult: activeGeneticKeys.has("pra") ? normalizeGeneticResult(req.body.praResult, praConfig) || null : existingCat?.examPlan?.prabfResult || null,
          ecoHistoryJson: JSON.stringify(ecoHistory),
        };

        await prisma.examPlan.upsert({
          where: { catId },
          create: {
            catId,
            ...planData,
          },
          update: planData,
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
