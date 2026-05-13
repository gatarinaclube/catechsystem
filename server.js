require("dotenv").config();

const express = require("express");
const session = require("express-session");
const path = require("path");
const crypto = require("crypto");
const { PrismaClient, Prisma } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const archiver = require("archiver");
const {
  ROLES,
  normalizeRole,
  isAdminRole,
  canViewAllData,
  buildAccessContext,
  userCan,
} = require("./utils/access");
const { sendStatusEmail } = require("./utils/mailer");
const { generateLitterAdminBundle, generateLitterUserPDF } = require("./modules/pdf/litterPdf");
const { generateTransferPDF } = require("./modules/pdf/transferPdf");
const { generateLitterAuthorizationPDF } = require("./modules/pdf/litterAuthorizationPdf");
const { generateTransferAuthorizationPDF } = require("./modules/pdf/transferAuthorizationPdf");
const titleHomologation = require("./modules/title-homologation");
const pedigreeHomologation = require("./modules/pedigree-homologation");
const atestadoSaude = require("./modules/atestado-saude");
const catteryRegistration = require("./modules/cattery-registration");
const settingsRouterFactory = require("./modules/settings");
const breedersRouterFactory = require("./modules/breeders");
const littersAdminRouterFactory = require("./modules/litters-admin");
const kittensAdminRouterFactory = require("./modules/kittens-admin");
const matingsAdminRouterFactory = require("./modules/matings-admin");
const vaccinationsAdminRouterFactory = require("./modules/vaccinations-admin");
const dewormingAdminRouterFactory = require("./modules/deworming-admin");
const weighingAdminRouterFactory = require("./modules/weighing-admin");
const examsAdminRouterFactory = require("./modules/exams-admin");
const historyAdminRouterFactory = require("./modules/history-admin");
const quickLaunchRouterFactory = require("./modules/quick-launch");
const reportsRouterFactory = require("./modules/reports");
const revenuesRouterFactory = require("./modules/revenues");
const crmRouterFactory = require("./modules/crm");
const administrativeRouterFactory = require("./modules/administrative");
const academyRouterFactory = require("./modules/academy");
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

// -------------------------------
// UPLOADS (Render Disk / local)
// -------------------------------
// Em produção: UPLOADS_DIR=/var/data/uploads  (contém cats/, litters/, etc.)
// Em dev: public/uploads
const UPLOADS_ROOT =
  process.env.UPLOADS_DIR || path.join(__dirname, "public", "uploads");

// Serve /uploads/... a partir do local correto
app.use("/uploads", express.static(UPLOADS_ROOT));

app.get("/despesas/opcoes-safe", (req, res) => {
  res.redirect(303, "/despesas/opcoes");
});

app.get("/despesas/opcoes", async (req, res) => {
  try {
    await renderExpenseOptionsDirect(req, res, { success: req.query.ok === "1" });
  } catch (err) {
    console.error("Erro ao carregar opções editáveis de despesas:", err);
    await renderExpenseOptionsDirect(req, res, {
      error: "Não foi possível carregar as opções salvas. Você ainda pode tentar cadastrar uma nova opção.",
      options: [],
    });
  }
});



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
  if (!isAdminRole(req.session.userRole)) {
    return res.status(403).send("Acesso negado");
  }
  next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!userCan(req.session?.userRole, permission)) {
      return res
        .status(403)
        .send("Seu perfil não possui acesso a este módulo.");
    }

    next();
  };
}

function buildAbsoluteUrl(req, pathValue) {
  const baseUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  if (baseUrl) return `${baseUrl}${pathValue}`;
  return `${req.protocol}://${req.get("host")}${pathValue}`;
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

app.use(async (req, res, next) => {
  try {
    const sessionRole = normalizeRole(req.session?.userRole);

    req.user = null;
    res.locals.user = null;
    res.locals.access = buildAccessContext(sessionRole);

    if (!req.session?.userId) {
      return next();
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: req.session.userId },
    });

    if (!currentUser) {
      req.session.destroy(() => {});
      return next();
    }

    const normalizedRole = normalizeRole(currentUser.role || sessionRole);
    req.session.userRole = normalizedRole;

    req.user = {
      ...currentUser,
      role: normalizedRole,
      roleLabel: buildAccessContext(normalizedRole).roleLabel,
    };

    req.session.user = req.user;
    res.locals.user = req.user;
    res.locals.access = buildAccessContext(normalizedRole);

    next();
  } catch (err) {
    next(err);
  }
});

