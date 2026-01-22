require("dotenv").config();

const express = require("express");
const session = require("express-session");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const archiver = require("archiver");
const { generateLitterAdminBundle, generateLitterUserPDF } = require("./modules/pdf/litterPdf");
const { generateTransferPDF } = require("./modules/pdf/transferPdf");
const { generateLitterAuthorizationPDF } = require("./modules/pdf/litterAuthorizationPdf");
const { generateTransferAuthorizationPDF } = require("./modules/pdf/transferAuthorizationPdf");
const titleHomologation = require("./modules/title-homologation");
const pedigreeHomologation = require("./modules/pedigree-homologation");
const atestadoSaude = require("./modules/atestado-saude");
const catteryRegistration = require("./modules/cattery-registration");
const {generateTitleHomologationPDF,} = require("./modules/pdf/titleHomologationPdf");
const {generatePedigreeHomologationPDF,} = require("./modules/pdf/pedigreeHomologationPdf");
const { generateCatteryRegistrationPDF } = require("./modules/pdf/catteryRegistrationPdf");
const { generateSecondCopyPDF } = require("./modules/pdf/secondCopyPdf");





console.log("DATABASE_URL em uso:", process.env.DATABASE_URL);

console.log(">>> Iniciando CaTech COMPLETO (modularizado)");

const app = express();
const prisma = new PrismaClient();



// ===============================
// PADRONIZAÇÃO DE NOMES DE ARQUIVO
// ===============================
function serviceZipName(service) {
  return `Serviço ${service.id} - ${service.type}.zip`;
}


// ---------- MIDDLEWARES BÁSICOS ----------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// arquivos estáticos (CSS, JS, imagens, uploads etc.)
app.use(express.static(path.join(__dirname, "public")));

// ---------- VIEW ENGINE ----------
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ---------- SESSÃO ----------
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
  })
);


// ---------- MIDDLEWARES DE AUTENTICAÇÃO ----------
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.session.userRole !== "ADMIN") {
    return res.status(403).send("Acesso negado");
  }
  next();
}

// ---------- ROTAS BÁSICAS ----------
app.get("/", (req, res) => {
  return res.redirect("/dashboard");
});

// ---------- LOGIN ----------
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.render("login", { error: "Usuário ou senha inválidos" });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.render("login", { error: "Usuário ou senha inválidos" });
    }

    // Bloqueia login se não estiver DEFERIDO
    if (user.approvalStatus && user.approvalStatus !== "DEFERIDO") {
      return res.render("login", {
        error:
          "Seu cadastro ainda não foi aprovado ou está com restrições, entre em contato com o Administrador.",
      });
    }

    req.session.userId = user.id;
    req.session.userRole = user.role; // <- importante p/ saber se é ADMIN

    return res.redirect("/dashboard");
  } catch (err) {
    console.error("Erro no login:", err);
    return res.status(500).send("Erro no login");
  }
});

