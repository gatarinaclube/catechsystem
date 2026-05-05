const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { ROLES, canViewAllData, normalizeRole } = require("../utils/access");

const COUNTRIES = [
  "BR","AR","AT","BE","BG","BY","CA","CH","CL","CO","CY","CZ",
  "DE","DK","EE","ES","FI","FR","GB","GR","HR","HU","ID","IL",
  "IS","IT","KO","KR","LI","LT","LU","LV","MX","MY","NL","NO",
  "PL","PT","RO","RS","RU","SE","SI","SK","TR","UA","US","UY"
];

const BREEDS = [
  "ABY","SOM","ACL","ACS","BAL","SIA","BEN","BLH","BSH","BML","BOM","BUR",
  "CHA","CRX","DRX","DSP","EUR","EXO","PER","GRX","HCL","HCS","JBS","KBL",
  "KBS","KOR","LPL","LPS","LYO","MAU","MCO","NEM","NFO","OCI","OLH","OSH",
  "PEB","RAG","RUS","SBI","SIB","SNO","SOK","SPH","SRL","SRS","THA","TUA","TUV"
];

const EXAM_OPTIONS = ["PKDef", "PKD", "PRA", "HCM - Genético", "HCM - Doppler"];

const DOCUMENT_UPLOAD_LIMITS = {
  [ROLES.BASIC]: { bytes: 300 * 1024, label: "300 KB" },
  [ROLES.MASTER]: { bytes: 700 * 1024, label: "700 KB" },
  [ROLES.PREMIUM]: { bytes: 2 * 1024 * 1024, label: "2 MB" },
  [ROLES.ADMIN]: { bytes: 5 * 1024 * 1024, label: "5 MB" },
};

function createUploadMiddleware() {
  const diskRoot =
    process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");
  const uploadDir = path.join(diskRoot, "cats");

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, uniqueSuffix + ext);
    },
  });

  return multer({
    storage,
    limits: { fileSize: DOCUMENT_UPLOAD_LIMITS[ROLES.ADMIN].bytes },
    fileFilter: (req, file, cb) => {
      if (file.mimetype !== "application/pdf") {
        return cb(new Error("Os documentos devem ser enviados exclusivamente em PDF."));
      }
      cb(null, true);
    },
  });
}

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getUploadLimit(role) {
  return DOCUMENT_UPLOAD_LIMITS[normalizeRole(role)] || DOCUMENT_UPLOAD_LIMITS[ROLES.BASIC];
}

function normalizeExamKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function parseExamList(value) {
  const parsed = safeJsonParse(value, []);
  return Array.isArray(parsed)
    ? parsed.filter((exam) => EXAM_OPTIONS.includes(exam))
    : [];
}

function validateUploadedFiles(req) {
  const limit = getUploadLimit(req.session?.userRole);
  const oversized = (req.files || []).find((file) => file.size > limit.bytes);
  if (!oversized) return;

  const error = new Error(`O arquivo ${oversized.originalname} ultrapassa o limite de ${limit.label} do seu plano.`);
  error.code = "UPLOAD_LIMIT";
  throw error;
}

function removeUploadedFiles(files = []) {
  files.forEach((file) => {
    if (file?.path) {
      fs.unlink(file.path, () => {});
    }
  });
}

function statusForError(err) {
  return err.code === "DUPLICATE_MICROCHIP" || err.code === "UPLOAD_LIMIT" ? 400 : 500;
}

function normalizeMicrochip(microchip) {
  return microchip ? microchip.replace(/\D/g, "").slice(0, 15) : null;
}

function calculateAge(birthDate) {
  if (!birthDate) return null;

  const now = new Date();
  const birth = new Date(birthDate);

  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();

  if (now.getDate() < birth.getDate()) {
    months -= 1;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years < 0) {
    return null;
  }

  return { years, months, totalMonths: years * 12 + months };
}

function formatAge(age) {
  if (!age) return "Idade não informada";

  const yearLabel = age.years === 1 ? "ano" : "anos";
  const monthLabel = age.months === 1 ? "mês" : "meses";
  return `${age.years} ${yearLabel} e ${age.months} ${monthLabel}`;
}

function buildDisplayName(cat) {
  return [
    cat.titleBeforeName,
    cat.country ? `${cat.country}*` : null,
    cat.name,
    cat.titleAfterName,
  ]
    .filter(Boolean)
    .join(" ");
}

