// modules/transfers.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { isAdminRole, normalizeRole } = require("../utils/access");
const {
  notifyNewService,
  notifyUserServiceConfirmation,
} = require("../utils/adminNotifications");
const { getFileUploadLimit, validateFilesForRole } = require("../utils/planLimits");
const { formatPhone } = require("../utils/format");




module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  // ===============================
// PADRÃO DE UPLOAD (IGUAL AO SERVER)
// ===============================
const UPLOADS_ROOT =
  process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");

const uploadDir = path.join(UPLOADS_ROOT, "transfer-authorization");
const catsUploadDir = path.join(UPLOADS_ROOT, "cats");

// garante que a pasta exista
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(catsUploadDir)) {
  fs.mkdirSync(catsUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, file.fieldname === "kittenPedigreeFile" ? catsUploadDir : uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const prefix = file.fieldname === "kittenPedigreeFile" ? "kitten-pedigree" : "transfer-auth";
    const safeName = `${prefix}-${Date.now()}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: getFileUploadLimit("ADMIN").bytes },
});

function isKittenFromLitter(cat) {
  return Boolean(cat?.kittenNumber || cat?.litterKitten);
}

function isBreederCat(cat) {
  return !isKittenFromLitter(cat) || cat.breedingProspect === true;
}

function transferCategoryForCat(cat) {
  const categories = [];
  if (cat.gender === "M" && isBreederCat(cat)) categories.push("SIRE");
  if (cat.gender === "F" && isBreederCat(cat)) categories.push("DAM");
  if (isKittenFromLitter(cat)) categories.push("KITTEN");
  return categories.join(" ");
}


  // Helper simples para pegar info de sessão
  function getAuthInfo(req) {
    const userId = req.session?.userId || null;
    const role = normalizeRole(req.session?.userRole);
    const isAdmin = isAdminRole(role);
    return { userId, role, isAdmin };
  }

  // ---------- GET /transfers/new (formulário) ----------
  router.get(
    "/transfers/new",
    requireAuth,
    requirePermission("service.transfer"),
    async (req, res) => {
    const { userId } = getAuthInfo(req);

    // Busca usuário logado (para preencher "Antigo Proprietário")
const user = await prisma.user.findUnique({
  where: { id: userId },
});

    const cats = await prisma.cat.findMany({
      where: {
        ownerId: userId,
        deceased: { not: true },
      },
      include: { litterKitten: true },
      orderBy: { name: "asc" },
    });

  res.render("transfers/new", {
  user,
  cats: cats.map((cat) => ({
    ...cat,
    transferCategories: transferCategoryForCat(cat),
    isKittenFromLitter: isKittenFromLitter(cat),
  })),
  currentPath: "/transfers/new",
});

    }
  );

// ---------- POST /transfers/new ----------
router.post(
  "/transfers/new",
  requireAuth,
  requirePermission("service.transfer"),
  upload.fields([
    { name: "authorizationFile", maxCount: 1 },
    { name: "kittenPedigreeFile", maxCount: 1 },
  ]),
  async (req, res) => {

// 🔒 VALIDAÇÃO OBRIGATÓRIA PARA "OUTRO"
const authorizationFile = req.files?.authorizationFile?.[0] || null;
const kittenPedigreeFile = req.files?.kittenPedigreeFile?.[0] || null;

if (req.body.oldOwnerType === "OTHER" && !authorizationFile) {
  return res.status(400).send(
    "Documento do antigo proprietário é obrigatório quando selecionado 'Outro'."
  );
}

    console.log(">>> POST /transfers/new FOI CHAMADO");
    console.log("FILES:", req.files);
  const { 
  catId,
  transferCatType,
  kittenPedigreeNumber,
  breedingStatus,


  // 🔹 NOVO
  oldOwnerType,
  oldOwnerName,

  newOwnerName,
  memberType,
  address,
  district,
  city,
  state,
  cep,
  email,
  phone
} = req.body;


  const { userId } = getAuthInfo(req);

  try {
    validateFilesForRole([authorizationFile, kittenPedigreeFile].filter(Boolean), req.session?.userRole);
    // 1) Buscar usuário (dono atual)
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    const cat = await prisma.cat.findFirst({
      where: {
        id: Number(catId),
        ownerId: userId,
      },
      include: { litterKitten: true },
    });

    if (!cat) {
      return res.status(400).send("Gato inválido para este usuário.");
    }

    if (!["SIRE", "DAM", "KITTEN"].includes(transferCatType)) {
      return res.status(400).send("Informe se a transferência é de Padreador, Matriz ou Filhote.");
    }

    if (transferCatType === "SIRE" && (cat.gender !== "M" || !isBreederCat(cat))) {
      return res.status(400).send("Selecione um padreador válido.");
    }

    if (transferCatType === "DAM" && (cat.gender !== "F" || !isBreederCat(cat))) {
      return res.status(400).send("Selecione uma matriz válida.");
    }

    if (transferCatType === "KITTEN" && !isKittenFromLitter(cat)) {
      return res.status(400).send("Selecione um filhote proveniente de registro de ninhada.");
    }

    if ((transferCatType === "SIRE" || transferCatType === "DAM") && !cat.pedigreeFile) {
      return res.status(400).send("O pedigree precisa estar anexado no cadastro do gato antes da transferência.");
    }

    if (transferCatType === "KITTEN") {
      if (!String(kittenPedigreeNumber || "").trim()) {
        return res.status(400).send("Informe o número de registro FIFe do filhote.");
      }

      if (!kittenPedigreeFile) {
        return res.status(400).send("Anexe o pedigree do filhote.");
      }
    }

    // -------------------------------
// DEFINIÇÃO FINAL DOS PROPRIETÁRIOS
// -------------------------------
let finalOldOwner = "";
let finalNewOwner = "";

if (oldOwnerType === "ME") {
  // Usuário logado é o antigo proprietário
  finalOldOwner = user.name;
  finalNewOwner = newOwnerName;
} else {
  // Usuário logado é o novo proprietário
  finalOldOwner = oldOwnerName;
  finalNewOwner = user.name;
}

// -------------------------------
// ARQUIVO DE AUTORIZAÇÃO (SE EXISTIR)
// -------------------------------
let authorizationFilePath = null;

if (authorizationFile) {
  authorizationFilePath = `/uploads/transfer-authorization/${authorizationFile.filename}`;
}

if (transferCatType === "KITTEN") {
  await prisma.cat.update({
    where: { id: cat.id },
    data: {
      pedigreeNumber: String(kittenPedigreeNumber || "").trim(),
      ...(kittenPedigreeFile
        ? { pedigreeFile: `/uploads/cats/${kittenPedigreeFile.filename}` }
        : {}),
    },
  });
}


    // 2) Criar SERVICE REQUEST
    const service = await prisma.serviceRequest.create({
      data: {
        userId,
        type: ("Transferência de Propriedade"),
        description: `Transferência de ${transferCatType === "SIRE" ? "padreador" : transferCatType === "DAM" ? "matriz" : "filhote"} - ${cat.name}`,
        status: "ENVIADO_GATARINA",
      }
    });

    // 2.1) CRIAR STATUS INICIAL (OBRIGATÓRIO)
await prisma.serviceStatus.create({
  data: {
    serviceId: service.id,
    status: "ENVIADO_GATARINA",
  },
});

// 🔴 ATUALIZA STATUS RESUMO (usado nas listas)
await prisma.serviceRequest.update({
  where: { id: service.id },
  data: {
    status: "ENVIADO_GATARINA",
  },
});


    // 3) Criar TRANSFER REQUEST
await prisma.transferRequest.create({
  data: {
    cat: {
      connect: { id: Number(catId) }
    },

    oldOwnerName: finalOldOwner,
    newOwnerName: finalNewOwner,
    breedingStatus,

    // ✅ AGORA PODE SER NULL
    memberType: oldOwnerType === "ME" ? memberType : null,

    address:
      memberType === "NAO_FIFE" && oldOwnerType === "ME"
        ? address
        : null,
    district:
      memberType === "NAO_FIFE" && oldOwnerType === "ME"
        ? district
        : null,
    city:
      memberType === "NAO_FIFE" && oldOwnerType === "ME"
        ? city
        : null,
    state:
      memberType === "NAO_FIFE" && oldOwnerType === "ME"
        ? state
        : null,
    cep:
      memberType === "NAO_FIFE" && oldOwnerType === "ME"
        ? cep
        : null,
    email:
      memberType === "NAO_FIFE" && oldOwnerType === "ME"
        ? email
        : null,
    phone:
      memberType === "NAO_FIFE" && oldOwnerType === "ME"
        ? formatPhone(phone)
        : null,

    authorizationFile: authorizationFilePath,

    serviceRequest: {
      connect: { id: service.id }
    }
  }
});

    await notifyNewService(prisma, service);
    await notifyUserServiceConfirmation(prisma, service);


    res.redirect("/my-services");

  } catch (err) {
    console.error("Erro ao registrar transferência:", err);
    res.status(500).send("Erro ao registrar transferência");
  }
});

  return router;
};
