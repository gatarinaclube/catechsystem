const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const { canViewAllData } = require("../utils/access");
const { ageInMonths, buildKittenRegisteredName, kittenFallbackDisplayName } = require("../utils/cattery-admin");
const { getFileUploadLimit, validateFilesForRole } = require("../utils/planLimits");
const { selectedBreedsFromSettings } = require("../utils/userPreferences");
const {
  DEATH_CAUSE_OPTIONS,
  parseDeathCauseData,
  syncDeathHistoryEntry,
} = require("../utils/deathCause");
const {
  buildMissingMicrochipMessage,
  ensureMicrochipWhenRequired,
  isBlockedByMissingMicrochip,
} = require("../utils/microchipRules");

const KITTEN_STATUS_OPTIONS = [
  { value: "UNAVAILABLE", label: "Indisponível" },
  { value: "AVAILABLE", label: "Disponível" },
  { value: "RESERVED", label: "Reservado" },
  { value: "BREEDER", label: "Padreador/Matriz" },
  { value: "DELIVERED", label: "Entregue" },
  { value: "DECEASED", label: "Óbito" },
];

const UPLOADS_ROOT = process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");
const CONTRACT_UPLOAD_DIR = path.join(UPLOADS_ROOT, "kitten-contracts");

if (!fs.existsSync(CONTRACT_UPLOAD_DIR)) {
  fs.mkdirSync(CONTRACT_UPLOAD_DIR, { recursive: true });
}

const contractUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CONTRACT_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".pdf";
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: getFileUploadLimit("ADMIN").bytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    cb(allowed.includes(file.mimetype) ? null : new Error("Envie o contrato em PDF ou imagem."), allowed.includes(file.mimetype));
  },
});

