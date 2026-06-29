const bcrypt = require("bcryptjs");
const {
  notifyNewUser,
  notifyUserRegistrationConfirmation,
} = require("../../../utils/adminNotifications");
const { sendStatusEmail } = require("../../../utils/mailer");
const {
  getEnrollment,
  getActiveSubscription,
  getAcademyAuthorForUser,
  getAcademyContext,
  getPublishedCatalog,
  userHasAcademyAccess,
} = require("../services/academyService");
const { academySeo, absoluteUrl, sitemapUrl } = require("../services/academySeo");
const { getAcademyPublicSettings, buildAcademyCountdown } = require("../services/publicSettings");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cleanText(value, limit = 1000) {
  return String(value || "").trim().slice(0, limit);
}

function gatofiliaEmailAddress() {
  return process.env.GATOFILIA_CONTACT_EMAIL || "contato@gatofilia.com.br";
}

function gatofiliaMailFrom() {
  return process.env.GATOFILIA_MAIL_FROM || process.env.GATOFILIA_CONTACT_EMAIL || "contato@gatofilia.com.br";
}

function gatofiliaSmtpConfig() {
  if (!process.env.GATOFILIA_SMTP_HOST && !process.env.GATOFILIA_SMTP_USER && !process.env.GATOFILIA_SMTP_PASS) {
    return null;
  }

  return {
    host: process.env.GATOFILIA_SMTP_HOST,
    port: process.env.GATOFILIA_SMTP_PORT || process.env.SMTP_PORT || 587,
    user: process.env.GATOFILIA_SMTP_USER,
    pass: process.env.GATOFILIA_SMTP_PASS,
    from: gatofiliaMailFrom(),
  };
}

function renderPublic(req, res, view, locals = {}) {
  return res.render(`academy/public/${view}`, {
    pageTitle: "Gatofilia",
    seo: academySeo(req, locals.seo || {}),
    currentPublicPath: req.path,
    ...locals,
  });
}

async function notifyGatofiliaLead(lead) {
  const adminTo = gatofiliaEmailAddress();
  const smtpConfig = gatofiliaSmtpConfig();
  const from = gatofiliaMailFrom();
  try {
    await sendStatusEmail({
      to: adminTo,
      subject: "Gatofilia - Nova manifestação de interesse",
      smtpConfig,
      from,
      replyTo: lead.email || null,
      html: `
        <h2>Nova manifestação de interesse</h2>
        <p><strong>Nome:</strong> ${escapeHtml([lead.firstName, lead.lastName].filter(Boolean).join(" "))}</p>
        <p><strong>E-mail:</strong> ${escapeHtml(lead.email)}</p>
        <p><strong>WhatsApp:</strong> ${escapeHtml(lead.whatsapp || "-")}</p>
        <p><strong>Cidade/Estado/País:</strong> ${escapeHtml([lead.city, lead.state, lead.country].filter(Boolean).join(" / ") || "-")}</p>
        <p><strong>Possui gatil:</strong> ${escapeHtml(lead.hasCattery || "-")}</p>
        <p><strong>Gatil:</strong> ${escapeHtml(lead.catteryName || "-")}</p>
        <p><strong>Raça principal criada:</strong> ${escapeHtml(lead.breed || "-")}</p>
        <p><strong>Raça que pretende criar:</strong> ${escapeHtml(lead.wantsStart || "-")}</p>
        <p><strong>Tempo de criação:</strong> ${escapeHtml(lead.breedingTime || "-")}</p>
        <p><strong>Como conheceu:</strong> ${escapeHtml(lead.referralSource || "-")}</p>
        <p><strong>Mensagem:</strong><br>${escapeHtml(lead.message || "-").replace(/\n/g, "<br>")}</p>
      `,
    });
  } catch (err) {
    console.error("Erro ao notificar lead Gatofilia:", err.message || err);
  }

  try {
    await sendStatusEmail({
      to: lead.email,
      subject: "Gatofilia - Interesse recebido",
      smtpConfig,
      from,
      html: `
        <h2>Recebemos sua manifestação de interesse</h2>
        <p>Olá, ${escapeHtml(lead.firstName)}.</p>
        <p>Seu contato foi registrado para a próxima turma da Gatofilia.</p>
        <p>Assim que houver novidades sobre abertura de vagas, nossa equipe entrará em contato.</p>
      `,
    });
  } catch (err) {
    console.error("Erro ao enviar confirmação Gatofilia:", err.message || err);
  }
}

