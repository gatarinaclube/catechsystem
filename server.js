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
  getRoleLabel,
  isAdminRole,
  canViewAllData,
  buildAccessContext,
  userCan,
} = require("./utils/access");
const {
  getCreationLimits,
  getFileUploadLimit,
  loadPlanLimitOverrides,
} = require("./utils/planLimits");
const {
  parseDate,
  addDays,
  addMonths,
  addYears,
  buildDisplayName,
  classifyOperationalCat,
} = require("./utils/cattery-admin");
const { sendStatusEmail } = require("./utils/mailer");
const { buildVaccineDueItems } = require("./utils/vaccines");
const {
  createAnnualPlanPayment,
  createPlanSubscription,
  formatAnnualPlanPrice,
  formatPlanPrice,
  getSubscriptionPaymentUrl,
  isAsaasConfigured,
  planFromExternalReference,
  verifyWebhookToken,
} = require("./utils/asaas");
const {
  notifyNewUser,
  notifyUserRegistrationConfirmation,
} = require("./utils/adminNotifications");
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
const treatmentsAdminRouterFactory = require("./modules/treatments-admin");
const quickLaunchRouterFactory = require("./modules/quick-launch");
const reportsRouterFactory = require("./modules/reports");
const revenuesRouterFactory = require("./modules/revenues");
const crmRouterFactory = require("./modules/crm");
const tacticalPanelRouterFactory = require("./modules/tactical-panel");
const administrativeRouterFactory = require("./modules/administrative");
const academyRouterFactory = require("./modules/academy");
const kittenShowcaseRouterFactory = require("./modules/kitten-showcase");
const documentsRouterFactory = require("./modules/documents");
const gatarinaShowPhotosRouterFactory = require("./modules/gatarina-show-photos");
const { startVaccineReminderScheduler } = require("./utils/vaccineReminderJob");
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

function findUploadedFile(filePath) {
  if (!filePath) return null;

  let relativePath = String(filePath).replace(/\\/g, "/").trim();
  const uploadsIndex = relativePath.indexOf("/uploads/");

  if (uploadsIndex >= 0) {
    relativePath = relativePath.slice(uploadsIndex + "/uploads/".length);
  }

  relativePath = relativePath.replace(/^\/+/, "").replace(/^uploads\/+/, "");

  const possiblePaths = [
    path.isAbsolute(filePath) ? filePath : null,
    path.join(process.env.UPLOADS_DIR || path.join(__dirname, "public", "uploads"), relativePath),
    path.join(__dirname, "public", "uploads", relativePath),
    path.join(__dirname, "public", relativePath),
  ].filter(Boolean);

  return possiblePaths.find((candidate) => fs.existsSync(candidate)) || null;
}

function addUploadedFileToArchive(archive, label, filePath) {
  const existingPath = findUploadedFile(filePath);

  if (existingPath) {
    archive.file(existingPath, {
      name: `${label}-${path.basename(existingPath)}`,
    });
  } else {
    console.warn("Arquivo não encontrado para ZIP:", { label, filePath });
  }
}

function buildProfileAccessGroups(role) {
  const groups = [
    {
      title: "Operacional",
      modules: [
        { label: "Vitrine de Filhotes", permission: "showcase.manage" },
        { label: "Reprodutores", permission: "admin.breeders" },
        { label: "Ninhadas", permission: "admin.litters" },
        { label: "Filhotes", permission: "admin.kittens" },
        { label: "Acasalamentos", permission: "admin.matings" },
        { label: "Vacinação", permission: "admin.vaccinations" },
        { label: "Vermifugação", permission: "admin.deworming" },
        { label: "Pesagem", permission: "admin.weighing" },
        { label: "Exames", permission: "admin.exams" },
        { label: "Histórico", permission: "admin.history" },
      ],
    },
    {
      title: "Tático",
      modules: [
        { label: "CRM", permission: "admin.crm" },
        { label: "Painel", permission: "admin.tacticalPanel" },
      ],
    },
    {
      title: "Estratégico",
      modules: [
        { label: "Relatórios", permission: "admin.reports" },
        { label: "Administrativo", permission: "admin.administrative" },
      ],
    },
    {
      title: "Academy",
      modules: [
        { label: "CatBreeder Pro", permission: "academy.access" },
      ],
    },
  ];

  return groups.map((group) => ({
    ...group,
    modules: group.modules.map((module) => ({
      ...module,
      allowed: userCan(role, module.permission),
    })),
  }));
}