// ---------- ROTAS BÁSICAS ----------
app.get("/", (req, res) => {
  return res.redirect("/dashboard");
});

// ---------- LOGIN ----------
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const { password } = req.body;

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
    req.session.userRole = normalizeRole(user.role); // <- importante p/ saber o perfil atual

    return res.redirect("/dashboard");
  } catch (err) {
    console.error("Erro no login:", err);
    return res.status(500).send("Erro no login");
  }
});

app.get("/forgot-password", (req, res) => {
  res.render("forgot-password", {
    error: null,
    success: null,
  });
});

app.post("/forgot-password", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const genericSuccess =
    "Se este e-mail estiver cadastrado, enviaremos um link para redefinir sua senha.";

  try {
    const user = email
      ? await prisma.user.findUnique({ where: { email } })
      : null;

    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashResetToken(token);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      const resetUrl = buildAbsoluteUrl(req, `/reset-password/${token}`);

      await sendStatusEmail({
        to: user.email,
        subject: "Redefinição de senha - CaTech System",
        html: `
          <p>Olá, ${escapeHtml(user.name || "associado")}.</p>
          <p>Recebemos uma solicitação para redefinir sua senha no CaTech System.</p>
          <p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a>.</p>
          <p>Este link é válido por 1 hora. Se você não solicitou a redefinição, ignore este e-mail.</p>
        `,
      });
    }

    return res.render("forgot-password", {
      error: null,
      success: genericSuccess,
    });
  } catch (err) {
    console.error("Erro ao solicitar redefinição de senha:", err);
    return res.status(500).render("forgot-password", {
      error: "Não foi possível enviar o e-mail de redefinição agora.",
      success: null,
    });
  }
});

app.get("/reset-password/:token", async (req, res) => {
  const tokenHash = hashResetToken(req.params.token || "");

  try {
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return res.status(400).render("reset-password", {
        token: null,
        error: "Este link expirou ou já foi utilizado.",
        success: null,
      });
    }

    return res.render("reset-password", {
      token: req.params.token,
      error: null,
      success: null,
    });
  } catch (err) {
    console.error("Erro ao abrir redefinição de senha:", err);
    return res.status(500).send("Erro ao abrir redefinição de senha.");
  }
});

