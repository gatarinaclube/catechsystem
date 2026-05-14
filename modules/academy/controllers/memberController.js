const {
  ACADEMY_LEVELS,
  ensureEnrollment,
  getAcademyContext,
  getMemberDashboard,
  getLearningPaths,
  getPublishedCatalog,
  canAccessLevel,
  isPublishedStatus,
} = require("../services/academyService");
const { academySeo } = require("../services/academySeo");
const {
  issueLessonCertificate,
  listUserCertificates,
} = require("../services/academyCertificateService");
const { getAcademyFutureHub } = require("../services/academyFutureService");

function parseFilesJson(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

module.exports = (prisma) => ({
  dashboard: async (req, res) => {
    await ensureEnrollment(prisma, req.user.id, ACADEMY_LEVELS.STUDENT);
    const academy = await getAcademyContext(prisma, req);
    const dashboard = await getMemberDashboard(prisma, req.user.id, academy.level);
    const certificates = await listUserCertificates(prisma, req.user.id);

    res.render("academy/member/dashboard", {
      pageTitle: "Área do Aluno - CatBreeder Pro",
      user: req.user,
      academy,
      dashboard,
      certificates: certificates.slice(0, 4),
    });
  },

  certificates: async (req, res) => {
    const academy = await getAcademyContext(prisma, req);
    const certificates = await listUserCertificates(prisma, req.user.id);

    res.render("academy/member/certificates", {
      pageTitle: "Certificados - CatBreeder Pro",
      user: req.user,
      academy,
      certificates,
    });
  },

  premium: async (req, res) => {
    const academy = await getAcademyContext(prisma, req);
    const hub = getAcademyFutureHub();

    res.render("academy/member/premium", {
      pageTitle: "Premium Lab - CatBreeder Pro",
      user: req.user,
      academy,
      hub,
    });
  },

  paths: async (req, res) => {
    const academy = await getAcademyContext(prisma, req);
    const paths = await getLearningPaths(prisma, req.user.id, academy.level);

    res.render("academy/member/paths", {
      pageTitle: "Trilhas - CatBreeder Pro",
      user: req.user,
      academy,
      paths,
    });
  },

  pathDetail: async (req, res) => {
    const academy = await getAcademyContext(prisma, req);
    const paths = await getLearningPaths(prisma, req.user.id, academy.level);
    const path = paths.find((item) => item.slug === req.params.slug);

    if (!path) {
      return res.status(404).send("Trilha não encontrada.");
    }

    res.render("academy/member/path-detail", {
      pageTitle: `${path.title} - CatBreeder Pro`,
      user: req.user,
      academy,
      path,
    });
  },

  library: async (req, res) => {
    const academy = await getAcademyContext(prisma, req);
    const catalog = await getPublishedCatalog(prisma, academy.level);
    const query = String(req.query.q || "").trim().toLowerCase();
    const lessons = catalog.flatMap((category) =>
      category.modules.flatMap((module) =>
        module.lessons.map((lesson) => ({ ...lesson, moduleTitle: module.title, categoryTitle: category.title }))
      )
    ).filter((lesson) =>
      !query ||
      lesson.title.toLowerCase().includes(query) ||
      String(lesson.summary || "").toLowerCase().includes(query) ||
      lesson.moduleTitle.toLowerCase().includes(query) ||
      lesson.categoryTitle.toLowerCase().includes(query)
    );

    res.render("academy/member/library", {
      pageTitle: "Biblioteca - CatBreeder Pro",
      user: req.user,
      academy,
      lessons,
      query,
    });
  },

  favorites: async (req, res) => {
    const academy = await getAcademyContext(prisma, req);
    const favorites = await prisma.academyFavorite.findMany({
      where: { userId: req.user.id },
      include: {
        lesson: {
          include: {
            module: {
              include: { category: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const lessons = favorites
      .map((favorite) => favorite.lesson)
      .filter((lesson) => lesson.published && isPublishedStatus(lesson.status, lesson.published) && canAccessLevel(academy.level, lesson.level));

    res.render("academy/member/favorites", {
      pageTitle: "Favoritos - CatBreeder Pro",
      user: req.user,
      academy,
      lessons,
    });
  },

  lesson: async (req, res) => {
    const academy = await getAcademyContext(prisma, req);
    const lesson = await prisma.academyLesson.findUnique({
      where: { slug: req.params.slug },
      include: {
        author: true,
        media: true,
        module: { include: { category: true } },
      },
    });

    if (!lesson || !lesson.published || !isPublishedStatus(lesson.status, lesson.published) || !canAccessLevel(academy.level, lesson.level)) {
      return res.status(404).send("Aula não encontrada ou indisponível para seu plano.");
    }

    await prisma.academyProgress.upsert({
      where: { userId_lessonId: { userId: req.user.id, lessonId: lesson.id } },
      create: { userId: req.user.id, lessonId: lesson.id },
      update: { lastSeenAt: new Date() },
    });

    const [progress, favorite] = await Promise.all([
      prisma.academyProgress.findUnique({
        where: { userId_lessonId: { userId: req.user.id, lessonId: lesson.id } },
      }),
      prisma.academyFavorite.findUnique({
        where: { userId_lessonId: { userId: req.user.id, lessonId: lesson.id } },
      }),
    ]);

    res.render("academy/member/lesson", {
      pageTitle: `${lesson.title} - CatBreeder Pro`,
      seo: academySeo(req, {
        path: `/academy/app/aulas/${lesson.slug}`,
        title: lesson.metaTitle || `${lesson.title} | CatBreeder Pro`,
        description: lesson.metaDescription || lesson.summary || "Aula CatBreeder Pro para criadores felinos.",
        image: lesson.ogImageUrl || lesson.imageUrl || undefined,
        type: "article",
        robots: "noindex,nofollow",
      }),
      user: req.user,
      academy,
      lesson,
      progress,
      favorite,
      files: parseFilesJson(lesson.filesJson),
    });
  },

  toggleComplete: async (req, res) => {
    const lessonId = Number(req.params.id);
    const current = await prisma.academyProgress.findUnique({
      where: { userId_lessonId: { userId: req.user.id, lessonId } },
    });
    const completed = !current?.completed;

    await prisma.academyProgress.upsert({
      where: { userId_lessonId: { userId: req.user.id, lessonId } },
      create: {
        userId: req.user.id,
        lessonId,
        completed,
        completedAt: completed ? new Date() : null,
      },
      update: {
        completed,
        completedAt: completed ? new Date() : null,
      },
    });
    if (completed) {
      await issueLessonCertificate(prisma, req.user.id, lessonId);
    }
    res.redirect(req.get("Referer") || "/academy/app");
  },

  toggleFavorite: async (req, res) => {
    const lessonId = Number(req.params.id);
    const favorite = await prisma.academyFavorite.findUnique({
      where: { userId_lessonId: { userId: req.user.id, lessonId } },
    });

    if (favorite) {
      await prisma.academyFavorite.delete({ where: { id: favorite.id } });
    } else {
      await prisma.academyFavorite.create({ data: { userId: req.user.id, lessonId } });
    }

    res.redirect(req.get("Referer") || "/academy/app");
  },
});