// ---------- CADASTRO DE USUÁRIO ----------
app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
const {
  name,
  address,
  city,
  cep,
  state,
  country,
  phones,
  email,
  cpf,
  password,
  confirmPassword,
  clubs,

  hasFifeCattery,
  fifeCatteryName
} = req.body;


  try {
    if (!name || !email || !password || !confirmPassword) {
      return res.render("register", {
        error: "Preencha pelo menos Nome, E-mail e Senha.",
      });
    }

    if (password !== confirmPassword) {
      return res.render("register", { error: "As senhas não conferem." });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.render("register", { error: "E-mail já cadastrado." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    let clubsValue = null;
    if (Array.isArray(clubs)) {
      clubsValue = clubs.join(", ");
    } else if (typeof clubs === "string") {
      clubsValue = clubs;
    }

await prisma.user.create({
  data: {
    name,
    address,
    city,
    cep,
    state,
    country,
    phones,
    email,
    cpf,
    password: passwordHash,
    role: "USER",
    clubs: clubsValue,

    hasFifeCattery: hasFifeCattery || "NO",
    fifeCatteryName:
      hasFifeCattery === "YES" ? fifeCatteryName : null,
  },
});


    return res.redirect("/login");
  } catch (err) {
    console.error("Erro no cadastro:", err);
    return res.status(500).send("Erro no cadastro");
  }
});

// ---------- DASHBOARD ----------
app.get("/dashboard", requireAuth, async (req, res) => {
  try {
   
   
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
    });

    let catsInReviewCount = 0;

if (req.session.userRole === "ADMIN") {
  catsInReviewCount = await prisma.cat.count({
    where: {
      status: "NOVO", // Em análise
    },
  });
}

let usersPendingApprovalCount = 0;

if (req.session.userRole === "ADMIN") {
  usersPendingApprovalCount = await prisma.user.count({
    where: {
      approvalStatus: "INDEFERIDO",
    },
  });
}

let servicesPendingFFBCount = 0;

if (req.session.userRole === "ADMIN") {
  const services = await prisma.serviceRequest.findMany({
    include: {
      statuses: {
        orderBy: { createdAt: "desc" },
        take: 1, // 👈 só o status atual
      },
    },
  });

  servicesPendingFFBCount = services.filter(
    s => s.statuses[0]?.status === "ENVIADO_GATARINA"
  ).length;
}



res.render("dashboard", {
  user,
  userRole: req.session.userRole,

  catsInReviewCount,
  usersPendingApprovalCount,
  servicesPendingFFBCount,

  currentPath: req.path,
});



  } catch (err) {
    console.error("Erro ao carregar dashboard:", err);
    res.status(500).send("Erro ao carregar dashboard");
  }
});

app.get("/meus-dados", requireAuth, async (req, res) => {
  try {
    // Bloqueia ADMIN (ADMIN não usa essa tela)
    if (req.session.userRole === "ADMIN") {
      return res.redirect("/dashboard");
    }

    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
    });

    res.render("users/my-profile", {
      user,
      currentPath: "/meus-dados",
    });
  } catch (err) {
    console.error("Erro ao carregar Meus Dados:", err);
    res.status(500).send("Erro ao carregar Meus Dados");
  }
});

app.post("/meus-dados", requireAuth, async (req, res) => {
  try {
    if (req.session.userRole === "ADMIN") {
      return res.redirect("/dashboard");
    }

    const {
      name,
      cpf,
      country,
      address,
      city,
      state,
      cep,
      phones,
      email,
    } = req.body;

    await prisma.user.update({
      where: { id: req.session.userId },
      data: {
        name,
        cpf,
        country,
        address,
        city,
        state,
        cep,
        phones,
        email,
      },
    });

    res.redirect("/meus-dados");
  } catch (err) {
    console.error("Erro ao salvar Meus Dados:", err);
    res.status(500).send("Erro ao salvar dados");
  }
});


// ---------- SERVIÇOS (USUÁRIO LOGADO) ----------
app.get("/services", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
    });

    res.render("services/index", {
      user,
      currentPath: req.path,
    });
  } catch (err) {
    console.error("Erro ao carregar página de Serviços:", err);
    res.status(500).send("Erro ao carregar página de Serviços");
  }
});

// ---------- MEUS SERVIÇOS (USUÁRIO LOGADO) ----------
app.get("/my-services", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

const services = await prisma.serviceRequest.findMany({
  where: { userId },
  orderBy: { createdAt: "desc" },
  include: {
    statuses: {
      orderBy: { createdAt: "desc" },
      take: 1,
    },
     transferRequest: true,
     titleHomologation: true,
     pedigreeHomologation: true,
     catteryRegistration: true,
  },
});

for (const s of services) {
  if (s.type === "Homologação de Títulos" && s.titleHomologation) {
    const cat = await prisma.cat.findUnique({
      where: { id: s.titleHomologation.catId },
      select: { name: true },
    });

    if (cat?.name) {
      s.description = `${s.description} - Gato: ${cat.name}`;
    }
  }
}


// 🔽 ENRIQUECER SERVIÇOS DE NINHADA COM NOME DA MÃE
for (const s of services) {
  if (s.type === "Registro de Ninhada" && s.description) {
    const match = s.description.match(/#(\d+)/);
    if (match) {
      const litterId = Number(match[1]);

      const litter = await prisma.litter.findUnique({
        where: { id: litterId },
      });

      if (litter?.femaleName) {
        s.description = `Registro de ninhada - Mãe: ${litter.femaleName}`;
      }
    }
  }
}

for (const s of services) {
  if (s.type === "Transferência de Propriedade" && s.transferRequest) {
    const cat = await prisma.cat.findUnique({
      where: { id: s.transferRequest.catId },
      select: { name: true },
    });

    if (cat?.name) {
      s.description = `Transferência de Propriedade - Gato: ${cat.name}`;
    }
  }
}


    res.render("services/my-services", {
      user,
      services,
      currentPath: req.path,
    });
  } catch (err) {
    console.error("Erro ao carregar página Meus Serviços:", err);
    res.status(500).send("Erro ao carregar Meus Serviços");
  }
});