function buildProfilePlanCards(currentRole) {
  const normalizedCurrentRole = normalizeRole(currentRole);
  const comparisonRoles = [ROLES.ASSOCIADO_PREMIUM, ROLES.ASSOCIADO_A, ROLES.ASSOCIADO_B].includes(normalizedCurrentRole)
    ? [ROLES.ASSOCIADO_B, ROLES.ASSOCIADO_A, ROLES.ASSOCIADO_PREMIUM]
    : [ROLES.BASIC, ROLES.MASTER, ROLES.PREMIUM];

  return comparisonRoles.map((role) => {
    const limits = getCreationLimits(role);
    const uploadLimit = getFileUploadLimit(role);
    const limitLabel = (value) => (value === null ? "Ilimitado" : value);
    const showcaseLitterLabel = limits.showcaseLitters === null
      ? "Ilimitado"
      : `${limits.showcaseLitters} ninhada${limits.showcaseLitters === 1 ? "" : "s"} por vez`;
    const showcaseLitterNote = limits.showcaseLitters === 1
      ? "Para incluir uma nova ninhada, exclua a ninhada atual da vitrine."
      : null;

    return {
      role,
      title: getRoleLabel(role),
      isCurrent: normalizedCurrentRole === role,
      accessGroups: buildProfileAccessGroups(role),
      items: [
        { label: "Padreadores", value: limitLabel(limits.breeders) },
        { label: "Tamanho por arquivo", value: uploadLimit.label },
        { label: "Ninhadas por ano", value: limitLabel(limits.littersPerYear) },
        { label: "Filhotes por ano", value: limitLabel(limits.kittensPerYear) },
        { label: "Vitrine de filhotes", value: showcaseLitterLabel, note: showcaseLitterNote },
        { label: "Comparativos de evolução", value: limitLabel(limits.showcaseEvolutionComparisons) },
      ],
    };
  });
}


// ---------- MIDDLEWARES BÁSICOS ----------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// arquivos estáticos (CSS, JS, imagens, uploads etc.)
app.use(express.static(path.join(__dirname, "public")));
app.get("/favicon.ico", (req, res) => {
  res.type("image/png").sendFile(path.join(__dirname, "public", "logos", "catech-icon.png"));
});

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
    const role = req.user?.role || req.session?.userRole;
    if (!userCan(role, permission)) {
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

async function ensureExpensePublicToken(user) {
  if (user.expensePublicToken) return user.expensePublicToken;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = crypto.randomBytes(24).toString("hex");

    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { expensePublicToken: token },
      });
      return token;
    } catch (err) {
      if (err.code !== "P2002") throw err;
    }
  }

  throw new Error("Não foi possível gerar o link público de despesas.");
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

const COMMERCIAL_PLANS = {
  basic: {
    key: "BASIC",
    slug: "basic",
    title: "Básico",
    price: "Plano de entrada",
    role: ROLES.BASIC,
    summary: "Para iniciar a organização do gatil com vitrine e controles essenciais.",
    features: ["1 ninhada publicada na vitrine", "Controles operacionais essenciais", "Cadastro e histórico dos gatos"],
  },
  master: {
    key: "MASTER",
    slug: "master",
    title: "Master",
    price: "Plano intermediário",
    role: ROLES.MASTER,
    summary: "Para criadores que precisam de gestão financeira, CRM e mais capacidade.",
    features: ["3 ninhadas publicadas na vitrine", "CRM e administrativo", "Relatórios e painel tático"],
  },
  premium: {
    key: "PREMIUM",
    slug: "premium",
    title: "Premium",
    price: "Teste grátis por 7 dias",
    role: ROLES.PREMIUM,
    summary: "Acesso completo para experimentar todos os recursos de gestão.",
    features: ["Vitrine e comparativos sem limite", "Todos os módulos liberados", "Melhor opção para testar o sistema completo"],
  },
};

function commercialPlanList() {
  return [COMMERCIAL_PLANS.basic, COMMERCIAL_PLANS.master, COMMERCIAL_PLANS.premium].map((plan) => ({
    ...plan,
    price: plan.slug === "premium"
      ? `${formatPlanPrice(plan.key)} após 7 dias grátis`
      : formatPlanPrice(plan.key),
    paymentConfigured: isAsaasConfigured(),
  }));
}

function billingOptionsForPlan(plan) {
  return [
    {
      mode: "MONTHLY",
      title: "Mensal",
      subtitle: `${formatPlanPrice(plan.key)} por mês`,
      detail: "Cobrança recorrente mensal.",
    },
    {
      mode: "ANNUAL_CARD",
      title: "Anual no cartão",
      subtitle: `${formatAnnualPlanPrice(plan.key, "ANNUAL_CARD")} em até 12x`,
      detail: "Cobrança anual parcelada no cartão de crédito.",
    },
    {
      mode: "ANNUAL_PIX",
      title: "Anual no PIX",
      subtitle: `${formatAnnualPlanPrice(plan.key, "ANNUAL_PIX")} à vista`,
      detail: "Pagamento anual à vista com 10% de desconto.",
    },
  ];
}

