// modules/transfers.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { isAdminRole, normalizeRole } = require("../utils/access");




module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  // ===============================
// PADRÃO DE UPLOAD (IGUAL AO SERVER)
// ===============================
const UPLOADS_ROOT =
  process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");

const uploadDir = path.join(UPLOADS_ROOT, "transfer-authorization");

// garante que a pasta exista
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const safeName = `transfer-auth-${Date.now()}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({ storage });


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
    const { userId, isAdmin } = getAuthInfo(req);

    // Busca usuário logado (para preencher "Antigo Proprietário")
const user = await prisma.user.findUnique({
  where: { id: userId },
});

    // Busca gatos: USER vê só os seus, ADMIN vê todos
    const cats = await prisma.cat.findMany({
      where: isAdmin ? {} : { ownerId: userId },
      orderBy: { name: "asc" },
    });

  res.render("transfers/new", {
  user,
  cats,
  currentPath: "/transfers/new",
});

    }
  );

// ---------- POST /transfers/new ----------
router.post(
  "/transfers/new",
  requireAuth,
  requirePermission("service.transfer"),
  upload.single("authorizationFile"),
  async (req, res) => {

// 🔒 VALIDAÇÃO OBRIGATÓRIA PARA "OUTRO"
if (req.body.oldOwnerType === "OTHER" && !req.file) {
  return res.status(400).send(
    "Documento do antigo proprietário é obrigatório quando selecionado 'Outro'."
  );
}

    console.log(">>> POST /transfers/new FOI CHAMADO");
    console.log("FILE:", req.file);
  const { 
  catId,
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


  const userId = req.session.userId;

  try {
    // 1) Buscar usuário (dono atual)
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

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

if (req.file) {
  authorizationFilePath = `/uploads/transfer-authorization/${req.file.filename}`;
}



    // 2) Criar SERVICE REQUEST
    const service = await prisma.serviceRequest.create({
      data: {
        userId,
        type: ("Transferência de Propriedade"),
        description: `Transferência do gato #${catId}`,
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
        ? phone
        : null,

    authorizationFile: authorizationFilePath,

    serviceRequest: {
      connect: { id: service.id }
    }
  }
});


    res.redirect("/my-services");

  } catch (err) {
    console.error("Erro ao registrar transferência:", err);
    res.status(500).send("Erro ao registrar transferência");
  }
});

  return router;
};