app.post("/reset-password/:token", async (req, res) => {
  const { password, confirmPassword } = req.body;
  const tokenHash = hashResetToken(req.params.token || "");

  try {
    if (!password || password.length < 6) {
      return res.status(400).render("reset-password", {
        token: req.params.token,
        error: "Informe uma senha com pelo menos 6 caracteres.",
        success: null,
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).render("reset-password", {
        token: req.params.token,
        error: "As senhas não conferem.",
        success: null,
      });
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return res.status(400).render("reset-password", {
        token: null,
        error: "Este link expirou ou já foi utilizado.",
        success: null,
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.deleteMany({
        where: {
          userId: resetToken.userId,
          usedAt: null,
          id: { not: resetToken.id },
        },
      }),
    ]);

    return res.render("reset-password", {
      token: null,
      error: null,
      success: "Senha redefinida com sucesso. Você já pode entrar com a nova senha.",
    });
  } catch (err) {
    console.error("Erro ao redefinir senha:", err);
    return res.status(500).render("reset-password", {
      token: req.params.token,
      error: "Não foi possível redefinir a senha agora.",
      success: null,
    });
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
  const normalizedEmail = String(email || "").trim().toLowerCase();


  try {
    if (!name || !normalizedEmail || !password || !confirmPassword) {
      return res.render("register", {
        error: "Preencha pelo menos Nome, E-mail e Senha.",
      });
    }

    if (password !== confirmPassword) {
      return res.render("register", { error: "As senhas não conferem." });
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
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
    email: normalizedEmail,
    cpf,
    password: passwordHash,
    role: ROLES.BASIC,
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
   
   
    const user = req.user;
    const userScope = canViewAllData(req.session.userRole) ? {} : { ownerId: req.session.userId };
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const nextMonthStart = new Date(monthStart);
    nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    function moneyLabel(cents) {
      return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
    }

    function dateLabel(value) {
      if (!value) return "";
      const parsed = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(parsed.getTime())) return "";
      return parsed.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    }

    function parseJsonList(value) {
      if (!value) return [];
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }

    let catsInReviewCount = 0;

if (isAdminRole(req.session.userRole)) {
  catsInReviewCount = await prisma.cat.count({
    where: {
      status: "NOVO", // Em análise
    },
  });
}

let usersPendingApprovalCount = 0;

if (isAdminRole(req.session.userRole)) {
  usersPendingApprovalCount = await prisma.user.count({
    where: {
      approvalStatus: "INDEFERIDO",
    },
  });
}

let servicesPendingFFBCount = 0;

if (isAdminRole(req.session.userRole)) {
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

let pendingServices = [];

if (!isAdminRole(req.session.userRole)) {
  const services = await prisma.serviceRequest.findMany({
    where: { userId: req.session.userId },
    orderBy: { createdAt: "desc" },
    include: {
      statuses: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  pendingServices = services.filter(
    (s) => s.statuses[0]?.status === "COM_PENDENCIA"
  );
}

const kittenStatusRows = await prisma.cat.groupBy({
  by: ["kittenAvailabilityStatus"],
  where: {
    ...userScope,
    OR: [{ kittenNumber: { not: null } }, { litterKitten: { isNot: null } }],
  },
  _count: { _all: true },
});

const kittenStatusCounts = Object.fromEntries(
  kittenStatusRows.map((row) => [row.kittenAvailabilityStatus || "UNAVAILABLE", row._count._all])
);

const matingStatusRows = await prisma.matingPlan.groupBy({
  by: ["status"],
  where: userScope,
  _count: { _all: true },
});
const matingStatusCounts = Object.fromEntries(
  matingStatusRows.map((row) => [row.status || "PARA_ACASALAR", row._count._all])
);

const expenseMonthRows = await prisma.quickLaunchEntry.findMany({
  where: {
    ...userScope,
    competenceDate: { gte: monthStart, lt: nextMonthStart },
  },
  select: { amountCents: true },
});
const monthExpenseCents = expenseMonthRows.reduce(
  (sum, row) => sum + Number(row.amountCents || 0),
  0
);

const monthRevenues = await prisma.revenueEntry.findMany({
  where: userScope,
  select: {
    id: true,
    kittenLabel: true,
    parcelDataJson: true,
    client: { select: { fullName: true } },
  },
});
let monthRevenueCents = 0;
let receivableCents = 0;
let receivableCount = 0;
const attentionLimitDate = new Date(today);
attentionLimitDate.setDate(attentionLimitDate.getDate() + 15);
const receivableAttention = [];
monthRevenues.forEach((revenue) => {
  parseJsonList(revenue.parcelDataJson).forEach((parcel, index) => {
    const parcelDate = parcel.date ? new Date(`${parcel.date}T00:00:00`) : null;
    if (!parcelDate || Number.isNaN(parcelDate.getTime())) return;
    const amount = Number(parcel.amountCents || 0);
    if (parcel.paid && parcelDate >= monthStart && parcelDate < nextMonthStart) {
      monthRevenueCents += amount;
    }
    if (!parcel.paid && parcelDate >= today) {
      receivableCents += amount;
      receivableCount += 1;
    }
    if (!parcel.paid && parcelDate <= attentionLimitDate) {
      receivableAttention.push({
        date: parcelDate,
        title: `${revenue.kittenLabel || "Receita"} - Parcela ${index + 1}`,
        sub: [
          revenue.client?.fullName || "",
          moneyLabel(amount),
        ].filter(Boolean).join(" · "),
        href: `/receitas/${revenue.id}`,
        overdue: parcelDate < today,
      });
    }
  });
});

const weighingAttentionPlans = await prisma.weighingPlan.findMany({
  where: {
    shouldWeigh: true,
    cat: { is: userScope },
  },
  include: { cat: { select: { id: true, name: true } } },
  orderBy: { updatedAt: "desc" },
  take: 5,
});
const weighingAttentionCount = await prisma.weighingPlan.count({
  where: {
    shouldWeigh: true,
    cat: { is: userScope },
  },
});

const attentionItems = [
  ...receivableAttention
    .sort((a, b) => a.date - b.date)
    .slice(0, 5)
    .map((item) => ({
      title: item.title,
      sub: item.sub,
      badge: item.overdue ? "Atrasado" : dateLabel(item.date),
      href: item.href,
      color: item.overdue ? "is-red" : "is-blue",
    })),
  ...weighingAttentionPlans.map((plan) => ({
    title: plan.cat?.name || "Gato sem nome",
    sub: [
      "Pesagem ativa",
      plan.weighingFrequency || "",
      plan.weighingPeriod || "",
    ].filter(Boolean).join(" · "),
    badge: "Pesagem",
    href: "/admin/weighing",
    color: "is-yellow",
  })),
].slice(0, 8);

const operationalPanel = {
  kittens: {
    available: kittenStatusCounts.AVAILABLE || 0,
    reserved: kittenStatusCounts.RESERVED || 0,
    unavailable: kittenStatusCounts.UNAVAILABLE || 0,
    breeders: kittenStatusCounts.BREEDER || 0,
    delivered: kittenStatusCounts.DELIVERED || 0,
    deceased: kittenStatusCounts.DECEASED || 0,
  },
  matings: {
    ready: matingStatusCounts.PARA_ACASALAR || 0,
    pause: matingStatusCounts.PAUSA_REPRODUTIVA || 0,
    confirmed: matingStatusCounts.CONFIRMADO || 0,
    problem: matingStatusCounts.COM_PROBLEMA || 0,
  },
  finance: {
    incomeLabel: moneyLabel(monthRevenueCents),
    expenseLabel: moneyLabel(monthExpenseCents),
    balanceLabel: moneyLabel(monthRevenueCents - monthExpenseCents),
    receivableLabel: moneyLabel(receivableCents),
    receivableCount,
  },
  routines: {
    weighingAttentionCount,
  },
  attentionItems,
};


res.render("dashboard", {
  user,
  userRole: req.session.userRole,

  catsInReviewCount,
  usersPendingApprovalCount,
  servicesPendingFFBCount,

  pendingServices,
pendingServicesCount: pendingServices.length,
  operationalPanel,

  currentPath: req.path,
});



  } catch (err) {
    console.error("Erro ao carregar dashboard:", err);
    res.status(500).send("Erro ao carregar dashboard");
  }
});

app.get("/buscar", requireAuth, async (req, res) => {
  const query = String(req.query.q || "").trim();
  const userScope = canViewAllData(req.session.userRole) ? {} : { ownerId: req.session.userId };
  const contains = { contains: query, mode: "insensitive" };
  const results = {
    cats: [],
    litters: [],
    clients: [],
    sales: [],
  };

  if (query.length >= 2) {
    if (userCan(req.session.userRole, "cats.manage")) {
      results.cats = await prisma.cat.findMany({
        where: {
          ...userScope,
          OR: [
            { name: contains },
            { microchip: { contains: query.replace(/\D/g, "") || query } },
            { kittenNumber: contains },
          ],
        },
        orderBy: { name: "asc" },
        take: 12,
        select: { id: true, name: true, microchip: true, kittenNumber: true, breed: true },
      });
    }

    if (userCan(req.session.userRole, "admin.litters")) {
      results.litters = await prisma.litter.findMany({
        where: {
          ...userScope,
          OR: [
            { litterNumber: contains },
            { femaleName: contains },
            { maleName: contains },
          ],
        },
        orderBy: [{ litterBirthDate: "desc" }, { id: "desc" }],
        take: 10,
        select: { id: true, litterNumber: true, femaleName: true, maleName: true, litterBirthDate: true },
      });
    }

    if (userCan(req.session.userRole, "admin.crm")) {
      results.clients = await prisma.revenueClient.findMany({
        where: {
          ...userScope,
          deletedAt: null,
          OR: [
            { fullName: contains },
            { document: contains },
            { email: contains },
            { phone: contains },
          ],
        },
        orderBy: { fullName: "asc" },
        take: 12,
        select: { id: true, fullName: true, document: true, city: true, state: true },
      });
    }

    if (userCan(req.session.userRole, "admin.sales")) {
      results.sales = await prisma.revenueEntry.findMany({
        where: {
          ...userScope,
          OR: [
            { kittenLabel: contains },
            { invoiceNumber: contains },
            { client: { fullName: contains } },
          ],
        },
        include: { client: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
    }
  }

  res.render("search/index", {
    user: req.user,
    currentPath: "/buscar",
    searchQuery: query,
    results,
  });
});

app.get("/meus-dados", requireAuth, async (req, res) => {
  try {
    // Bloqueia ADMIN (ADMIN não usa essa tela)
    if (isAdminRole(req.session.userRole)) {
      return res.redirect("/dashboard");
    }

    const user = req.user;

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
    if (isAdminRole(req.session.userRole)) {
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
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).send("Informe um e-mail válido.");
    }

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
        email: normalizedEmail,
      },
    });

    res.redirect("/meus-dados");
  } catch (err) {
    console.error("Erro ao salvar Meus Dados:", err);
    if (err.code === "P2002") {
      return res.status(400).send("Este e-mail já está sendo usado por outro usuário.");
    }
    res.status(500).send("Erro ao salvar dados");
  }
});


// ---------- SERVIÇOS (USUÁRIO LOGADO) ----------
app.get("/services", requireAuth, requirePermission("services.portal"), async (req, res) => {
  try {
    const user = req.user;

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
app.get("/my-services", requireAuth, requirePermission("services.my"), async (req, res) => {
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

app.get("/services/autorizacao-registro-ninhada", requireAuth, requirePermission("services.downloads"), async (req, res) => {
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

app.get("/services/autorizacao-transferencia-propriedade", requireAuth, requirePermission("services.downloads"), async (req, res) => {
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
const littersRouter = require("./modules/litters")(
  prisma,
  requireAuth,
  requirePermission
);
const usersRouter = require("./modules/users")(
  prisma,
  requireAuth,
  requirePermission
);
const transfersRouter = require("./modules/transfers")(
  prisma,
  requireAuth,
  requirePermission
);

app.use(catsRouter);
app.use(littersRouter);
app.use(usersRouter);
app.use(transfersRouter);

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// MÓDULO: HOMOLOGAÇÃO DE TÍTULOS
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
app.use(titleHomologation(prisma, requireAuth, requirePermission));


// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// MÓDULO: HOMOLOGAÇÃO DE PEDIGREE
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
app.use(pedigreeHomologation(prisma, requireAuth, requirePermission));

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// DOWNLOAD: ATESTADO DE SAÚDE PARA REPRODUÇÃO
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
app.use(atestadoSaude(requireAuth, requireAdmin, requirePermission));

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
//  MÓDULO: REGISTRO DE GATIL
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
app.use(catteryRegistration(prisma, requireAuth, requirePermission));


// ---------- ROTAS DO MÓDULO SERVIÇOS FFB (somente ADMIN) ----------
const ffbServicesRouter = require("./modules/ffbServices")(
  prisma,
  requireAuth,
  requirePermission("admin.ffb")
);
app.use(ffbServicesRouter);


// ---------- MÓDULO: SEGUNDA VIA E ALTERAÇÕES ----------
const secondCopyRouter = require("./modules/secondCopy")(
  prisma,
  requireAuth,
  requirePermission
);
app.use(secondCopyRouter);

const settingsRouter = settingsRouterFactory(
  prisma,
  requireAuth,
  requirePermission
);
app.use(settingsRouter);

const breedersRouter = breedersRouterFactory(
  prisma,
  requireAuth,
  requirePermission
);
app.use(breedersRouter);

const littersAdminRouter = littersAdminRouterFactory(
  prisma,
  requireAuth,
  requirePermission
);
app.use(littersAdminRouter);

const kittensAdminRouter = kittensAdminRouterFactory(
  prisma,
  requireAuth,
  requirePermission
);
app.use(kittensAdminRouter);

const matingsAdminRouter = matingsAdminRouterFactory(
  prisma,
  requireAuth,
  requirePermission
);
app.use(matingsAdminRouter);

const vaccinationsAdminRouter = vaccinationsAdminRouterFactory(
  prisma,
  requireAuth,
  requirePermission
);
app.use(vaccinationsAdminRouter);

const dewormingAdminRouter = dewormingAdminRouterFactory(
  prisma,
  requireAuth,
  requirePermission
);
app.use(dewormingAdminRouter);

const weighingAdminRouter = weighingAdminRouterFactory(
  prisma,
  requireAuth,
  requirePermission
);
app.use(weighingAdminRouter);

const examsAdminRouter = examsAdminRouterFactory(
  prisma,
  requireAuth,
  requirePermission
);
app.use(examsAdminRouter);

const historyAdminRouter = historyAdminRouterFactory(
  prisma,
  requireAuth,
  requirePermission
);
app.use(historyAdminRouter);

const academyRouter = academyRouterFactory(prisma);
app.use(academyRouter);

const EXPENSE_OPTION_TYPES = ["CATEGORY", "SUPPLIER", "PAYMENT"];
const EXPENSE_OPTION_LABELS = {
  CATEGORY: "Categoria",
  SUPPLIER: "Fornecedor",
  PAYMENT: "Conta de Pagamento",
};
const EXPENSE_OPTION_FIELDS = {
  CATEGORY: "category",
  SUPPLIER: "supplier",
  PAYMENT: "paymentMethod",
};
function normalizeExpenseOptionType(value) {
  return EXPENSE_OPTION_TYPES.includes(value) ? value : "CATEGORY";
}

function expenseOptionFieldSql(type) {
  return Prisma.raw(`"${EXPENSE_OPTION_FIELDS[type] || "category"}"`);
}

async function listExpenseOptions(type) {
  return prisma.$queryRaw`
    SELECT "id", "type", "name"
    FROM "QuickLaunchOption"
    WHERE "type" = ${type}
      AND "ownerId" IS NULL
    ORDER BY "name" ASC
  `;
}

async function findExpenseOptionById(id) {
  const rows = await prisma.$queryRaw`
    SELECT "id", "type", "name"
    FROM "QuickLaunchOption"
    WHERE "id" = ${id}
      AND "ownerId" IS NULL
    LIMIT 1
  `;
  return rows[0] || null;
}

async function findExpenseOptionByName(type, name, excludeId = null) {
  const exclude = excludeId ? Prisma.sql`AND "id" <> ${excludeId}` : Prisma.empty;
  const rows = await prisma.$queryRaw`
    SELECT "id", "type", "name"
    FROM "QuickLaunchOption"
    WHERE "type" = ${type}
      AND "ownerId" IS NULL
      AND "name" = ${name}
      ${exclude}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function getExpenseOptionUsage(option) {
  const field = expenseOptionFieldSql(option.type);
  const expenseRows = await prisma.$queryRaw`
    SELECT COUNT(*)::integer AS "count"
    FROM "QuickLaunchEntry"
    WHERE ${field} = ${option.name}
  `;
  const expenseCount = Number(expenseRows[0]?.count || 0);

  if (option.type !== "PAYMENT") return expenseCount;

  const revenueRows = await prisma.$queryRaw`
    SELECT COUNT(*)::integer AS "count"
    FROM "RevenueEntry"
    WHERE "paymentAccount" = ${option.name}
  `;
  return expenseCount + Number(revenueRows[0]?.count || 0);
}

async function renderExpenseOptionsDirect(req, res, extra = {}) {
  const selectedType = normalizeExpenseOptionType(req.query.type || req.body?.type);

  const options = Array.isArray(extra.options)
    ? extra.options
    : await listExpenseOptions(selectedType);
  const rows = [];

  for (const option of options) {
    rows.push({
      ...option,
      usageCount: await getExpenseOptionUsage(option),
    });
  }

  const typeOptionsHtml = EXPENSE_OPTION_TYPES.map(
    (type) =>
      `<option value="${type}" ${selectedType === type ? "selected" : ""}>${EXPENSE_OPTION_LABELS[type]}</option>`
  ).join("");
  const rowsHtml = rows.map((option) => `
    <div class="quick-option-row">
      <form method="post" action="${option.id ? `/despesas/opcoes/${option.id}/update` : "#"}">
        <input name="name" value="${escapeHtml(option.name)}" required />
        <div class="quick-option-usage">${
          option.usageCount === null || option.usageCount === undefined
            ? "sem uso"
            : `${option.usageCount} uso${option.usageCount === 1 ? "" : "s"}`
        }</div>
        <button type="submit" class="btn small-button" title="Salvar">✓</button>
      </form>
      <form method="post" action="${option.id ? `/despesas/opcoes/${option.id}/delete` : "#"}" onsubmit="return confirm('Excluir esta opção?');">
        <button
          type="submit"
          class="btn small-button danger-button"
          title="${option.usageCount > 0 ? "Não é possível excluir opção em uso" : "Excluir"}"
          ${option.usageCount > 0 ? "disabled" : ""}
        >🗑</button>
      </form>
    </div>
  `).join("");

  res.status(extra.status || 200).send(`<!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Opções Financeiras</title>
        <link rel="stylesheet" href="/css/theme.css" />
        <link rel="stylesheet" href="/css/quick-finance.css" />
      </head>
      <body>
        <main class="quick-shell">
          <header class="quick-header">
            <h1 class="quick-title">Opções Financeiras</h1>
          </header>
          <form class="quick-card" method="post" action="/despesas/opcoes">
            ${extra.success ? '<div class="message message-success">Opção salva.</div>' : ""}
            ${extra.error ? `<div class="message message-error">${escapeHtml(extra.error)}</div>` : ""}
            <div class="field">
              <label for="type">Tipo</label>
              <select id="type" name="type" required>
                ${typeOptionsHtml}
              </select>
            </div>
            <div class="field">
              <label for="name">Nova opção</label>
              <input id="name" name="name" required />
            </div>
            <button type="submit" class="btn">Salvar opção</button>
          </form>
          <div class="quick-card" style="margin-top:12px;">
            <div class="quick-option-heading">Editar ${EXPENSE_OPTION_LABELS[selectedType].toLowerCase()}</div>
            ${rowsHtml || '<div class="empty">Nenhuma opção cadastrada.</div>'}
          </div>
          <a class="back-link" href="/despesas">Voltar</a>
        </main>
        <script>
          document.getElementById("type")?.addEventListener("change", function () {
            window.location.href = "/despesas/opcoes?type=" + encodeURIComponent(this.value);
          });
        </script>
      </body>
    </html>`);
}

app.post("/despesas/opcoes", async (req, res) => {
  const type = normalizeExpenseOptionType(req.body.type);
  const name = String(req.body.name || "").trim();

  try {
    if (!name) {
      return renderExpenseOptionsDirect(req, res, {
        status: 400,
        error: "Informe o nome da opção.",
      });
    }

    const existing = await findExpenseOptionByName(type, name);

    if (existing) {
      return renderExpenseOptionsDirect(req, res, {
        status: 400,
        error: "Esta opção já existe para o tipo selecionado.",
      });
    }

    await prisma.$executeRaw`
      INSERT INTO "QuickLaunchOption" ("type", "ownerId", "name")
      VALUES (${type}, NULL, ${name})
    `;
    res.redirect(`/despesas/opcoes?type=${type}&ok=1`);
  } catch (err) {
    console.error("Erro ao salvar opção de despesa:", err);
    res.status(500).send("Erro ao salvar opção de despesa.");
  }
});

app.post("/despesas/opcoes/:id/update", async (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body.name || "").trim();

  try {
    const option = await findExpenseOptionById(id);

    if (!option || !EXPENSE_OPTION_TYPES.includes(option.type)) {
      return res.status(404).send("Opção não encontrada.");
    }

    const duplicate = await findExpenseOptionByName(option.type, name, id);

    if (duplicate) {
      return renderExpenseOptionsDirect(req, res, {
        status: 400,
        error: "Já existe uma opção com este nome.",
      });
    }

    const field = expenseOptionFieldSql(option.type);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "QuickLaunchOption"
        SET "name" = ${name}
        WHERE "id" = ${id}
          AND "ownerId" IS NULL
      `;
        await tx.$executeRaw`
          UPDATE "QuickLaunchEntry"
          SET ${field} = ${name}
          WHERE ${field} = ${option.name}
        `;
        if (option.type === "PAYMENT") {
          await tx.$executeRaw`
            UPDATE "RevenueEntry"
            SET "paymentAccount" = ${name}
            WHERE "paymentAccount" = ${option.name}
          `;
        }
      });
    res.redirect(`/despesas/opcoes?type=${option.type}&ok=1`);
  } catch (err) {
    console.error("Erro ao atualizar opção de despesa:", err);
    res.status(500).send("Erro ao atualizar opção de despesa.");
  }
});

app.post("/despesas/opcoes/:id/delete", async (req, res) => {
  const id = Number(req.params.id);

  try {
    const option = await findExpenseOptionById(id);

    if (!option || !EXPENSE_OPTION_TYPES.includes(option.type)) {
      return res.status(404).send("Opção não encontrada.");
    }

    const usageCount = await getExpenseOptionUsage(option);
    if (usageCount > 0) {
      return renderExpenseOptionsDirect(req, res, {
        status: 400,
        error: "Esta opção já está sendo usada em despesas cadastradas e não pode ser excluída.",
      });
    }

    await prisma.$executeRaw`
      DELETE FROM "QuickLaunchOption"
      WHERE "id" = ${id}
        AND "ownerId" IS NULL
    `;
    res.redirect(`/despesas/opcoes?type=${option.type}&ok=1`);
  } catch (err) {
    console.error("Erro ao excluir opção de despesa:", err);
    res.status(500).send("Erro ao excluir opção de despesa.");
  }
});

const quickLaunchRouter = quickLaunchRouterFactory(prisma);
app.use(quickLaunchRouter);

const revenuesRouter = revenuesRouterFactory(prisma);
app.use(revenuesRouter);

const crmRouter = crmRouterFactory(prisma, requireAuth, requirePermission);
app.use(crmRouter);

const administrativeRouter = administrativeRouterFactory(
  prisma,
  requireAuth,
  requirePermission
);
app.use(administrativeRouter);

const reportsRouter = reportsRouterFactory(
  prisma,
  requireAuth,
  requirePermission
);
app.use(reportsRouter);







// =====================================================
// BUNDLE DE SERVIÇO FFB (PDF + Anexos) → ADMIN
// =====================================================
app.get("/ffb-services/:id/bundle", requireAuth, requirePermission("admin.ffb"), async (req, res) => {
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

if (!canViewAllData(req.session?.userRole) && serviceWithStatus.userId !== req.session.userId) {
  return res.status(403).send("Você não tem acesso a este serviço.");
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

  console.log("BUNDLE LITTER DEBUG:", {
  litterId: litter?.id,
  maleMicrochip: litter?.maleMicrochip,
  femaleMicrochip: litter?.femaleMicrochip,
  sireFound: !!sire,
  damFound: !!dam,
  sirePedigreeFile: sire?.pedigreeFile,
  sireReproFile: sire?.reproductionFile,
  damPedigreeFile: dam?.pedigreeFile,
  damReproFile: dam?.reproductionFile,
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

  const UPLOADS_ROOT =
    process.env.UPLOADS_DIR || path.join(__dirname, "public", "uploads");

  // remove "/uploads/" e resolve caminho real
  const relativePath = cert.file.replace(/^\/uploads\/+/, "");
  const abs = path.join(UPLOADS_ROOT, relativePath);

  if (fs.existsSync(abs)) {
    archive.file(abs, {
      name: `CERTIFICADO-${index + 1}-${path.basename(abs)}`,
    });
  } else {
    console.warn("⚠️ Certificado não encontrado:", abs);
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
  const UPLOADS_ROOT =
    process.env.UPLOADS_DIR || path.join(__dirname, "public", "uploads");

  // remove "/uploads/" do início e resolve caminho real no disco
  const relativePath = transfer.authorizationFile.replace(/^\/uploads\/+/, "");
  const authPath = path.join(UPLOADS_ROOT, relativePath);

  if (fs.existsSync(authPath)) {
    archive.file(authPath, {
      name: `AUTORIZACAO_TRANSFERENCIA${path.extname(authPath)}`,
    });
  } else {
    console.warn("⚠️ Arquivo de autorização não encontrado:", authPath);
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
} catch {
  attachments = [];
}

console.log("SECOND COPY ATTACHMENTS DEBUG:", {
  serviceId: serviceWithStatus.id,
  raw: sc.attachmentsJson,
  parsed: attachments,
});

attachments.forEach((item, index) => {
  if (!item) return;

  let filePath = null;

  if (typeof item === "string") {
    filePath = item;
  } else if (typeof item === "object") {
    filePath =
      item.file ||
      item.path ||
      item.url ||
      item.location ||
      null;
  }

  if (!filePath) {
    console.warn("⚠️ Anexo da Segunda Via sem caminho válido:", item);
    return;
  }

  const cleanPath = String(filePath).replace(/^\/+/, "");
  const relativePath = cleanPath.replace(/^uploads\/+/, "");

  const possiblePaths = [
    process.env.UPLOADS_DIR
      ? path.join(process.env.UPLOADS_DIR, relativePath)
      : null,
    process.env.UPLOADS_DIR
      ? path.join(process.env.UPLOADS_DIR.replace(/\/uploads\/?$/, ""), relativePath)
      : null,
    process.env.UPLOADS_DIR
      ? path.join(process.env.UPLOADS_DIR.replace(/\/uploads\/?$/, ""), "uploads", relativePath)
      : null,
    path.join(__dirname, "public", "uploads", relativePath),
    path.join(__dirname, "public", relativePath),
  ].filter(Boolean);

  console.log("SECOND COPY PATHS TEST:", possiblePaths);

  possiblePaths.forEach((p) => {
  try {
    console.log("PATH CHECK:", p, fs.existsSync(p));
  } catch (e) {
    console.log("PATH CHECK ERROR:", p, e.message);
  }
});

  const existingPath = possiblePaths.find((p) => fs.existsSync(p));

  if (existingPath) {
    archive.file(existingPath, {
      name: `ANEXO-${index + 1}-${path.basename(existingPath)}`,
    });
    console.log("✅ Anexo adicionado ao ZIP:", existingPath);
  } else {
    console.warn("⚠️ Anexo da Segunda Via não encontrado:", {
      original: filePath,
      tried: possiblePaths,
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