function normalizeBillingMode(value) {
  const mode = String(value || "").toUpperCase();
  return ["MONTHLY", "ANNUAL_CARD", "ANNUAL_PIX"].includes(mode) ? mode : "MONTHLY";
}

function resolveCommercialPlan(slug) {
  return COMMERCIAL_PLANS[String(slug || "").trim().toLowerCase()] || COMMERCIAL_PLANS.premium;
}

function addDaysDate(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function loginViewOptions(kind, extra = {}) {
  const isGatarina = kind === "gatarina";
  return {
    error: null,
    title: isGatarina ? "Login Gatarina" : "Login CaTech System",
    subtitle: isGatarina
      ? "Acesso para associados ativos da Associação Catarinense de Felinos"
      : "Acesso para usuários dos planos Básico, Master e Premium",
    formAction: isGatarina ? "/login-gatarina" : "/login",
    showRegisterLink: isGatarina,
    registerText: "Ainda não é associado?",
    registerHref: "/register",
    registerLabel: "Solicitar associação",
    alternateLoginHref: isGatarina ? "/login" : "/login-gatarina",
    alternateLoginLabel: isGatarina ? "Login para planos não associados" : "Login para associados Gatarina",
    ...extra,
  };
}

function isExpiredCommercialTrial(user) {
  if (!user || user.accountOrigin !== "NON_ASSOCIATE") return false;
  if (["ACTIVE", "TRIALING"].includes(String(user.subscriptionStatus || "").toUpperCase()) === false) return false;
  if (String(user.subscriptionStatus || "").toUpperCase() === "ACTIVE") return false;
  return user.trialEndsAt && new Date(user.trialEndsAt) < new Date();
}

async function configureAsaasBillingForUser(user, plan, billingMode = "MONTHLY", status = "PENDING") {
  if (!isAsaasConfigured()) return null;

  const mode = normalizeBillingMode(billingMode);
  const billing = mode === "MONTHLY"
    ? await createPlanSubscription(user, plan)
    : await createAnnualPlanPayment(user, plan, mode);

  const data = {
    accountOrigin: "NON_ASSOCIATE",
    selectedPlan: plan.key,
    subscriptionStatus: status,
    asaasCustomerId: billing.customerId,
    asaasSubscriptionId: billing.subscription?.id || null,
    asaasPaymentId: billing.firstPayment?.id || billing.payment?.id || null,
    asaasPaymentUrl: billing.paymentUrl || null,
    asaasLastEvent: `BILLING_${mode}`,
  };

  await prisma.user.update({ where: { id: user.id }, data });
  return { ...billing, mode };
}

async function configureAsaasPurchaseForExistingUser(user, plan, billingMode = "MONTHLY") {
  return configureAsaasBillingForUser({ ...user, trialEndsAt: null }, plan, billingMode, "PENDING");
}

async function handleSystemLogin(req, res, loginKind) {
  const email = String(req.body.email || "").trim().toLowerCase();
  const { password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.render("login", loginViewOptions(loginKind, { error: "Usuário ou senha inválidos" }));
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.render("login", loginViewOptions(loginKind, { error: "Usuário ou senha inválidos" }));
    }

    if (isExpiredCommercialTrial(user)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { approvalStatus: "RESTRICOES", subscriptionStatus: "EXPIRED" },
      });

      return res.render("login", loginViewOptions(loginKind, {
        error: "Seu teste gratuito de 7 dias venceu. Escolha um plano ou entre em contato para reativar o acesso.",
      }));
    }

    // Bloqueia login se não estiver DEFERIDO
    if (user.approvalStatus && user.approvalStatus !== "DEFERIDO") {
      return res.render("login", loginViewOptions(loginKind, {
        error:
          "Seu cadastro ainda não foi aprovado ou está com restrições, entre em contato com o Administrador.",
      }));
    }

    req.session.userId = user.id;
    req.session.userRole = normalizeRole(user.role);

    return res.redirect("/dashboard");
  } catch (err) {
    console.error("Erro no login:", err);
    return res.status(500).send("Erro no login");
  }
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
      include: {
        academyEnrollments: { include: { plan: true }, take: 1 },
        academySubscriptions: { include: { plan: true }, orderBy: { updatedAt: "desc" }, take: 1 },
      },
    });

    if (!currentUser) {
      req.session.destroy(() => {});
      return next();
    }

    const normalizedRole = normalizeRole(currentUser.role || sessionRole);
    const userAccess = buildAccessContext(normalizedRole);
    req.session.userRole = normalizedRole;

    req.user = {
      ...currentUser,
      role: normalizedRole,
      roleLabel: userAccess.roleLabel,
    };

    req.session.user = req.user;
    res.locals.user = req.user;
    res.locals.access = userAccess;

    next();
  } catch (err) {
    next(err);
  }
});