function classifyBreeder(cat) {
  const age = calculateAge(cat.birthDate);
  const isKittenRecord = Boolean(cat.kittenNumber || cat.litterKitten);

  if (isKittenRecord && cat.breedingProspect !== true) {
    return null;
  }

  if (cat.deceased === true) {
    return "founders";
  }

  if (isKittenRecord && cat.breedingProspect === true) {
    if (age && age.totalMonths < 10) {
      return "new";
    }
    if (cat.gender === "M") return "sires";
    if (cat.gender === "F") return "dams";
    return "founders";
  }

  const isBreeding = cat.neutered !== true;

  if (!isBreeding) {
    return "founders";
  }

  if (age && age.totalMonths < 10) {
    return "new";
  }

  if (cat.gender === "M") {
    return "sires";
  }

  if (cat.gender === "F") {
    return "dams";
  }

  return "founders";
}

function mapOwnershipType(value) {
  return value === "OTHER" ? "CO-OWNERSHIP" : "OWNER";
}

function mapOwnershipValue(value) {
  return value === "CO-OWNERSHIP" ? "OTHER" : "ME";
}

function mapBreedingValue(cat) {
  return cat.neutered === true ? "NOT_FOR_BREEDING" : "FOR_BREEDING";
}

function canAppearAsParentOption(cat) {
  const isKittenFromLitter = Boolean(cat.kittenNumber || cat.litterKitten);
  if (!isKittenFromLitter) return true;
  if (cat.breedingProspect !== true) return false;

  const age = calculateAge(cat.birthDate);
  return Boolean(age && age.totalMonths >= 10);
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();
  const upload = createUploadMiddleware();

  function handleUpload(req, res, next) {
    upload.any()(req, res, (err) => {
      if (err) {
        const uploadError = new Error(
          err.code === "LIMIT_FILE_SIZE"
            ? `O arquivo ultrapassa o limite máximo de ${DOCUMENT_UPLOAD_LIMITS[ROLES.ADMIN].label}.`
            : err.message || "Erro ao enviar documento."
        );
        uploadError.code = "UPLOAD_LIMIT";
        req.uploadError = uploadError;
      }
      next();
    });
  }

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

  async function buildFormContext(req, cat = null) {
    const scopedOwner = ownerScope(req);
    const maleCats = await prisma.cat.findMany({
      where: {
        ...scopedOwner,
        gender: "M",
      },
      include: {
        litterKitten: true,
      },
      orderBy: { name: "asc" },
    });

    const femaleCats = await prisma.cat.findMany({
      where: {
        ...scopedOwner,
        gender: "F",
      },
      include: {
        litterKitten: true,
      },
      orderBy: { name: "asc" },
    });

    const breedingValue = cat
      ? cat.breedingStatus || mapBreedingValue(cat)
      : "FOR_BREEDING";
    const ownershipValue = cat
      ? cat.ownershipMode || mapOwnershipValue(cat.ownershipType)
      : "ME";
    const deceasedValue = cat
      ? cat.deceased === true || cat.deceased === "YES"
        ? "YES"
        : "NO"
      : "NO";
    const settingsRows = await prisma.$queryRaw`
      SELECT "examsJson"
      FROM "UserSettings"
      WHERE "userId" = ${cat?.ownerId || req.session.userId}
      LIMIT 1
    `;
    const selectedExams = parseExamList(settingsRows[0]?.examsJson);

    return {
      user: req.user,
      currentPath: req.path,
      countries: COUNTRIES,
      breeds: BREEDS,
      maleCats: maleCats.filter(canAppearAsParentOption),
      femaleCats: femaleCats.filter(canAppearAsParentOption),
      cat,
      breedingValue,
      ownershipValue,
      deceasedValue,
      uploadLimit: getUploadLimit(req.session?.userRole),
      selectedExams,
      examDocs: safeJsonParse(cat?.examDocsJson, {}),
      normalizeExamKey,
      ageLabel: cat ? formatAge(calculateAge(cat.birthDate)) : "",
    };
  }

  async function parseBreederPayload(req, existingCat = null) {
    const {
      titleBeforeName,
      titleAfterName,
      country,
      name,
      birthDate,
      gender,
      microchip,
      pedigreeType,
      pedigreeNumber,
      breed,
      emsCode,
      breederType,
      breederName,
      fatherMode,
      fatherId,
      fatherName,
      fatherBreed,
      fatherEmsCode,
      motherMode,
      motherId,
      motherName,
      motherBreed,
      motherEmsCode,
      breedingStatus,
      deceased,
      ownershipMode,
    } = req.body;

    const microchipDigits = normalizeMicrochip(microchip);
    const currentId = existingCat ? existingCat.id : null;

    if (microchipDigits) {
      const duplicate = await prisma.cat.findUnique({
        where: { microchip: microchipDigits },
      });

      if (duplicate && duplicate.id !== currentId) {
        const error = new Error("Já existe um gato cadastrado com este microchip.");
        error.code = "DUPLICATE_MICROCHIP";
        throw error;
      }
    }

    let fatherIdValue = null;
    let fatherNameValue = null;
    let fatherBreedValue = null;
    let fatherEmsCodeValue = null;

    if (fatherMode === "existing" && fatherId) {
      const fatherCat = await prisma.cat.findUnique({
        where: { id: Number(fatherId) },
      });

      if (fatherCat) {
        fatherIdValue = fatherCat.id;
        fatherNameValue = fatherCat.name || null;
        fatherBreedValue = fatherCat.breed || null;
        fatherEmsCodeValue = fatherCat.emsCode || null;
      }
    } else if (fatherMode === "manual") {
      fatherNameValue = fatherName || null;
      fatherBreedValue = fatherBreed || null;
      fatherEmsCodeValue = fatherEmsCode || null;
    }

    let motherIdValue = null;
    let motherNameValue = null;
    let motherBreedValue = null;
    let motherEmsCodeValue = null;

    if (motherMode === "existing" && motherId) {
      const motherCat = await prisma.cat.findUnique({
        where: { id: Number(motherId) },
      });

      if (motherCat) {
        motherIdValue = motherCat.id;
        motherNameValue = motherCat.name || null;
        motherBreedValue = motherCat.breed || null;
        motherEmsCodeValue = motherCat.emsCode || null;
      }
    } else if (motherMode === "manual") {
      motherNameValue = motherName || null;
      motherBreedValue = motherBreed || null;
      motherEmsCodeValue = motherEmsCode || null;
    }

    return {
      ownerId: existingCat ? existingCat.ownerId : req.session.userId,
      titleBeforeName: titleBeforeName || null,
      titleAfterName: titleAfterName || null,
      country: country || null,
      name,
      birthDate: birthDate ? new Date(birthDate) : null,
      gender: gender || null,
      microchip: microchipDigits,
      pedigreeType: pedigreeType || null,
      pedigreeNumber: pedigreeNumber || null,
      breed: breed || null,
      emsCode: emsCode || null,
      breederType: breederType || "Eu Mesmo",
      breederName: breederType === "Outro" ? breederName || null : null,
      fatherId: fatherIdValue,
      fatherName: fatherNameValue,
      fatherBreed: fatherBreedValue,
      fatherEmsCode: fatherEmsCodeValue,
      motherId: motherIdValue,
      motherName: motherNameValue,
      motherBreed: motherBreedValue,
      motherEmsCode: motherEmsCodeValue,
      neutered: breedingStatus === "NOT_FOR_BREEDING",
      deceased: deceased === "YES",
      ownershipType: mapOwnershipType(ownershipMode),
      status: existingCat ? existingCat.status : "NOVO",
    };
  }

  function applyUploadedDocuments(req, data, existingCat = null) {
    if (req.uploadError) {
      throw req.uploadError;
    }

    validateUploadedFiles(req);

    const files = req.files || [];
    const byField = new Map(files.map((file) => [file.fieldname, file]));
    const filePath = (fieldName, fallback = null) => {
      const file = byField.get(fieldName);
      return file ? `/uploads/cats/${file.filename}` : fallback;
    };

    data.pedigreeFile = filePath("pedigreeFile", existingCat?.pedigreeFile || null);
    data.reproductionFile = filePath(
      "reproductionFile",
      existingCat?.reproductionFile || null
    );
    data.otherDocsFile = filePath("otherDocsFile", existingCat?.otherDocsFile || null);

    const examDocs = safeJsonParse(existingCat?.examDocsJson, {});
    Object.keys(examDocs).forEach((key) => {
      if (byField.has(`examDoc_${key}`)) delete examDocs[key];
    });

    for (const [fieldName, file] of byField.entries()) {
      if (!fieldName.startsWith("examDoc_")) continue;
      const key = fieldName.replace("examDoc_", "");
      examDocs[key] = `/uploads/cats/${file.filename}`;
    }

    data.examDocsJson = JSON.stringify(examDocs);
  }

  router.get(
    "/breeders",
    requireAuth,
    requirePermission("admin.breeders"),
    async (req, res) => {
      const selectedOwnerId = req.query.ownerId ? Number(req.query.ownerId) : null;
      const users = canViewAllData(req.session?.userRole)
        ? await prisma.user.findMany({
            orderBy: { name: "asc" },
            select: { id: true, name: true, email: true },
          })
        : [];
      const cats = await prisma.cat.findMany({
        where: canViewAllData(req.session?.userRole) && selectedOwnerId
          ? { ownerId: selectedOwnerId }
          : ownerScope(req),
        include: {
          litterKitten: true,
        },
        orderBy: { name: "asc" },
      });

      const groups = {
        sires: [],
        dams: [],
        founders: [],
        new: [],
      };

      cats.forEach((cat) => {
        const age = calculateAge(cat.birthDate);
        const enrichedCat = {
          ...cat,
          displayName: buildDisplayName(cat),
          ageLabel: formatAge(age),
        };

        const group = classifyBreeder(cat);
        if (group) {
          groups[group].push(enrichedCat);
        }
      });

      res.render("breeders/list", {
        user: req.user,
        currentPath: req.path,
        groups,
        users,
        selectedOwnerId,
      });
    }
  );

  router.get(
    "/breeders/new",
    requireAuth,
    requirePermission("admin.breeders"),
    async (req, res) => {
      res.render("breeders/form", {
        ...(await buildFormContext(req, null)),
        formTitle: "Novo Padreador/Matriz",
        submitLabel: "Salvar",
        formAction: "/breeders",
        historyPath: null,
        cancelPath: "/breeders",
        error: null,
      });
    }
  );

  router.post(
    "/breeders",
    requireAuth,
    requirePermission("admin.breeders"),
    handleUpload,
    async (req, res) => {
      try {
        const data = await parseBreederPayload(req);
        applyUploadedDocuments(req, data, null);
        const breeder = await prisma.cat.create({ data });
        res.redirect(`/breeders/${breeder.id}`);
      } catch (err) {
        removeUploadedFiles(req.files);
        const cat = { ...req.body };
        res.status(statusForError(err)).render(
          "breeders/form",
          {
            ...(await buildFormContext(req, cat)),
            formTitle: "Novo Padreador/Matriz",
            submitLabel: "Salvar",
            formAction: "/breeders",
            historyPath: null,
            cancelPath: "/breeders",
            error:
              err.code === "DUPLICATE_MICROCHIP" || err.code === "UPLOAD_LIMIT"
                ? err.message
                : "Erro ao salvar o reprodutor.",
          }
        );
      }
    }
  );

  router.get(
    "/breeders/:id",
    requireAuth,
    requirePermission("admin.breeders"),
    async (req, res) => {
      const cat = await prisma.cat.findUnique({
        where: { id: Number(req.params.id) },
      });

      if (!cat) {
        return res.status(404).send("Reprodutor não encontrado.");
      }

      if (!(await ensureCatAccess(req, cat.id))) {
        return res.status(403).send("Você não tem acesso a este gato.");
      }

      res.render("breeders/form", {
        ...(await buildFormContext(req, cat)),
        formTitle: "Editar Padreador/Matriz",
        submitLabel: "Salvar",
        formAction: `/breeders/${cat.id}`,
        historyPath: `/admin/history/${cat.id}`,
        cancelPath: "/breeders",
        error: null,
      });
    }
  );

  router.post(
    "/breeders/:id",
    requireAuth,
    requirePermission("admin.breeders"),
    handleUpload,
    async (req, res) => {
      const existingCat = await prisma.cat.findUnique({
        where: { id: Number(req.params.id) },
      });

      if (!existingCat) {
        return res.status(404).send("Reprodutor não encontrado.");
      }

      if (!(await ensureCatAccess(req, existingCat.id))) {
        return res.status(403).send("Você não pode editar este gato.");
      }

      try {
        const data = await parseBreederPayload(req, existingCat);
        applyUploadedDocuments(req, data, existingCat);
        await prisma.cat.update({
          where: { id: existingCat.id },
          data,
        });
        res.redirect(`/breeders/${existingCat.id}`);
      } catch (err) {
        removeUploadedFiles(req.files);
        const cat = { ...existingCat, ...req.body, id: existingCat.id };
        res.status(statusForError(err)).render(
          "breeders/form",
          {
            ...(await buildFormContext(req, cat)),
            formTitle: "Editar Padreador/Matriz",
            submitLabel: "Salvar",
            formAction: `/breeders/${existingCat.id}`,
            historyPath: `/admin/history/${existingCat.id}`,
            cancelPath: "/breeders",
            error:
              err.code === "DUPLICATE_MICROCHIP" || err.code === "UPLOAD_LIMIT"
                ? err.message
                : "Erro ao atualizar o reprodutor.",
          }
        );
      }
    }
  );

  router.get(
    "/breeders/:id/history",
    requireAuth,
    requirePermission("admin.breeders"),
    async (req, res) => {
      res.redirect(`/admin/history/${Number(req.params.id)}`);
    }
  );

  return router;
};
