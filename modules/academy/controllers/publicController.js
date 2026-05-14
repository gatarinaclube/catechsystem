const bcrypt = require("bcryptjs");
const {
  getEnrollment,
  getActiveSubscription,
  getAcademyAuthorForUser,
  getAcademyContext,
  getPublishedCatalog,
  userHasAcademyAccess,
} = require("../services/academyService");
const { academySeo, absoluteUrl, sitemapUrl } = require("../services/academySeo");

function renderPublic(req, res, view, locals = {}) {
  return res.render(`academy/public/${view}`, {
    pageTitle: "CatBreeder Pro",
    seo: academySeo(req, locals.seo || {}),
    ...locals,
  });
}

module.exports = (prisma) => ({
  home: async (req, res) => {
    const academy = await getAcademyContext(prisma, req);
    const catalog = await getPublishedCatalog(prisma, academy.level);
    renderPublic(req, res, "home", {
      academy,
      catalog,
      seo: {
        path: "/academy",
        title: "CatBreeder Pro | Formação premium para criadores felinos",
        description: "Aulas, protocolos e trilhas práticas para criadores felinos responsáveis.",
      },
    });
  },

  about: async (req, res) => {
    renderPublic(req, res, "about", {
      academy: await getAcademyContext(prisma, req),
      seo: {
        path: "/academy/sobre",
        title: "Sobre | CatBreeder Pro",
        description: "Conheça a Academy integrada ao CaTech System para elevar o padrão da criação felina.",
      },
    });
  },

  plans: async (req, res) => {
    const plans = await prisma.academyPlan.findMany({
      where: { active: true },
      orderBy: [{ featured: "desc" }, { priceCents: "asc" }],
    });
    renderPublic(req, res, "plans", {
      academy: await getAcademyContext(prisma, req),
      plans,
      seo: {
        path: "/academy/planos",
        title: "Planos | CatBreeder Pro",
        description: "Planos CatBreeder Pro para formação premium de criadores felinos.",
      },
    });
  },

  contents: async (req, res) => {
    const academy = await getAcademyContext(prisma, req);
    const catalog = await getPublishedCatalog(prisma, academy.level);
    renderPublic(req, res, "contents", {
      academy,
      catalog,
      seo: {
        path: "/academy/conteudos",
        title: "Conteúdos | CatBreeder Pro",
        description: "Explore trilhas de criação responsável, associações, genética, manejo, saúde e gestão.",
      },
    });
  },

  faq: async (req, res) => {
    renderPublic(req, res, "faq", {
      academy: await getAcademyContext(prisma, req),
      seo: {
        path: "/academy/faq",
        title: "FAQ | CatBreeder Pro",
        description: "Perguntas frequentes sobre acesso, planos e funcionamento da Academy CatBreeder Pro.",
      },
    });
  },

  loginForm: (req, res) => {
    renderPublic(req, res, "login", { error: null, seo: { path: "/academy/login", title: "Login | CatBreeder Pro", robots: "noindex,nofollow" } });
  },

  login: async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return renderPublic(req, res, "login", { error: "E-mail ou senha inválidos.", seo: { path: "/academy/login", title: "Login | CatBreeder Pro", robots: "noindex,nofollow" } });
    }

    const [enrollment, subscription] = await Promise.all([
      getEnrollment(prisma, user.id),
      getActiveSubscription(prisma, user.id),
    ]);
    const author = await getAcademyAuthorForUser(prisma, user.id);
    const canContribute = Boolean(author?.active) || user.role === "ADMIN";
    if (!userHasAcademyAccess(user, enrollment, subscription) && !canContribute) {
      return renderPublic(req, res, "login", {
        error: "Seu acesso à Academy ainda não está ativo. Entre com um usuário Premium ou solicite a liberação de um plano Academy.",
        seo: { path: "/academy/login", title: "Login | CatBreeder Pro", robots: "noindex,nofollow" },
      });
    }

    req.session.userId = user.id;
    req.session.userRole = user.role;
    if (canContribute && !userHasAcademyAccess(user, enrollment, subscription)) {
      return res.redirect("/academy/especialista");
    }
    return res.redirect("/academy/app");
  },

  registerForm: (req, res) => {
    renderPublic(req, res, "register", { error: null, seo: { path: "/academy/cadastro", title: "Cadastro | CatBreeder Pro", robots: "noindex,nofollow" } });
  },

  register: async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !email || password.length < 6) {
      return renderPublic(req, res, "register", {
        error: "Informe nome, e-mail e uma senha com pelo menos 6 caracteres.",
        seo: { path: "/academy/cadastro", title: "Cadastro | CatBreeder Pro", robots: "noindex,nofollow" },
      });
    }

    try {
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: await bcrypt.hash(password, 10),
          role: "CATBREED",
          approvalStatus: "DEFERIDO",
        },
      });
      req.session.userId = user.id;
      req.session.userRole = user.role;
      return res.redirect("/academy/planos");
    } catch (err) {
      return renderPublic(req, res, "register", {
        error: "Não foi possível criar o cadastro. Verifique se o e-mail já está em uso.",
        seo: { path: "/academy/cadastro", title: "Cadastro | CatBreeder Pro", robots: "noindex,nofollow" },
      });
    }
  },

  sitemap: async (req, res) => {
    const [categories, lessons] = await Promise.all([
      prisma.academyCategory.findMany({ where: { published: true }, orderBy: { updatedAt: "desc" }, take: 100 }),
      prisma.academyLesson.findMany({
        where: { published: true, status: "PUBLISHED" },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 500,
      }),
    ]);

    const urls = [
      sitemapUrl(absoluteUrl(req, "/academy"), null, "1.0"),
      sitemapUrl(absoluteUrl(req, "/academy/sobre"), null, "0.7"),
      sitemapUrl(absoluteUrl(req, "/academy/planos"), null, "0.8"),
      sitemapUrl(absoluteUrl(req, "/academy/conteudos"), categories[0]?.updatedAt, "0.9"),
      sitemapUrl(absoluteUrl(req, "/academy/faq"), null, "0.5"),
      ...lessons.map((lesson) => sitemapUrl(absoluteUrl(req, `/academy/app/aulas/${lesson.slug}`), lesson.updatedAt, "0.6")),
    ];

    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`);
  },

  robots: (req, res) => {
    res.type("text/plain").send([
      "User-agent: *",
      "Allow: /academy",
      "Disallow: /academy/app",
      "Disallow: /academy/admin",
      "Disallow: /academy/especialista",
      `Sitemap: ${absoluteUrl(req, "/academy/sitemap.xml")}`,
      "",
    ].join("\n"));
  },
});