// ---------- ROTAS BÁSICAS ----------
app.get("/", (req, res) => {
  res.render("public-home", {
    user: req.user,
    plans: commercialPlanList(),
    contactStatus: req.query.contato || null,
  });
});

function escapePublicContactValue(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function billingDocumentDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

app.post("/contato", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim();
  const phone = String(req.body.phone || "").trim();

  if (!name || !email || !phone) {
    return res.redirect("/?contato=erro#contato");
  }

  try {
    await sendStatusEmail({
      to: "contato@gatarina.com.br",
      subject: "Novo contato pelo site CaTech System",
      html: `
        <div style="font-family:Arial,sans-serif;color:#1f2933;line-height:1.6">
          <h2>Novo pedido de informações</h2>
          <p>Uma pessoa preencheu o formulário de contato da página pública do CaTech System.</p>
          <p><strong>Nome:</strong> ${escapePublicContactValue(name)}</p>
          <p><strong>E-mail:</strong> ${escapePublicContactValue(email)}</p>
          <p><strong>Telefone:</strong> ${escapePublicContactValue(phone)}</p>
        </div>
      `,
    });

    return res.redirect("/?contato=ok#contato");
  } catch (err) {
    console.error("Erro ao enviar contato público:", err);
    return res.redirect("/?contato=erro#contato");
  }
});

app.use(kittenShowcaseRouterFactory.publicRouter(prisma));

// ---------- LOGIN ----------
app.get("/login", (req, res) => {
  res.render("login", loginViewOptions("commercial"));
});

app.get("/login-gatarina", (req, res) => {
  res.render("login", loginViewOptions("gatarina"));
});

app.post("/login", async (req, res) => {
  return handleSystemLogin(req, res, "commercial");
});