// ---------- FORMULÁRIO AUTORIZAÇÃO REPRODUÇÃO PDF ----------

app.get("/services/autorizacao-registro-ninhada", async (req, res) => {
  try {
    const pdfBuffer = await generateLitterAuthorizationPDF();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Autorizacao_Registro_Ninhada.pdf"'
    );

    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Erro ao gerar PDF Autorização Registro Ninhada:", err);
    return res.status(500).send("Erro ao gerar PDF.");
  }
});


// ---------- FORMULÁRIO TRANSFERÊNCIA DE PROPRIEDADE PDF ----------

app.get("/services/autorizacao-transferencia-propriedade", async (req, res) => {
  try {
    const pdfBuffer = await generateTransferAuthorizationPDF();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Autorizacao_Transferencia_Propriedade.pdf"'
    );

    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Erro ao gerar PDF Autorização Transferência:", err);
    return res.status(500).send("Erro ao gerar PDF.");
  }
});


// ---------- DETALHE DE UM SERVIÇO ----------
app.get("/my-services/:id", requireAuth, async (req, res) => {
  try {
    const serviceId = parseInt(req.params.id, 10);
    const userId = req.session.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    const service = await prisma.serviceRequest.findFirst({
      where: {
        id: serviceId,
        userId: userId, // garante que o serviço é do usuário logado
      },
      include: {
        statuses: {
          orderBy: { createdAt: "asc" }, // linha do tempo
        },
        transferRequest: true,
        titleHomologation: true,
        pedigreeHomologation: true,
        catteryRegistration: true,
      },
    });

    if (!service) {
      return res.status(404).send("Serviço não encontrado.");
    }

    if (service.type === "Homologação de Títulos" && service.titleHomologation) {
  const cat = await prisma.cat.findUnique({
    where: { id: service.titleHomologation.catId },
    select: { name: true },
  });

  if (cat?.name) {
    service.description = `${service.description} - Gato: ${cat.name}`;
  }
}


    if (
  service.type === "Transferência de Propriedade" &&
  service.transferRequest
) {
  const cat = await prisma.cat.findUnique({
    where: { id: service.transferRequest.catId },
    select: { name: true },
  });

  if (cat?.name) {
    service.description = `Transferência de Propriedade - Gato: ${cat.name}`;
  }
}

    // 🔽 AJUSTE DA DESCRIÇÃO PARA REGISTRO DE NINHADA
if (service.type === "Registro de Ninhada" && service.description) {
  const match = service.description.match(/#(\d+)/);

  if (match) {
    const litterId = Number(match[1]);

    const litter = await prisma.litter.findUnique({
      where: { id: litterId },
    });

    if (litter?.femaleName) {
      service.description = `Registro de ninhada - Mãe: ${litter.femaleName}`;
    }
  }
}

    res.render("services/my-services-detail", {
      user,
      service,
      currentPath: "/my-services",
    });
  } catch (err) {
    console.error("Erro ao carregar detalhe do serviço:", err);
    res.status(500).send("Erro ao carregar detalhe do serviço");
  }
});

// ---------- EXEMPLO DE ROTA APENAS PARA ADMIN ----------
app.get("/admin/painel", requireAuth, requireAdmin, (req, res) => {
  res.send("Bem-vindo ao painel administrativo!");
});

// ---------- LOGOUT ----------
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// ---------- ROTAS DOS MÓDULOS ----------
const catsRouter = require("./modules/cats")(prisma, requireAuth);
const littersRouter = require("./modules/litters")(prisma, requireAuth);
const usersRouter = require("./modules/users")(prisma, requireAuth);
const transfersRouter = require("./modules/transfers")(prisma, requireAuth);

app.use(catsRouter);
app.use(littersRouter);
app.use(usersRouter);
app.use(transfersRouter);

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// MÓDULO: HOMOLOGAÇÃO DE TÍTULOS
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
app.use(titleHomologation(prisma, requireAuth));


// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// MÓDULO: HOMOLOGAÇÃO DE PEDIGREE
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
app.use(pedigreeHomologation(prisma, requireAuth));

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// DOWNLOAD: ATESTADO DE SAÚDE PARA REPRODUÇÃO
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
app.use(atestadoSaude(requireAuth, requireAdmin));

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
//  MÓDULO: REGISTRO DE GATIL
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
app.use(catteryRegistration(prisma, requireAuth));


// ---------- ROTAS DO MÓDULO SERVIÇOS FFB (somente ADMIN) ----------
const ffbServicesRouter = require("./modules/ffbServices")(
  prisma,
  requireAuth,
  requireAdmin
);
app.use(ffbServicesRouter);


// ---------- MÓDULO: SEGUNDA VIA E ALTERAÇÕES ----------
const secondCopyRouter = require("./modules/secondCopy")(
  prisma,
  requireAuth
);
app.use(secondCopyRouter);







// =====================================================
// BUNDLE DE SERVIÇO FFB (PDF + Anexos) → ADMIN
// =====================================================
app.get("/ffb-services/:id/bundle", requireAuth, requireAdmin, async (req, res) => {
  try {
    const serviceId = parseInt(req.params.id, 10);

const serviceWithStatus = await prisma.serviceRequest.findUnique({
  where: { id: serviceId },
include: {
  user: true,
  statuses: { orderBy: { createdAt: "asc" } },
  transferRequest: true,
  titleHomologation: true,
  pedigreeHomologation: true,
  catteryRegistration: true,
  secondCopyRequest: true,
},
});


    if (!serviceWithStatus) {
  return res.status(404).send("Serviço não encontrado.");
}

// --------------------------
// MAPA DE NINHADA
// --------------------------
let litter = null;
let kittens = [];
let sire = null;
let dam = null;

if (serviceWithStatus.type === "Registro de Ninhada") {
  if (serviceWithStatus.description) {
    const match = serviceWithStatus.description.match(/#(\d+)/);
    if (match) {
      const litterId = parseInt(match[1], 10);

      litter = await prisma.litter.findUnique({
  where: { id: litterId },
  include: { kittens: { orderBy: { index: "asc" } } },
});

if (litter) {
  // ✅ ESSA LINHA é a correção principal
  kittens = litter.kittens || [];

  if (litter.maleMicrochip) {
    const maleMc = String(litter.maleMicrochip).replace(/\D/g, "").slice(0, 15);

    sire = await prisma.cat.findFirst({
      where: {
        OR: [{ microchip: litter.maleMicrochip }, { microchip: maleMc }],
      },
    });
  }

  if (litter.femaleMicrochip) {
    const femaleMc = String(litter.femaleMicrochip).replace(/\D/g, "").slice(0, 15);

    dam = await prisma.cat.findFirst({
      where: {
        OR: [{ microchip: litter.femaleMicrochip }, { microchip: femaleMc }],
      },
    });
  }
}

    }
  }

  console.log("BUNDLE LITTER", {
  litterId: litter?.id,
  maleMicrochip: litter?.maleMicrochip,
  femaleMicrochip: litter?.femaleMicrochip,
  sireFound: !!sire,
  damFound: !!dam,
  sirePedigree: sire?.pedigreeFile,
  sireRepro: sire?.reproductionFile,
  damPedigree: dam?.pedigreeFile,
  damRepro: dam?.reproductionFile,
});

  return generateLitterAdminBundle(
    serviceWithStatus,
    litter,
    kittens,
    sire,
    dam,
    res
  );
}


// -----------------------------------------
// HOMOLOGAÇÃO DE TÍTULO (ADMIN) — ZIP
// -----------------------------------------
if (serviceWithStatus.type === "Homologação de Títulos") {
  const th = serviceWithStatus.titleHomologation;

  if (!th) {
    return res.status(400).send("Homologação de título não encontrada.");
  }

  const cat = await prisma.cat.findUnique({
    where: { id: th.catId },
  });

  // Pasta tmp
  const tmpDir = path.join(__dirname, "tmp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

  const tmpPDF = path.join(
    tmpDir,
    `title-homologation-${serviceWithStatus.id}.pdf`
  );

  const pdfStream = fs.createWriteStream(tmpPDF);

  await generateTitleHomologationPDF(
    serviceWithStatus,
    th,
    cat,
    serviceWithStatus.user,
    pdfStream
  );

  res.setHeader("Content-Type", "application/zip");
res.setHeader(
  "Content-Disposition",
  `attachment; filename=Serviço ${serviceWithStatus.id} - Homologação de Títulos.zip`
);


  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);

  pdfStream.on("finish", () => {
    // PDF principal
    archive.file(tmpPDF, {
      name: `title-homologation-${serviceWithStatus.id}.pdf`,
    });

    // PEDIGREE DO GATO
    if (cat?.pedigreeFile) {
      const pedigreePath = path.join(
        __dirname,
        "public",
        cat.pedigreeFile.replace(/^\/+/, "")
      );

      if (fs.existsSync(pedigreePath)) {
        archive.file(pedigreePath, {
          name: `PEDIGREE-${path.basename(pedigreePath)}`,
        });
      }
    }

    // 🔥 CERTIFICADOS (AQUI ESTAVA FALTANDO)
    let certificates = [];
    try {
      certificates = th.certificatesJson
        ? JSON.parse(th.certificatesJson)
        : [];
    } catch {
      certificates = [];
    }

    certificates.forEach((cert, index) => {
      if (!cert.file) return;

      const abs = path.join(
        __dirname,
        "public",
        cert.file.replace(/^\/+/, "")
      );

      if (fs.existsSync(abs)) {
        archive.file(abs, {
          name: `CERTIFICADO-${index + 1}-${path.basename(abs)}`,
        });
      }
    });

    archive.finalize();
  });

  return;
}


// -----------------------------------------
// HOMOLOGAÇÃO DE PEDIGREE (ADMIN) — ZIP
// -----------------------------------------
if (serviceWithStatus.type === "Homologação de Pedigree") {
  const ph = serviceWithStatus.pedigreeHomologation;

  if (!ph) {
    return res.status(400).send("Homologação de pedigree não encontrada.");
  }

  const cat = await prisma.cat.findUnique({
    where: { id: ph.catId },
  });

  // Criar pasta tmp
  const tmpDir = path.join(__dirname, "tmp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

  // Criar PDF temporário
  const tmpPDF = path.join(
    tmpDir,
    `pedigree-homologation-${serviceWithStatus.id}.pdf`
  );
  const pdfStream = fs.createWriteStream(tmpPDF);

  await generatePedigreeHomologationPDF(
    serviceWithStatus,
    ph,
    cat,
    serviceWithStatus.user,
    pdfStream
  );

  res.setHeader("Content-Type", "application/zip");
res.setHeader(
  "Content-Disposition",
  `attachment; filename=Serviço ${serviceWithStatus.id} - Homologação de Pedigree.zip`
);


  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);

  pdfStream.on("finish", () => {
    archive.file(tmpPDF, {
      name: `pedigree-homologation-${serviceWithStatus.id}.pdf`,
    });

    // inclui o pedigree do gato (se existir)
    if (cat?.pedigreeFile) {
      const pedigreePath = path.join(
        __dirname,
        "public",
        cat.pedigreeFile.replace(/^\/+/, "")
      );

      if (fs.existsSync(pedigreePath)) {
        archive.file(pedigreePath, {
          name: `PEDIGREE-${path.basename(pedigreePath)}`,
        });
      }
    }

    archive.finalize();
  });

  return;
}

    // -----------------------------------------
    // TRANSFERÊNCIA (ADMIN) — ZIP
    // -----------------------------------------
    if (serviceWithStatus.type === "Transferência de Propriedade") {
      const transfer = serviceWithStatus.transferRequest;
      if (!transfer) return res.status(400).send("Transferência não encontrada.");

      const cat = await prisma.cat.findUnique({ where: { id: transfer.catId } });

      // Criar pasta tmp
      const tmpDir = path.join(__dirname, "tmp");
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

      // Criar PDF temporário
      const tmpPDF = path.join(tmpDir, `transfer-${serviceWithStatus.id}.pdf`);
      const pdfStream = fs.createWriteStream(tmpPDF);


// 🔴 GERAR PDF USANDO O SERVICE COMPLETO
await generateTransferPDF(
  serviceWithStatus,
  transfer,
  cat,
  serviceWithStatus.user,
  pdfStream
);

      // Agora montar o ZIP
      res.setHeader("Content-Type", "application/zip");
res.setHeader(
  "Content-Disposition",
  `attachment; filename=Serviço ${serviceWithStatus.id} - Transferência de Propriedade.zip`
);

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);

      // Inserir o PDF principal
      pdfStream.on("finish", () => {
        archive.file(tmpPDF, { name: `transfer-${serviceWithStatus.id}.pdf` });

        // --------------------------------------
        // Apenas PEDIGREE deve ser incluído
        // --------------------------------------
        if (cat.pedigreeFile) {
          const pedigreePath = path.join(
            __dirname,
            "public",
            cat.pedigreeFile.replace(/^\//, "")
          );

          if (fs.existsSync(pedigreePath)) {
            archive.file(pedigreePath, {
              name: `PEDIGREE-${path.basename(pedigreePath)}`,
            });
          }
        }

        // --------------------------------------
// AUTORIZAÇÃO DE TRANSFERÊNCIA (se existir)
// --------------------------------------
if (transfer.authorizationFile) {
  const authPath = path.join(
    __dirname,
    "public",
    transfer.authorizationFile.replace("/uploads/", "uploads/")
  );

  if (fs.existsSync(authPath)) {
    archive.file(authPath, {
      name: `AUTORIZACAO_TRANSFERENCIA${path.extname(authPath)}`,
    });
  }
}


        archive.finalize();
      });

      return;
    }

    
// -----------------------------------------
// REGISTRO DE GATIL (ADMIN) — ZIP (APENAS PDF)
// -----------------------------------------
if (serviceWithStatus.type === "Registro de Gatil") {
  const cr = serviceWithStatus.catteryRegistration;

  if (!cr) {
    return res.status(400).send("Registro de Gatil não encontrado.");
  }

  // Criar pasta tmp (se não existir)
  const tmpDir = path.join(__dirname, "tmp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

  // Caminho do PDF temporário
  const tmpPDF = path.join(
    tmpDir,
    `cattery-registration-${serviceWithStatus.id}.pdf`
  );

  const pdfStream = fs.createWriteStream(tmpPDF);

  // Gerar o PDF
  await generateCatteryRegistrationPDF(
    serviceWithStatus,
    cr,
    serviceWithStatus.user,
    pdfStream
  );

  // Cabeçalhos do ZIP
  res.setHeader("Content-Type", "application/zip");
res.setHeader(
  "Content-Disposition",
  `attachment; filename=Serviço ${serviceWithStatus.id} - Registro de Gatil.zip`
);

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);

  // Quando o PDF terminar de ser gravado
  pdfStream.on("finish", () => {
    archive.file(tmpPDF, {
      name: `Registro de Gatil-${serviceWithStatus.id}.pdf`,
    });

    archive.finalize();
  });

  return;
}


// -----------------------------------------
// SEGUNDA VIA E ALTERAÇÕES (ADMIN) — ZIP
// -----------------------------------------
if (serviceWithStatus.type === "Segunda Via e Alterações") {
  const sc = serviceWithStatus.secondCopyRequest;

  if (!sc) {
    return res.status(400).send("Solicitação de Segunda Via não encontrada.");
  }

  const cat = sc.catId
    ? await prisma.cat.findUnique({ where: { id: sc.catId } })
    : null;

  const tmpDir = path.join(__dirname, "tmp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

  const tmpPDF = path.join(
    tmpDir,
    `second-copy-${serviceWithStatus.id}.pdf`
  );

  const pdfStream = fs.createWriteStream(tmpPDF);

  await generateSecondCopyPDF(
    serviceWithStatus,
    sc,
    cat,
    pdfStream
  );

  res.setHeader("Content-Type", "application/zip");
  const secondCopyLabels = {
  PEDIGREE_SECOND_COPY: "Segunda Via de Pedigree",
  TITLE_DIPLOMA_SECOND_COPY: "Segunda Via de Título",
  OWNERSHIP_DOC_SECOND_COPY: "Segunda Via de Propriedade",
  CHANGE_TO_NOT_BREEDING: "Mudança de For Breeding para Not For Breeding",
  CHANGE_TO_BREEDING: "Mudança de Not For Breeding para For Breeding",
  CHANGE_COLOR: "Mudança de Cor",
  FIX_MICROCHIP: "Correção de Microchip",
  FIX_SEX: "Correção de Sexo",
  CATTERY_SECOND_COPY: "Segunda Via de Registro de Gatil",
  OTHER: "Outros",
};

const label =
  secondCopyLabels[sc.requestType] || sc.requestType;

res.setHeader(
  "Content-Disposition",
  `attachment; filename=Serviço ${serviceWithStatus.id} - ${label}.zip`
);


  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);

  pdfStream.on("finish", () => {
    archive.file(tmpPDF, {
      name: `Segunda-Via-${serviceWithStatus.id}.pdf`,
    });

    // 🐱 PEDIGREE (se existir)
    if (cat?.pedigreeFile) {
      const pedigreePath = path.join(
        __dirname,
        "public",
        cat.pedigreeFile.replace(/^\/+/, "")
      );
      if (fs.existsSync(pedigreePath)) {
        archive.file(pedigreePath, {
          name: `PEDIGREE-${path.basename(pedigreePath)}`,
        });
      }
    }

    // 📎 ANEXOS DO FORMULÁRIO
    let attachments = [];
    try {
      attachments = sc.attachmentsJson
        ? JSON.parse(sc.attachmentsJson)
        : [];
    } catch {}

    attachments.forEach((relPath, index) => {
      const abs = path.join(
        __dirname,
        "public",
        relPath.replace(/^\/+/, "")
      );
      if (fs.existsSync(abs)) {
        archive.file(abs, {
          name: `ANEXO-${index + 1}-${path.basename(abs)}`,
        });
      }
    });

    archive.finalize();
  });

  return;
}



    return res.status(400).send("Serviço sem PDF configurado.");
  } catch (err) {
    console.error("Erro ao gerar bundle FFB:", err);
    res.status(500).send("Erro ao gerar bundle");
  }
});

// ======================================================
// GERAR APENAS PDF (USUÁRIO)
// ======================================================
app.get("/my-services/:id/pdf", requireAuth, async (req, res) => {
  try {
    const serviceId = parseInt(req.params.id, 10);
    const userId = req.session.userId;

    const service = await prisma.serviceRequest.findFirst({
      where: {
        id: serviceId,
        userId: userId,
      },
include: {
  user: true,
  statuses: { orderBy: { createdAt: "asc" } },
  transferRequest: true,
  titleHomologation: true, 
  pedigreeHomologation: true,
  catteryRegistration: true,
},

    });

    if (!service) return res.status(404).send("Serviço não encontrado.");

    // -------------------------------
    // MAPA DE NINHADA (USUÁRIO)
    // -------------------------------
    if (service.type === "Registro de Ninhada") {
      let litter = null;
      let kittens = [];
      let sire = null;
      let dam = null;

      if (service.description) {
        const match = service.description.match(/#(\d+)/);
        if (match) {
          const litterId = parseInt(match[1], 10);

          litter = await prisma.litter.findUnique({
            where: { id: litterId },
            include: { kittens: { orderBy: { index: "asc" } } },
          });

          if (litter) {
            kittens = litter.kittens;

            if (litter.maleMicrochip) {
              sire = await prisma.cat.findFirst({
                where: { microchip: litter.maleMicrochip },
              });
            }
            if (litter.femaleMicrochip) {
              dam = await prisma.cat.findFirst({
                where: { microchip: litter.femaleMicrochip },
              });
            }
          }
        }
      }

      return generateLitterUserPDF(service, litter, kittens, sire, dam, res);
    }

// -------------------------------
// TRANSFERÊNCIA (usuário)
// -------------------------------
if (service.type === "Transferência de Propriedade") {
  const tr = service.transferRequest;

  if (!tr) return res.status(400).send("Transferência não encontrada.");

  const cat = await prisma.cat.findUnique({
    where: { id: tr.catId },
  });

  // 🔴 REBUSCAR SERVICE COM STATUS (GARANTIA TOTAL)
  const serviceWithStatus = await prisma.serviceRequest.findUnique({
    where: { id: service.id },
    include: {
      user: true,
      statuses: { orderBy: { createdAt: "asc" } },
    },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=transfer-${service.id}.pdf`
  );

  return generateTransferPDF(
    serviceWithStatus,
    tr,
    cat,
    serviceWithStatus.user,
    res
  );
}

// -------------------------------
// HOMOLOGAÇÃO DE TÍTULO (USUÁRIO)
// -------------------------------
if (service.type === "Homologação de Títulos") {
  const th = service.titleHomologation;

  if (!th) {
    return res.status(400).send("Dados da homologação não encontrados.");
  }

  const cat = await prisma.cat.findUnique({
    where: { id: th.catId },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=title-homologation-${service.id}.pdf`
  );

  return generateTitleHomologationPDF(
    service,
    th,
    cat,
    service.user,
    res
  );
}

// -------------------------------
// HOMOLOGAÇÃO DE PEDIGREE (USUÁRIO)
// -------------------------------
if (service.type === "Homologação de Pedigree") {
  const ph = service.pedigreeHomologation;

  if (!ph) {
    return res.status(400).send("Dados da homologação de pedigree não encontrados.");
  }

  const cat = await prisma.cat.findUnique({
    where: { id: ph.catId },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=pedigree-homologation-${service.id}.pdf`
  );

  return generatePedigreeHomologationPDF(
    service,
    ph,
    cat,
    service.user,
    res
  );
}

// -------------------------------
// REGISTRO DE GATIL (USUÁRIO)
// -------------------------------
if (service.type === "Registro de Gatil") {
  const cr = service.catteryRegistration;

  if (!cr) {
    return res.status(400).send("Dados do Registro de Gatil não encontrados.");
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=cattery-registration-${service.id}.pdf`
  );

  return generateCatteryRegistrationPDF(
    service,
    cr,
    service.user,
    res
  );
}

// -------------------------------
// SEGUNDA VIA E ALTERAÇÕES (USUÁRIO)
// -------------------------------
if (service.type === "Segunda Via e Alterações") {

  const secondCopy = await prisma.secondCopyRequest.findUnique({
    where: { serviceRequestId: service.id },
  });

  if (!secondCopy) {
    return res.status(400).send("Dados da Segunda Via não encontrados.");
  }

  let cat = null;

  if (secondCopy.catId) {
    cat = await prisma.cat.findUnique({
      where: { id: secondCopy.catId },
    });
  }

  return generateSecondCopyPDF(
    service,
    secondCopy,
    cat,
    res
  );
}


 return res
  .status(400)
  .send(`Tipo de serviço sem PDF disponível: ${service.type}`);

  } catch (err) {
    console.error("Erro ao gerar PDF do serviço:", err);
    return res.status(500).send("Erro ao gerar PDF do serviço");
  }
});


// ---------- TRATAMENTO DE 404 SIMPLES ----------
app.use((req, res) => {
  res.status(404).send("Página não encontrada");
});

// ---------- INICIALIZAÇÃO DO SERVIDOR ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});


