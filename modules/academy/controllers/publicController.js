const bcrypt = require("bcryptjs");
const {
  ACADEMY_LEVELS,
  ensureEnrollment,
  getAcademyContext,
  getPublishedCatalog,
} = require("../services/academyService");

function renderPublic(res, view, locals = {}) {
  return res.render(`academy/public/${view}`, {
    pageTitle: "CatBreeder Pro",
    ...locals,
  });
}

module.exports = (prisma) => ({
  home: async (req, res) => {
    const academy = await getAcademyContext(prisma, req);
    const catalog = await getPublishedCatalog(prisma, academy.level);
    renderPublic(res, "home", { academy, catalog });
  },

  about: async (req, res) => {
    renderPublic(res, "about", { academy: await getAcademyContext(prisma, req) });
  },

  plans: async (req, res) => {
    const plans = await prisma.academyPlan.findMany({
      where: { active: true },
      orderBy: [{ featured: "desc" }, { priceCents: "asc" }],
    });
    renderPublic(res, "plans", { academy: await getAcademyContext(prisma, req), plans });
  },

  contents: async (req, res) => {
    const academy = await getAcademyContext(prisma, req);
    const catalog = await getPublishedCatalog(prisma, academy.level);
    renderPublic(res, "contents", { academy, catalog });
  },

  faq: async (req, res) => {
    renderPublic(res, "faq", { academy: await getAcademyContext(prisma, req) });
  },

  loginForm: (req, res) => {
    renderPublic(res, "login", { error: null });
  },

  login: async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return renderPublic(res, "login", { error: "E-mail ou senha inválidos." });
    }

    await ensureEnrollment(prisma, user.id, ACADEMY_LEVELS.STUDENT);
    req.session.userId = user.id;
    req.session.userRole = user.role;
    return res.redirect("/academy/app");
  },

  registerForm: (req, res) => {
    renderPublic(res, "register", { error: null });
  },

  register: async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !email || password.length < 6) {
      return renderPublic(res, "register", {
        error: "Informe nome, e-mail e uma senha com pelo menos 6 caracteres.",
      });
    }

    try {
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: await bcrypt.hash(password, 10),
          role: "BASIC",
          approvalStatus: "DEFERIDO",
        },
      });
      await ensureEnrollment(prisma, user.id, ACADEMY_LEVELS.STUDENT);
      req.session.userId = user.id;
      req.session.userRole = user.role;
      return res.redirect("/academy/app");
    } catch (err) {
      return renderPublic(res, "register", {
        error: "Não foi possível criar o cadastro. Verifique se o e-mail já está em uso.",
      });
    }
  },
});