app.post("/login-gatarina", async (req, res) => {
  return handleSystemLogin(req, res, "gatarina");
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

const createdUser = await prisma.user.create({
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

await notifyNewUser(prisma, createdUser);
await notifyUserRegistrationConfirmation(createdUser);

    return res.redirect("/login-gatarina");
  } catch (err) {
    console.error("Erro no cadastro:", err);
    return res.status(500).send("Erro no cadastro");
  }
});

app.get("/planos/:plan/cadastro", (req, res) => {
  const plan = resolveCommercialPlan(req.params.plan);
  res.render("commercial-register", {
    error: null,
    plan,
    plans: commercialPlanList(),
    billingOptions: billingOptionsForPlan(plan),
  });
});

app.post("/planos/:plan/cadastro", async (req, res) => {
  const plan = resolveCommercialPlan(req.params.plan);
  const {
    name,
    email,
    phones,
    cpf,
    password,
    confirmPassword,
  } = req.body;
  const normalizedEmail = String(email || "").trim().toLowerCase();

  try {
    if (!name || !normalizedEmail || !cpf || !password || !confirmPassword) {
      return res.render("commercial-register", {
        error: "Preencha nome, e-mail, CPF/CNPJ e senha para iniciar o teste.",
        plan,
        plans: commercialPlanList(),
        billingOptions: billingOptionsForPlan(plan),
      });
    }

    if (![11, 14].includes(billingDocumentDigits(cpf).length)) {
      return res.render("commercial-register", {
        error: "Informe um CPF ou CNPJ válido para gerar a cobrança.",
        plan,
        plans: commercialPlanList(),
        billingOptions: billingOptionsForPlan(plan),
      });
    }

    if (password !== confirmPassword) {
      return res.render("commercial-register", {
        error: "As senhas não conferem.",
        plan,
        plans: commercialPlanList(),
        billingOptions: billingOptionsForPlan(plan),
      });
    }

    if (String(password).length < 6) {
      return res.render("commercial-register", {
        error: "Informe uma senha com pelo menos 6 caracteres.",
        plan,
        plans: commercialPlanList(),
        billingOptions: billingOptionsForPlan(plan),
      });
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.render("commercial-register", {
        error: "E-mail já cadastrado. Se este cadastro é seu, use a opção abaixo para contratar o plano sem novo teste gratuito.",
        plan,
        plans: commercialPlanList(),
        billingOptions: billingOptionsForPlan(plan),
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const trialEndsAt = addDaysDate(new Date(), 7);

    const createdUser = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        phones,
        cpf,
        password: passwordHash,
        role: ROLES.PREMIUM,
        approvalStatus: "DEFERIDO",
        accountOrigin: "NON_ASSOCIATE",
        selectedPlan: plan.key,
        subscriptionStatus: "TRIALING",
        trialEndsAt,
      },
    });

    req.session.userId = createdUser.id;
    req.session.userRole = normalizeRole(createdUser.role);

    return res.redirect("/dashboard");
  } catch (err) {
    console.error("Erro no cadastro comercial:", err);
    return res.status(500).render("commercial-register", {
      error: "Não foi possível iniciar o teste agora.",
      plan,
      plans: commercialPlanList(),
      billingOptions: billingOptionsForPlan(plan),
    });
  }
});

app.post("/planos/:plan/comprar", async (req, res) => {
  const plan = resolveCommercialPlan(req.params.plan);
  const email = String(req.body.existingEmail || "").trim().toLowerCase();
  const password = String(req.body.existingPassword || "");
  const existingCpf = String(req.body.existingCpf || "").trim();
  const existingPhones = String(req.body.existingPhones || "").trim();
  const billingMode = normalizeBillingMode(req.body.billingMode);

  try {
    if (!email || !password) {
      return res.render("commercial-register", {
        error: "Informe e-mail e senha do cadastro existente para contratar o plano.",
        plan,
        plans: commercialPlanList(),
        billingOptions: billingOptionsForPlan(plan),
      });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.render("commercial-register", {
        error: "Cadastro não encontrado. Para novo cadastro, use o formulário de teste gratuito.",
        plan,
        plans: commercialPlanList(),
        billingOptions: billingOptionsForPlan(plan),
      });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.render("commercial-register", {
        error: "Senha inválida para este cadastro.",
        plan,
        plans: commercialPlanList(),
        billingOptions: billingOptionsForPlan(plan),
      });
    }

    const cpfForBilling = user.cpf || existingCpf;
    if (![11, 14].includes(billingDocumentDigits(cpfForBilling).length)) {
      return res.render("commercial-register", {
        error: "Informe o CPF ou CNPJ para contratar o plano.",
        plan,
        plans: commercialPlanList(),
        billingOptions: billingOptionsForPlan(plan),
      });
    }

    const userForBilling = await prisma.user.update({
      where: { id: user.id },
      data: {
        cpf: user.cpf || existingCpf,
        phones: user.phones || existingPhones || undefined,
      },
    });

    const billing = await configureAsaasPurchaseForExistingUser(userForBilling, plan, billingMode);
    if (billing?.paymentUrl) return res.redirect(billing.paymentUrl);

    return res.status(400).render("commercial-register", {
      error: "Não foi possível gerar o link de pagamento. Verifique se o Asaas e o valor do plano estão configurados.",
      plan,
      plans: commercialPlanList(),
      billingOptions: billingOptionsForPlan(plan),
    });
  } catch (err) {
    console.error("Erro ao contratar plano para cadastro existente:", err);
    return res.status(500).render("commercial-register", {
      error: "Não foi possível iniciar a contratação agora.",
      plan,
      plans: commercialPlanList(),
      billingOptions: billingOptionsForPlan(plan),
    });
  }
});

app.get("/billing/dados", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
  if (!user) return res.redirect("/login");

  return res.render("billing-customer-data", {
    error: null,
    user,
  });
});

app.post("/billing/dados", requireAuth, async (req, res) => {
  const cpf = String(req.body.cpf || "").trim();
  const phones = String(req.body.phones || "").trim();

  const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
  if (!user) return res.redirect("/login");

  if (![11, 14].includes(billingDocumentDigits(cpf).length)) {
    return res.render("billing-customer-data", {
      error: "Informe um CPF ou CNPJ válido para gerar a cobrança.",
      user: { ...user, cpf, phones },
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      cpf,
      phones: user.phones || phones || undefined,
    },
  });

  return res.redirect("/billing/pay");
});

app.get("/billing/pay", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
    });

    if (!user) return res.redirect("/login");
    if (user.asaasPaymentUrl) return res.redirect(user.asaasPaymentUrl);
    if (![11, 14].includes(billingDocumentDigits(user.cpf).length)) {
      return res.redirect("/billing/dados");
    }

    const plan = Object.values(COMMERCIAL_PLANS).find((item) => item.key === user.selectedPlan) || COMMERCIAL_PLANS.premium;
    return res.render("billing-plan-choice", {
      error: null,
      user,
      plan,
      billingOptions: billingOptionsForPlan(plan),
    });
  } catch (err) {
    console.error("Erro ao abrir pagamento:", err);
    return res.status(500).send("Erro ao abrir pagamento.");
  }
});

