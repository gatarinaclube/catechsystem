const {
  ACADEMY_LEVELS,
  LEVEL_LABELS,
  getAcademyContext,
  getAdminOverview,
  slugify,
  toBool,
} = require("../services/academyService");

function cleanSlug(title, slug) {
  return slugify(slug || title);
}

module.exports = (prisma) => ({
  dashboard: async (req, res) => {
    const [overview, categories, modules, lessons, plans, enrollments, users] = await Promise.all([
      getAdminOverview(prisma),
      prisma.academyCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
      prisma.academyModule.findMany({ include: { category: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
      prisma.academyLesson.findMany({ include: { module: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
      prisma.academyPlan.findMany({ orderBy: [{ featured: "desc" }, { priceCents: "asc" }] }),
      prisma.academyEnrollment.findMany({ include: { user: true, plan: true }, orderBy: { createdAt: "desc" } }),
      prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    ]);
    const enrolledUserIds = new Set(enrollments.map((item) => item.userId));

    res.render("academy/admin/dashboard", {
      pageTitle: "Admin Academy - CatBreeder Pro",
      user: req.user,
      academy: await getAcademyContext(prisma, req),
      overview,
      categories,
      modules,
      lessons,
      plans,
      enrollments,
      availableUsers: users.filter((item) => !enrolledUserIds.has(item.id)),
      levels: ACADEMY_LEVELS,
      levelLabels: LEVEL_LABELS,
    });
  },

  createCategory: async (req, res) => {
    await prisma.academyCategory.create({
      data: {
        title: req.body.title,
        slug: cleanSlug(req.body.title, req.body.slug),
        description: req.body.description || null,
        sortOrder: Number(req.body.sortOrder || 0),
        published: toBool(req.body.published),
      },
    });
    res.redirect("/academy/admin");
  },

  updateCategory: async (req, res) => {
    await prisma.academyCategory.update({
      where: { id: Number(req.params.id) },
      data: {
        title: req.body.title,
        slug: cleanSlug(req.body.title, req.body.slug),
        description: req.body.description || null,
        sortOrder: Number(req.body.sortOrder || 0),
        published: toBool(req.body.published),
      },
    });
    res.redirect("/academy/admin");
  },

  deleteCategory: async (req, res) => {
    await prisma.academyCategory.delete({ where: { id: Number(req.params.id) } });
    res.redirect("/academy/admin");
  },

  createModule: async (req, res) => {
    await prisma.academyModule.create({
      data: {
        categoryId: Number(req.body.categoryId),
        title: req.body.title,
        slug: cleanSlug(req.body.title, req.body.slug),
        description: req.body.description || null,
        level: req.body.level || ACADEMY_LEVELS.STUDENT,
        sortOrder: Number(req.body.sortOrder || 0),
        published: toBool(req.body.published),
      },
    });
    res.redirect("/academy/admin");
  },

  updateModule: async (req, res) => {
    await prisma.academyModule.update({
      where: { id: Number(req.params.id) },
      data: {
        categoryId: Number(req.body.categoryId),
        title: req.body.title,
        slug: cleanSlug(req.body.title, req.body.slug),
        description: req.body.description || null,
        level: req.body.level || ACADEMY_LEVELS.STUDENT,
        sortOrder: Number(req.body.sortOrder || 0),
        published: toBool(req.body.published),
      },
    });
    res.redirect("/academy/admin");
  },

  deleteModule: async (req, res) => {
    await prisma.academyModule.delete({ where: { id: Number(req.params.id) } });
    res.redirect("/academy/admin");
  },

  createLesson: async (req, res) => {
    await prisma.academyLesson.create({
      data: {
        moduleId: Number(req.body.moduleId),
        title: req.body.title,
        slug: cleanSlug(req.body.title, req.body.slug),
        summary: req.body.summary || null,
        richText: req.body.richText || null,
        imageUrl: req.body.imageUrl || null,
        videoEmbed: req.body.videoEmbed || null,
        filesJson: req.body.filesJson || null,
        durationMinutes: req.body.durationMinutes ? Number(req.body.durationMinutes) : null,
        level: req.body.level || ACADEMY_LEVELS.STUDENT,
        sortOrder: Number(req.body.sortOrder || 0),
        published: toBool(req.body.published),
      },
    });
    res.redirect("/academy/admin");
  },

  updateLesson: async (req, res) => {
    await prisma.academyLesson.update({
      where: { id: Number(req.params.id) },
      data: {
        moduleId: Number(req.body.moduleId),
        title: req.body.title,
        slug: cleanSlug(req.body.title, req.body.slug),
        summary: req.body.summary || null,
        richText: req.body.richText || null,
        imageUrl: req.body.imageUrl || null,
        videoEmbed: req.body.videoEmbed || null,
        filesJson: req.body.filesJson || null,
        durationMinutes: req.body.durationMinutes ? Number(req.body.durationMinutes) : null,
        level: req.body.level || ACADEMY_LEVELS.STUDENT,
        sortOrder: Number(req.body.sortOrder || 0),
        published: toBool(req.body.published),
      },
    });
    res.redirect("/academy/admin");
  },

  deleteLesson: async (req, res) => {
    await prisma.academyLesson.delete({ where: { id: Number(req.params.id) } });
    res.redirect("/academy/admin");
  },

  createPlan: async (req, res) => {
    await prisma.academyPlan.create({
      data: {
        name: req.body.name,
        slug: cleanSlug(req.body.name, req.body.slug),
        description: req.body.description || null,
        priceCents: Number(req.body.priceCents || 0),
        billingCycle: req.body.billingCycle || "MONTHLY",
        featured: toBool(req.body.featured),
        active: toBool(req.body.active),
        checkoutProvider: req.body.checkoutProvider || null,
        checkoutMetadataJson: req.body.checkoutMetadataJson || null,
      },
    });
    res.redirect("/academy/admin");
  },

  updatePlan: async (req, res) => {
    await prisma.academyPlan.update({
      where: { id: Number(req.params.id) },
      data: {
        name: req.body.name,
        slug: cleanSlug(req.body.name, req.body.slug),
        description: req.body.description || null,
        priceCents: Number(req.body.priceCents || 0),
        billingCycle: req.body.billingCycle || "MONTHLY",
        featured: toBool(req.body.featured),
        active: toBool(req.body.active),
        checkoutProvider: req.body.checkoutProvider || null,
        checkoutMetadataJson: req.body.checkoutMetadataJson || null,
      },
    });
    res.redirect("/academy/admin");
  },

  deletePlan: async (req, res) => {
    await prisma.academyPlan.delete({ where: { id: Number(req.params.id) } });
    res.redirect("/academy/admin");
  },

  createEnrollment: async (req, res) => {
    const userId = Number(req.body.userId);
    if (!userId) return res.redirect("/academy/admin");

    await prisma.academyEnrollment.upsert({
      where: { userId },
      create: {
        userId,
        level: req.body.level || ACADEMY_LEVELS.STUDENT,
        status: req.body.status || "ACTIVE",
        planId: req.body.planId ? Number(req.body.planId) : null,
      },
      update: {
        level: req.body.level || ACADEMY_LEVELS.STUDENT,
        status: req.body.status || "ACTIVE",
        planId: req.body.planId ? Number(req.body.planId) : null,
      },
    });
    res.redirect("/academy/admin");
  },

  updateEnrollment: async (req, res) => {
    await prisma.academyEnrollment.update({
      where: { id: Number(req.params.id) },
      data: {
        level: req.body.level || ACADEMY_LEVELS.STUDENT,
        status: req.body.status || "ACTIVE",
        planId: req.body.planId ? Number(req.body.planId) : null,
      },
    });
    res.redirect("/academy/admin");
  },
});