function formatDateForInput(date) {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${parsed.getFullYear()}`;
}

function normalizeMicrochip(value) {
  return value ? String(value).replace(/\D/g, "").slice(0, 15) : null;
}

function formatMicrochip(value) {
  const digits = normalizeMicrochip(value);
  if (!digits) return "-";
  return (digits.match(/.{1,3}/g) || []).join(".");
}

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function removeContractFileFromDisk(contractFile) {
  const publicPath = contractFile?.path;
  if (!publicPath || !publicPath.startsWith("/uploads/kitten-contracts/")) return;
  const fileName = path.basename(publicPath);
  if (!fileName) return;
  const filePath = path.join(CONTRACT_UPLOAD_DIR, fileName);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // A exclusao do arquivo fisico nao deve impedir o cadastro de ser salvo.
  }
}

function buildOwnershipInfo(req, existingKitten = null) {
  const currentInfo = safeJsonParse(existingKitten?.newOwnerInfoJson);
  const contractLink = String(req.body.ownerContractLink || "").trim();
  const deleteContractFile = req.body.ownerContractFileDelete === "1";
  const nextInfo = {
    ...currentInfo,
    contractLink: contractLink || null,
  };

  if (deleteContractFile) {
    delete nextInfo.contractFile;
  }

  if (req.file) {
    nextInfo.contractFile = {
      path: `/uploads/kitten-contracts/${req.file.filename}`,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date().toISOString(),
    };
  }

  if (!nextInfo.contractLink && !nextInfo.contractFile && Object.keys(nextInfo).length <= 1) {
    return null;
  }

  return JSON.stringify(nextInfo);
}

function normalizeDocument(value) {
  return String(value || "").replace(/\D/g, "");
}

function clientLabel(client) {
  if (!client) return "";
  return [client.fullName, client.document].filter(Boolean).join(" - ");
}

function mergeLinkedKittenFields(cat) {
  if (!cat) return cat;
  const linkedBreeding = cat.litterKitten?.breeding || null;

  return {
    ...cat,
    kittenNumber: cat.kittenNumber || cat.litterKitten?.kittenNumber || null,
    neutered: linkedBreeding
      ? linkedBreeding === "NOT_FOR_BREEDING"
      : cat.neutered,
    kittenAvailabilityStatus: deriveKittenStatus(cat),
    newOwnerInfo: safeJsonParse(cat.newOwnerInfoJson),
  };
}

function normalizeKittenStatus(value) {
  return KITTEN_STATUS_OPTIONS.some((option) => option.value === value)
    ? value
    : "UNAVAILABLE";
}

function deriveKittenStatus(cat) {
  if (!cat) return "UNAVAILABLE";
  if (cat.deceased === true) return "DECEASED";
  if (cat.breedingProspect === true) return "BREEDER";
  if (cat.delivered === true) return "DELIVERED";
  if (cat.sold === true) return "RESERVED";
  if (cat.kittenAvailabilityStatus) return normalizeKittenStatus(cat.kittenAvailabilityStatus);
  return "AVAILABLE";
}

function statusFlags(status) {
  const normalized = normalizeKittenStatus(status);
  return {
    kittenAvailabilityStatus: normalized,
    sold: normalized === "RESERVED" || normalized === "DELIVERED",
    delivered: normalized === "DELIVERED" || normalized === "DECEASED",
    breedingProspect: normalized === "BREEDER",
    deceased: normalized === "DECEASED",
  };
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  function handleContractUpload(req, res, next) {
    contractUpload.single("ownerContractFile")(req, res, (err) => {
      if (err) {
        const limit = getFileUploadLimit(req.session?.userRole);
        req.uploadError = err.code === "LIMIT_FILE_SIZE"
          ? `O contrato ultrapassa o limite de ${limit.label} permitido para seu perfil. Reduza o PDF antes de enviar.`
          : err.message || "Não foi possível anexar o contrato.";
      } else if (req.file) {
        try {
          validateFilesForRole([req.file], req.session?.userRole);
        } catch (uploadLimitError) {
          removeContractFileFromDisk({ path: `/uploads/kitten-contracts/${req.file.filename}` });
          req.file = null;
          req.uploadError = uploadLimitError.message;
        }
      }
      next();
    });
  }

  function ownerScope(req) {
    return canViewAllData(req.session?.userRole) ? {} : { ownerId: req.session.userId };
  }

  function clientScope(req) {
    return canViewAllData(req.session?.userRole)
      ? { deletedAt: null }
      : { ownerId: req.session.userId, deletedAt: null };
  }

  async function ensureCatAccess(req, catId) {
    const cat = await prisma.cat.findFirst({
      where: { id: catId, ...ownerScope(req) },
      select: { id: true },
    });
    return Boolean(cat);
  }

  async function buildContext(req, kitten = null, error = null) {
    const scopedOwner = ownerScope(req);
    const ownerIdForSettings = kitten?.ownerId || req.session.userId;
    const ownerSettings = await prisma.userSettings.findUnique({
      where: { userId: ownerIdForSettings },
      select: { breedsJson: true },
    });
    const females = await prisma.cat.findMany({
      where: { ...scopedOwner, gender: "F" },
      orderBy: { name: "asc" },
    });
    const males = await prisma.cat.findMany({
      where: { ...scopedOwner, gender: "M" },
      orderBy: { name: "asc" },
    });
    const users = canViewAllData(req.session?.userRole)
      ? await prisma.user.findMany({
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            email: true,
            phones: true,
            city: true,
            state: true,
          },
        })
      : [];
    const ownerClients = await prisma.revenueClient.findMany({
      where: clientScope(req),
      orderBy: { fullName: "asc" },
    });

    const selectedBreeds = selectedBreedsFromSettings(ownerSettings, [kitten?.breed]);

    return {
      user: req.user,
      currentPath: req.path,
      females,
      males,
      users,
      ownerClients: ownerClients.map((client) => ({
        ...client,
        label: clientLabel(client),
        normalizedDocument: normalizeDocument(client.document),
      })),
      breeds: selectedBreeds,
      kittenStatusOptions: KITTEN_STATUS_OPTIONS,
      deathCauseOptions: DEATH_CAUSE_OPTIONS,
      contractUploadLimit: getFileUploadLimit(req.session?.userRole),
      microchipRequiredNotice: kitten && isBlockedByMissingMicrochip(kitten)
        ? buildMissingMicrochipMessage("Este filhote")
        : null,
      kitten,
      error,
      success: false,
    };
  }

  async function validateMicrochip(microchip, currentCatId = null) {
    const digits = normalizeMicrochip(microchip);
    if (!digits) return null;

    const existing = await prisma.cat.findUnique({
      where: { microchip: digits },
    });

    if (existing && existing.id !== currentCatId) {
      const error = new Error("Este microchip já foi cadastrado anteriormente.");
      error.code = "DUPLICATE_MICROCHIP";
      throw error;
    }

    const linkedKitten = await prisma.litterKitten.findFirst({
      where: {
        microchip: digits,
        ...(currentCatId ? { NOT: { kittenCatId: currentCatId } } : {}),
      },
    });

    if (linkedKitten) {
      const error = new Error("Este microchip já está sendo utilizado em outro filhote.");
      error.code = "DUPLICATE_MICROCHIP";
      throw error;
    }

    return digits;
  }

  function makeListLabel(cat) {
    const linkedKittenNumber =
      cat.kittenNumber ||
      cat.litterKitten?.kittenNumber ||
      (cat.litterKitten?.index ? String(cat.litterKitten.index).padStart(4, "0") : "----");
    const isNamedYoungLitterKitten = Boolean(cat.name && (cat.kittenNumber || cat.litterKitten) && ageInMonths(cat.birthDate) <= 4);
    if (isNamedYoungLitterKitten) {
      return [
        linkedKittenNumber,
        cat.name,
        cat.mother?.name || cat.motherName || cat.litterKitten?.litter?.femaleName || "-",
        formatMicrochip(cat.microchip),
      ].join(" - ");
    }

    const displayName = buildKittenRegisteredName(cat) || kittenFallbackDisplayName(cat) || `${linkedKittenNumber} - ${cat.name || "Sem nome"}`;

    return `${displayName} - ${formatMicrochip(cat.microchip)}`;
  }

  function getKittenOrderValue(cat) {
    const value = cat.kittenNumber || cat.litterKitten?.kittenNumber || cat.litterKitten?.index || "";
    const numeric = Number(String(value).replace(/\D/g, ""));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : Number.MAX_SAFE_INTEGER;
  }

  function sortKittensByNumber(a, b) {
    const numberDiff = getKittenOrderValue(a) - getKittenOrderValue(b);
    if (numberDiff !== 0) return numberDiff;
    return (a.name || "").localeCompare(b.name || "", "pt-BR");
  }

  async function syncLitterKitten(tx, catId, data) {
    const linked = await tx.litterKitten.findFirst({
      where: { kittenCatId: catId },
    });

    if (!linked) return;

    await tx.litterKitten.update({
      where: { id: linked.id },
      data: {
        kittenNumber: data.kittenNumber,
        name: data.name,
        sex: data.gender,
        breed: data.breed,
        emsEyes: data.emsCode,
        microchip: data.microchip,
        breeding: data.neutered ? "NOT_FOR_BREEDING" : "FOR_BREEDING",
        breedingRole: null,
        deceased: data.deceased,
      },
    });
  }

  async function parsePayload(req, existingKitten = null) {
    const microchip = await validateMicrochip(req.body.microchip, existingKitten?.id || null);
    const birthDate = req.body.birthDate ? new Date(req.body.birthDate) : null;
    const ownerLockedBySale = existingKitten?.ownershipSource === "SALE";
    const selectedOwnerClientId = req.body.currentOwnerClientId ? Number(req.body.currentOwnerClientId) : null;
    const selectedOwnerClient = selectedOwnerClientId && !ownerLockedBySale
      ? await prisma.revenueClient.findFirst({
          where: { id: selectedOwnerClientId, ...clientScope(req) },
        })
      : null;

    if (selectedOwnerClientId && !ownerLockedBySale && !selectedOwnerClient) {
      throw new Error("Selecione um cliente cadastrado válido para o proprietário.");
    }
    const availabilityData = statusFlags(req.body.kittenAvailabilityStatus || existingKitten?.kittenAvailabilityStatus || "UNAVAILABLE");
    const deathCauseData = parseDeathCauseData(req.body, availabilityData.deceased === true);
    const ownershipInfoJson = buildOwnershipInfo(req, existingKitten);
    ensureMicrochipWhenRequired({
      microchip,
      birthDate,
      deceased: availabilityData.deceased === true,
      label: "Este filhote",
      allowUnderFourMonths: true,
    });

    return {
      kittenNumber: req.body.kittenNumber || null,
      name: req.body.name || "",
      gender: req.body.gender || null,
      microchip,
      birthDate,
      motherId: req.body.motherId ? Number(req.body.motherId) : null,
      fatherId: req.body.fatherId ? Number(req.body.fatherId) : null,
      pedigreeType: req.body.pedigreeType || null,
      pedigreeNumber: req.body.pedigreeNumber || null,
      breed: req.body.breed || null,
      emsCode: req.body.emsCode || null,
      neutered: req.body.breedingStatus === "NOT_FOR_BREEDING",
      breederType: "Eu Mesmo",
      breederName: null,
      ownershipType: selectedOwnerClientId || ownerLockedBySale ? "OWNER" : null,
      currentOwnerId: ownerLockedBySale ? existingKitten.currentOwnerId : null,
      currentOwnerClientId: ownerLockedBySale
        ? existingKitten.currentOwnerClientId
        : selectedOwnerClientId,
      ownershipSource: ownerLockedBySale
        ? existingKitten.ownershipSource
        : selectedOwnerClientId
          ? "MANUAL"
          : null,
      newOwnerInfoJson: ownershipInfoJson,
      ...availabilityData,
      ...deathCauseData,
      ownerId: existingKitten?.ownerId || req.session.userId,
      status: existingKitten?.status || "APROVADO",
      historyNotes: req.body.historyNotes || null,
    };
  }

  router.get(
    "/admin/kittens",
    requireAuth,
    requirePermission("admin.kittens"),
    async (req, res) => {
      const selectedOwnerId = req.query.ownerId ? Number(req.query.ownerId) : null;
      const users = canViewAllData(req.session?.userRole)
        ? await prisma.user.findMany({
            orderBy: { name: "asc" },
            select: { id: true, name: true, email: true },
          })
        : [];
      const kittens = await prisma.cat.findMany({
        where: {
          OR: [
            { kittenNumber: { not: null } },
            { litterKitten: { isNot: null } },
          ],
          ...(canViewAllData(req.session?.userRole) && selectedOwnerId
            ? { ownerId: selectedOwnerId }
            : ownerScope(req)),
        },
        include: {
          litterKitten: { include: { litter: true } },
          mother: true,
          owner: { include: { settings: true } },
        },
        orderBy: [{ birthDate: "asc" }, { name: "asc" }],
      });

      const kittenRows = kittens
        .map((kitten) => ({
          ...mergeLinkedKittenFields(kitten),
          label: makeListLabel(kitten),
          blockedByMissingMicrochip: isBlockedByMissingMicrochip(kitten),
          missingMicrochipMessage: buildMissingMicrochipMessage("Este filhote"),
        }))
        .sort(sortKittensByNumber);

      res.render("admin-kittens/list", {
        user: req.user,
        currentPath: req.path,
        users,
        selectedOwnerId,
        groupedKittens: {
          available: kittenRows.filter(
            (kitten) => deriveKittenStatus(kitten) === "AVAILABLE"
          ),
          reserved: kittenRows.filter(
            (kitten) => deriveKittenStatus(kitten) === "RESERVED"
          ),
          unavailable: kittenRows.filter(
            (kitten) => deriveKittenStatus(kitten) === "UNAVAILABLE"
          ),
          breeders: kittenRows.filter((kitten) => deriveKittenStatus(kitten) === "BREEDER"),
          deliveredSold: kittenRows.filter(
            (kitten) => deriveKittenStatus(kitten) === "DELIVERED"
          ),
          deceased: kittenRows.filter(
            (kitten) => deriveKittenStatus(kitten) === "DECEASED"
          ),
        },
        kittenStatusOptions: KITTEN_STATUS_OPTIONS,
      });
    }
  );

  router.get(
    "/admin/kittens/new",
    requireAuth,
    requirePermission("admin.kittens"),
    async (req, res) => {
      res.redirect("/admin/kittens");
    }
  );

  router.post(
    "/admin/kittens/:id/quick-status",
    requireAuth,
    requirePermission("admin.kittens"),
    async (req, res) => {
      const existingKitten = await prisma.cat.findUnique({
        where: { id: Number(req.params.id) },
        select: { id: true, birthDate: true, microchip: true, deceased: true },
      });

      if (!existingKitten) {
        return res.status(404).send("Filhote não encontrado.");
      }

      if (!(await ensureCatAccess(req, existingKitten.id))) {
        return res.status(403).send("Você não pode editar este filhote.");
      }

      if (isBlockedByMissingMicrochip(existingKitten)) {
        return res.status(400).send(buildMissingMicrochipMessage("Este filhote"));
      }

      const data = {
        ...statusFlags(req.body.kittenAvailabilityStatus),
        ...parseDeathCauseData(req.body, req.body.kittenAvailabilityStatus === "DECEASED"),
      };

      await prisma.$transaction(async (tx) => {
        const updated = await tx.cat.update({
          where: { id: existingKitten.id },
          data,
        });

        await tx.litterKitten.updateMany({
          where: { kittenCatId: existingKitten.id },
          data: { deceased: data.deceased },
        });
        await syncDeathHistoryEntry(tx, existingKitten.id, updated);
      });

      if (req.get("X-Autosave") === "true") {
        return res.sendStatus(204);
      }

      res.redirect("/admin/kittens");
    }
  );

  router.post(
    "/admin/kittens",
    requireAuth,
    requirePermission("admin.kittens"),
    async (req, res) => {
      res.status(405).send("O cadastro manual de filhotes foi desativado. Registre filhotes pelo Registro de Ninhada/Ninhadas ou cadastre como reprodutor/matriz quando for adquirido externamente para reprodução.");
    }
  );

  router.get(
    "/admin/kittens/:id",
    requireAuth,
    requirePermission("admin.kittens"),
    async (req, res) => {
      const kitten = await prisma.cat.findUnique({
        where: { id: Number(req.params.id) },
        include: {
          litterKitten: { include: { litter: true } },
          currentOwnerClient: true,
          owner: { include: { settings: true } },
        },
      });

      if (!kitten) {
        return res.status(404).send("Filhote não encontrado.");
      }

      if (!(await ensureCatAccess(req, kitten.id))) {
        return res.status(403).send("Você não tem acesso a este filhote.");
      }

      res.render("admin-kittens/form", {
        ...(await buildContext(req, mergeLinkedKittenFields(kitten))),
        formTitle: "Editar Filhote",
        formAction: `/admin/kittens/${kitten.id}`,
        cancelPath: "/admin/kittens",
        historyPath: `/admin/history/${kitten.id}`,
        success: req.query.saved === "1",
      });
    }
  );

  router.post(
    "/admin/kittens/:id",
    requireAuth,
    requirePermission("admin.kittens"),
    handleContractUpload,
    async (req, res) => {
      const existingKitten = await prisma.cat.findUnique({
        where: { id: Number(req.params.id) },
        include: {
          litterKitten: { include: { litter: true } },
          currentOwnerClient: true,
          owner: { include: { settings: true } },
        },
      });

      if (!existingKitten) {
        return res.status(404).send("Filhote não encontrado.");
      }

      if (!(await ensureCatAccess(req, existingKitten.id))) {
        return res.status(403).send("Você não pode editar este filhote.");
      }

      try {
        if (req.uploadError) {
          throw new Error(req.uploadError);
        }
        const previousOwnerInfo = safeJsonParse(existingKitten.newOwnerInfoJson);
        const shouldRemovePreviousContractFile = Boolean(previousOwnerInfo.contractFile?.path)
          && (req.body.ownerContractFileDelete === "1" || Boolean(req.file));
        const data = await parsePayload(req, existingKitten);
        await prisma.$transaction(async (tx) => {
          const updated = await tx.cat.update({
            where: { id: existingKitten.id },
            data,
          });
          await syncLitterKitten(tx, existingKitten.id, data);
          await syncDeathHistoryEntry(tx, existingKitten.id, updated);
        });
        if (shouldRemovePreviousContractFile) {
          removeContractFileFromDisk(previousOwnerInfo.contractFile);
        }
        res.redirect(`/admin/kittens/${existingKitten.id}?saved=1`);
      } catch (err) {
        res.status(400).render("admin-kittens/form", {
          ...(await buildContext(
            req,
            mergeLinkedKittenFields({ ...existingKitten, ...req.body }),
            err.message || "Erro ao atualizar o filhote."
          )),
          formTitle: "Editar Filhote",
          formAction: `/admin/kittens/${existingKitten.id}`,
          cancelPath: "/admin/kittens",
          historyPath: `/admin/history/${existingKitten.id}`,
        });
      }
    }
  );

  return router;
};