app.post("/billing/pay", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
    });

    if (!user) return res.redirect("/login");
    if (user.asaasPaymentUrl) return res.redirect(user.asaasPaymentUrl);
    if (![11, 14].includes(billingDocumentDigits(user.cpf).length)) {
      return res.redirect("/billing/dados");
    }

    const plan = Object.values(COMMERCIAL_PLANS).find((item) => item.key === user.selectedPlan) || COMMERCIAL_PLANS.premium;
    const billingMode = normalizeBillingMode(req.body.billingMode);

    if (user.asaasSubscriptionId && billingMode === "MONTHLY" && isAsaasConfigured()) {
      const existingPayment = await getSubscriptionPaymentUrl(user.asaasSubscriptionId);
      if (existingPayment?.paymentUrl) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            asaasPaymentId: existingPayment.firstPayment?.id || user.asaasPaymentId,
            asaasPaymentUrl: existingPayment.paymentUrl,
          },
        });
        return res.redirect(existingPayment.paymentUrl);
      }
    }

    const billing = await configureAsaasBillingForUser(user, plan, billingMode, "PENDING");
    if (billing?.paymentUrl) return res.redirect(billing.paymentUrl);

    return res.status(400).render("billing-plan-choice", {
      error: "Não foi possível gerar o link de pagamento. Verifique se o Asaas e o valor do plano estão configurados.",
      user,
      plan,
      billingOptions: billingOptionsForPlan(plan),
    });
  } catch (err) {
    console.error("Erro ao gerar pagamento:", err);
    const user = req.session.userId ? await prisma.user.findUnique({ where: { id: req.session.userId } }) : null;
    const plan = Object.values(COMMERCIAL_PLANS).find((item) => item.key === user?.selectedPlan) || COMMERCIAL_PLANS.premium;
    return res.status(500).render("billing-plan-choice", {
      error: err.message || "Erro ao gerar pagamento.",
      user,
      plan,
      billingOptions: billingOptionsForPlan(plan),
    });
  }
});

app.post("/webhooks/asaas", async (req, res) => {
  if (!verifyWebhookToken(req)) {
    return res.status(401).send("Webhook não autorizado.");
  }

  const eventName = String(req.body?.event || "");
  const payment = req.body?.payment || {};
  const reference = planFromExternalReference(payment.externalReference);

  try {
    let user = null;

    if (reference?.userId) {
      user = await prisma.user.findUnique({ where: { id: reference.userId } });
    }

    if (!user && payment.id) {
      user = await prisma.user.findFirst({ where: { asaasPaymentId: payment.id } });
    }

    if (!user && payment.subscription) {
      user = await prisma.user.findFirst({ where: { asaasSubscriptionId: payment.subscription } });
    }

    if (!user) {
      console.warn("Webhook Asaas sem usuário correspondente:", {
        event: eventName,
        paymentId: payment.id,
        subscription: payment.subscription,
        externalReference: payment.externalReference,
      });
      return res.sendStatus(200);
    }

    const planKey = reference?.planKey || user.selectedPlan || "PREMIUM";
    const nextRole = [ROLES.BASIC, ROLES.MASTER, ROLES.PREMIUM].includes(planKey)
      ? planKey
      : ROLES.PREMIUM;

    const activateEvents = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
    const restrictEvents = new Set(["PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_REFUNDED", "CHARGEBACK_REQUESTED"]);

    if (activateEvents.has(eventName)) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          role: nextRole,
          approvalStatus: "DEFERIDO",
          selectedPlan: nextRole,
          subscriptionStatus: "ACTIVE",
          planActivatedAt: new Date(),
          asaasPaymentId: payment.id || user.asaasPaymentId,
          asaasSubscriptionId: payment.subscription || user.asaasSubscriptionId,
          asaasPaymentUrl: payment.invoiceUrl || payment.bankSlipUrl || user.asaasPaymentUrl,
          asaasLastEvent: eventName,
        },
      });
    } else if (restrictEvents.has(eventName)) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: eventName === "PAYMENT_OVERDUE" ? "PENDING" : "CANCELED",
          asaasLastEvent: eventName,
        },
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          asaasPaymentId: payment.id || user.asaasPaymentId,
          asaasSubscriptionId: payment.subscription || user.asaasSubscriptionId,
          asaasPaymentUrl: payment.invoiceUrl || payment.bankSlipUrl || user.asaasPaymentUrl,
          asaasLastEvent: eventName,
        },
      });
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Erro ao processar webhook Asaas:", err);
    return res.sendStatus(500);
  }
});