module.exports = (prisma) => ({
  home: async (req, res) => {
    const [academy, publicSettings] = await Promise.all([
      getAcademyContext(prisma, req),
      getAcademyPublicSettings(prisma),
    ]);
    const catalog = await getPublishedCatalog(prisma, academy.level);
    renderPublic(req, res, "home", {
      academy,
      catalog,
      academyCountdown: buildAcademyCountdown(publicSettings),
      leadStatus: req.query.interesse || null,
      seo: {
        path: "/academy",
        title: "Gatofilia | Como Criar Gatos e Ter um Gatil Profissional",
        description: "Jornada para criadores e futuros criadores de gatos: genética, reprodução, saúde, manejo, raças, exposições, gestão de gatil e criação responsável.",
        image: "/uploads/academy/gatofilia-hero-01-1200.jpg",
        keywords: [
          "como ter um gatil",
          "como criar gatos",
          "curso para criadores de gatos",
          "criação de gatos de raça",
          "gatil profissional",
          "criação responsável de gatos",
          "felinocultura",
          "raças de gatos",
          "genética felina",
          "reprodução felina",
          "manejo de gatil",
          "exposições felinas",
          "Bengal",
          "Maine Coon",
          "Persa",
          "British Shorthair",
          "Ragdoll",
          "Sphynx",
        ],
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "EducationalOrganization",
            name: "Gatofilia",
            url: absoluteUrl(req, "/academy"),
            logo: absoluteUrl(req, "/uploads/academy/gatofilia-main-logo-360.png"),
            sameAs: ["https://www.instagram.com/gatofilia.oficial"],
            description: "Educação em felinocultura para criadores e futuros criadores de gatos, com foco em criação responsável, gestão de gatil, genética, saúde, reprodução e exposições felinas.",
          },
          {
            "@context": "https://schema.org",
            "@type": "Course",
            name: "Gatofilia - Jornada para Criadores de Gatos",
            description: "Jornada para aprender como criar gatos de forma responsável, estruturar um gatil profissional, planejar acasalamentos, cuidar da saúde felina, organizar a gestão e buscar reconhecimento em exposições.",
            provider: {
              "@type": "EducationalOrganization",
              name: "Gatofilia",
              sameAs: absoluteUrl(req, "/academy"),
            },
            educationalLevel: "Professional",
            teaches: [
              "como ter um gatil",
              "criação responsável de gatos",
              "genética felina",
              "reprodução felina",
              "manejo sanitário",
              "gestão de gatil",
              "raças de gatos",
              "exposições felinas",
            ],
            audience: {
              "@type": "Audience",
              audienceType: "Criadores de gatos, futuros criadores, proprietários de gatil e interessados em felinocultura",
            },
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "Como ter um gatil de forma correta?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Para ter um gatil de forma correta é necessário estudar genética, saúde, reprodução, manejo, bem-estar, documentação, gestão e ética na criação. A Gatofilia organiza esses pilares em uma jornada estruturada para criadores.",
                },
              },
              {
                "@type": "Question",
                name: "Preciso já possuir um gatil para participar?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Não. A jornada foi desenvolvida para quem deseja iniciar corretamente e também para criadores que já possuem gatil e querem profissionalizar a criação.",
                },
              },
              {
                "@type": "Question",
                name: "A Gatofilia serve para qualquer raça de gato?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Sim. Os fundamentos de felinocultura, gestão, saúde, genética, reprodução e bem-estar são aplicáveis a diferentes raças felinas.",
                },
              },
              {
                "@type": "Question",
                name: "Qual a melhor raça de gatos para criar?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "A melhor raça depende do perfil do criador, estrutura disponível, conhecimento técnico, objetivo de criação e compromisso com saúde, bem-estar e seleção responsável.",
                },
              },
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Gatofilia",
                item: absoluteUrl(req, "/academy"),
              },
            ],
          },
        ],
      },
    });
  },

  interest: async (req, res) => {
    const basePath = req.path.startsWith("/gatofilia") ? "/gatofilia" : "/academy";
    const leadData = {
      firstName: cleanText(req.body.firstName, 120),
      lastName: cleanText(req.body.lastName, 120),
      email: cleanText(req.body.email, 180).toLowerCase(),
      whatsapp: cleanText(req.body.whatsapp, 60),
      city: cleanText(req.body.city, 120),
      state: cleanText(req.body.state, 80),
      country: cleanText(req.body.country, 80),
      hasCattery: cleanText(req.body.hasCattery, 20),
      catteryName: cleanText(req.body.catteryName, 160),
      breed: cleanText(req.body.breed, 160),
      breedingTime: cleanText(req.body.breedingTime, 120),
      wantsStart: cleanText(req.body.wantsStart, 20),
      referralSource: cleanText(req.body.referralSource, 180),
      message: cleanText(req.body.message, 2000),
      wantsUpdates: Boolean(req.body.wantsUpdates),
    };

    const requiredFields = [
      leadData.firstName,
      leadData.lastName,
      leadData.email,
      leadData.whatsapp,
      leadData.country,
      leadData.state,
      leadData.city,
      leadData.hasCattery,
      leadData.referralSource,
      leadData.message,
    ];

    if (leadData.hasCattery === "Sim") {
      requiredFields.push(leadData.catteryName, leadData.breed, leadData.breedingTime);
    } else if (leadData.hasCattery === "Não") {
      requiredFields.push(leadData.wantsStart);
    } else {
      requiredFields.push("");
    }

    if (requiredFields.some((field) => !field)) {
      return res.redirect(`${basePath}?interesse=erro#pre-inscricao`);
    }

    const whatsappPayload = JSON.stringify({
      to: leadData.whatsapp,
      template: "gatofilia_interest",
      message: `Olá, ${leadData.firstName}. Recebemos seu interesse na Gatofilia.`,
      status: "prepared",
    });

    try {
      const lead = await prisma.gatofiliaLead.create({
        data: {
          ...leadData,
          whatsappPayload,
        },
      });
      await notifyGatofiliaLead(lead);
      return res.redirect(`${basePath}?interesse=ok#pre-inscricao`);
    } catch (err) {
      console.error("Erro ao registrar lead Gatofilia:", err.message || err);
      return res.redirect(`${basePath}?interesse=erro#pre-inscricao`);
    }
  },

  about: async (req, res) => {
    renderPublic(req, res, "about", {
      academy: await getAcademyContext(prisma, req),
      seo: {
        path: "/academy/sobre",
        title: "Sobre | CatBreeder Pro",
        description: "Conheça a Academy integrada ao PetGus para elevar o padrão da criação felina.",
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
      await notifyNewUser(prisma, user);
      await notifyUserRegistrationConfirmation(user);
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
      sitemapUrl(absoluteUrl(req, "/gatofilia"), null, "1.0"),
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
      "Allow: /gatofilia",
      "Disallow: /academy/app",
      "Disallow: /academy/admin",
      "Disallow: /academy/especialista",
      `Sitemap: ${absoluteUrl(req, "/academy/sitemap.xml")}`,
      "",
    ].join("\n"));
  },
});