// ---------- DASHBOARD ----------
app.get("/dashboard", requireAuth, async (req, res) => {
  try {
   
   
    const user = req.user;
    if (user?.role === ROLES.CATBREED) {
      return res.redirect(res.locals.access?.canAccessAcademy ? "/academy/app" : "/academy/planos");
    }

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

    function sortHistoryDates(history) {
      return [...history]
        .map((value) => ({ ...value, date: value?.date || "" }))
        .sort((a, b) => {
          const aDate = parseDate(a.date);
          const bDate = parseDate(b.date);
          if (!aDate && !bDate) return 0;
          if (!aDate) return -1;
          if (!bDate) return 1;
          return aDate - bDate;
        });
    }

    function computeNextAntirabic(birthDate, history) {
      const sorted = sortHistoryDates(history).filter((item) => parseDate(item.date));
      const birth = parseDate(birthDate);
      if (!sorted.length) return birth ? addMonths(birth, 3) : null;
      const last = parseDate(sorted[sorted.length - 1].date);
      return last ? addDays(addYears(last, 1), -1) : null;
    }

    function computeNextFeline(birthDate, history) {
      const sorted = sortHistoryDates(history).filter((item) => parseDate(item.date));
      const birth = parseDate(birthDate);
      if (!sorted.length) return birth ? addMonths(birth, 2) : null;
      if (sorted.length === 1) {
        const first = parseDate(sorted[0].date);
        return first ? addDays(first, 21) : null;
      }
      const last = parseDate(sorted[sorted.length - 1].date);
      return last ? addDays(addYears(last, 1), -1) : null;
    }

    let catsInReviewCount = 0;

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
const nextTenDays = new Date(today);
nextTenDays.setDate(nextTenDays.getDate() + 10);
const receivableAttention = [];
let nextReceivableCents = 0;
let nextReceivableCount = 0;
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
    if (!parcel.paid && !parcel.canceled && parcelDate >= today && parcelDate <= nextTenDays) {
      nextReceivableCents += amount;
      nextReceivableCount += 1;
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

const nextPayables = await prisma.accountPayable.findMany({
  where: {
    ...userScope,
    status: "PENDING",
    dueDate: { gte: today, lte: nextTenDays },
  },
  select: { amountCents: true },
});
const nextPayableCents = nextPayables.reduce(
  (sum, row) => sum + Number(row.amountCents || 0),
  0
);

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

const vaccinationCats = await prisma.cat.findMany({
  where: userScope,
  include: {
    owner: { include: { settings: true } },
    mother: true,
    vaccinationPlan: true,
    litterKitten: true,
  },
});
const overdueVaccinesCount = vaccinationCats.reduce((count, cat) => {
  if (!classifyOperationalCat(cat)) return count;
  return buildVaccineDueItems(cat).some((item) => item.dueDate && item.dueDate < today)
    ? count + 1
    : count;
}, 0);

const activeTreatmentCount = await prisma.catTreatment.count({
  where: {
    ...userScope,
    OR: [{ endDate: null }, { endDate: { gte: today } }],
    cat: {
      is: {
        OR: [{ delivered: false }, { delivered: null }],
      },
    },
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
    overdueVaccinesCount,
    activeTreatmentCount,
  },
  attentionItems,
};

const administrativePanel = {
  finance: {
    incomeLabel: moneyLabel(monthRevenueCents),
    expenseLabel: moneyLabel(monthExpenseCents),
    balanceLabel: moneyLabel(monthRevenueCents - monthExpenseCents),
    nextReceivableLabel: moneyLabel(nextReceivableCents),
    nextReceivableCount,
    nextPayableLabel: moneyLabel(nextPayableCents),
    nextPayableCount: nextPayables.length,
  },
};


res.render("dashboard", {
  user,
  userRole: req.session.userRole,

  catsInReviewCount,
  usersPendingApprovalCount,
  servicesPendingFFBCount,

  pendingServices,
pendingServicesCount: pendingServices.length,
  administrativePanel,
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
        include: { litterKitten: true, mother: true },
      });
      results.cats = results.cats.map((cat) => ({
        ...cat,
        displayName: buildDisplayName(cat),
      }));
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
    await loadPlanLimitOverrides(prisma);

    res.render("users/my-profile", {
      user,
      currentPath: "/meus-dados",
      profilePlanCards: buildProfilePlanCards(user.role),
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
        country,
        address,
        city,
        state,
        cep,
        phones,
        email: normalizedEmail,
        approvalStatus: "INDEFERIDO",
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
app.get("/my-services/:id", requireAuth, requirePermission("services.my"), async (req, res) => {
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
const catsRouter = require("./modules/cats")(prisma, requireAuth, requirePermission);
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

const treatmentsAdminRouter = treatmentsAdminRouterFactory(
  prisma,
  requireAuth,
  requirePermission
);
app.use(treatmentsAdminRouter);

const tacticalPanelRouter = tacticalPanelRouterFactory(
  prisma,
  requireAuth,
  requirePermission
);
app.use(tacticalPanelRouter);

const kittenShowcaseRouter = kittenShowcaseRouterFactory(
  prisma,
  requireAuth,
  requirePermission
);
app.use(kittenShowcaseRouter);

const documentsRouter = documentsRouterFactory(
  prisma,
  requireAuth,
  requirePermission
);
app.use(documentsRouter);

const gatarinaShowPhotosRouter = gatarinaShowPhotosRouterFactory(
  prisma,
  requireAuth,
  requirePermission
);
app.use(gatarinaShowPhotosRouter);

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

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "QuickLaunchOption"
        SET "name" = ${name}
        WHERE "id" = ${id}
          AND "ownerId" IS NULL
      `;

      if (option.type === "CATEGORY") {
        await tx.quickLaunchEntry.updateMany({
          where: { category: option.name },
          data: { category: name },
        });
        await tx.accountPayable.updateMany({
          where: { category: option.name },
          data: { category: name },
        });
        await tx.expenseSupplier.updateMany({
          where: { defaultCategory: option.name },
          data: { defaultCategory: name },
        });
      }

      if (option.type === "SUPPLIER") {
        await tx.quickLaunchEntry.updateMany({
          where: { supplier: option.name },
          data: { supplier: name },
        });
        await tx.accountPayable.updateMany({
          where: { supplier: option.name },
          data: { supplier: name },
        });
        await tx.expenseSupplier.updateMany({
          where: { commercialName: option.name },
          data: { commercialName: name },
        });
      }

      if (option.type === "PAYMENT") {
        await tx.quickLaunchEntry.updateMany({
          where: { paymentMethod: option.name },
          data: { paymentMethod: name },
        });
        await tx.revenueEntry.updateMany({
          where: { paymentAccount: option.name },
          data: { paymentAccount: name },
        });
        await tx.financialAccountSetting.updateMany({
          where: { accountName: option.name },
          data: { accountName: name },
        });
        await tx.financialTransfer.updateMany({
          where: { fromAccount: option.name },
          data: { fromAccount: name },
        });
        await tx.financialTransfer.updateMany({
          where: { toAccount: option.name },
          data: { toAccount: name },
        });
        await tx.accountPayable.updateMany({
          where: { paymentMethod: option.name },
          data: { paymentMethod: name },
        });

        const revenueParcels = await tx.revenueEntry.findMany({
          where: { parcelDataJson: { not: null } },
          select: { id: true, parcelDataJson: true },
        });
        for (const revenue of revenueParcels) {
          let parcels = [];
          try {
            parcels = revenue.parcelDataJson ? JSON.parse(revenue.parcelDataJson) : [];
          } catch {
            parcels = [];
          }
          if (!Array.isArray(parcels)) continue;
          let changed = false;
          const nextParcels = parcels.map((parcel) => {
            if (parcel && parcel.paymentAccount === option.name) {
              changed = true;
              return { ...parcel, paymentAccount: name };
            }
            return parcel;
          });
          if (changed) {
            await tx.revenueEntry.update({
              where: { id: revenue.id },
              data: { parcelDataJson: JSON.stringify(nextParcels) },
            });
          }
        }
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
      addUploadedFileToArchive(archive, "PEDIGREE", cat.pedigreeFile);
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

  addUploadedFileToArchive(archive, `CERTIFICADO-${index + 1}`, cert.file);
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
      addUploadedFileToArchive(archive, "PEDIGREE", cat.pedigreeFile);
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
          addUploadedFileToArchive(archive, "PEDIGREE", cat.pedigreeFile);
        }

// --------------------------------------
// AUTORIZAÇÃO DE TRANSFERÊNCIA (se existir)
// --------------------------------------
if (transfer.authorizationFile) {
  addUploadedFileToArchive(archive, "AUTORIZACAO_TRANSFERENCIA", transfer.authorizationFile);
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
      addUploadedFileToArchive(archive, "PEDIGREE", cat.pedigreeFile);
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
  const existingPath = findUploadedFile(cleanPath);

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
app.get("/my-services/:id/pdf", requireAuth, requirePermission("services.my"), async (req, res) => {
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
loadPlanLimitOverrides(prisma).finally(() => {
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  startVaccineReminderScheduler(prisma);
});
});
