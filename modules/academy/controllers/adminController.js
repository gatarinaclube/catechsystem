const {
  academyMediaTypeForMime,
} = require("../middlewares/academyUpload");
const {
  ACADEMY_LEVELS,
  ACADEMY_CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  LEVEL_LABELS,
  getAcademyContext,
  getAdminOverview,
  slugify,
  toBool,
} = require("../services/academyService");
const { seedAcademyFoundation } = require("../services/academySeed");

function cleanSlug(title, slug) {
  return slugify(slug || title);
}

function lessonPayloadFromBody(body) {
  const status = body.status || ACADEMY_CONTENT_STATUSES.DRAFT;
  return {
    moduleId: Number(body.moduleId),
    authorId: body.authorId ? Number(body.authorId) : null,
    title: body.title,
    slug: cleanSlug(body.title, body.slug),
    summary: body.summary || null,
    richText: body.richText || null,
    contentJson: body.contentJson || null,
    imageUrl: body.imageUrl || null,
    videoEmbed: body.videoEmbed || null,
    filesJson: body.filesJson || null,
    durationMinutes: body.durationMinutes ? Number(body.durationMinutes) : null,
    estimatedReadingMinutes: body.estimatedReadingMinutes ? Number(body.estimatedReadingMinutes) : null,
    level: body.level || ACADEMY_LEVELS.STUDENT,
    status,
    sortOrder: Number(body.sortOrder || 0),
    published: status === ACADEMY_CONTENT_STATUSES.PUBLISHED || toBool(body.published),
    metaTitle: body.metaTitle || null,
    metaDescription: body.metaDescription || null,
    ogImageUrl: body.ogImageUrl || null,
    relatedLessonIdsJson: body.relatedLessonIdsJson || null,
  };
}

module.exports = (prisma) => ({
  dashboard: async (req, res) => {
    const [overview, categories, modules, lessons, authors, plans, enrollments, certificates, users] = await Promise.all([
      getAdminOverview(prisma),
      prisma.academyCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
      prisma.academyModule.findMany({ include: { category: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
      prisma.academyLesson.findMany({ include: { module: true, author: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
      prisma.academyAuthor.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
      prisma.academyPlan.findMany({ orderBy: [{ featured: "desc" }, { priceCents: "asc" }] }),
      prisma.academyEnrollment.findMany({
        include: {
          user: { include: { academySubscriptions: { include: { plan: true }, orderBy: { updatedAt: "desc" }, take: 1 } } },
          plan: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.academyCertificate.findMany({
        include: {
          user: { select: { id: true, name: true, email: true } },
          lesson: { select: { id: true, title: true } },
        },
        orderBy: { issuedAt: "desc" },
        take: 20,
      }),
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
      authors,
      plans,
      enrollments,
      certificates,
      availableUsers: users.filter((item) => !enrolledUserIds.has(item.id)),
      levels: ACADEMY_LEVELS,
      levelLabels: LEVEL_LABELS,
      contentStatuses: ACADEMY_CONTENT_STATUSES,
      contentStatusLabels: CONTENT_STATUS_LABELS,
    });
  },

  mediaLibrary: async (req, res) => {
    const media = await prisma.academyMedia.findMany({
      include: {
        lesson: { select: { id: true, title: true } },
        author: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 120,
    });

    res.render("academy/admin/media-library", {
      pageTitle: "Mídia Academy - CatBreeder Pro",
      user: req.user,
      academy: await getAcademyContext(prisma, req),
      media,
    });
  },

  uploadMedia: async (req, res) => {
    if (!req.file) {
      return res.redirect(req.get("Referer") || "/academy/admin/midia");
    }

    const lessonId = req.body.lessonId ? Number(req.body.lessonId) : null;
    const authorId = req.body.authorId ? Number(req.body.authorId) : null;
    const url = `/uploads/academy/${req.file.filename}`;

    await prisma.academyMedia.create({
      data: {
        ownerId: req.user.id,
        lessonId,
        authorId,
        type: req.body.type || academyMediaTypeForMime(req.file.mimetype),
        title: req.body.title || req.file.originalname,
        url,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        altText: req.body.altText || null,
        metadataJson: req.body.metadataJson || null,
      },
    });

    res.redirect(req.get("Referer") || "/academy/admin/midia");
  },

  updateMedia: async (req, res) => {
    await prisma.academyMedia.update({
      where: { id: Number(req.params.id) },
      data: {
        title: req.body.title || null,
        altText: req.body.altText || null,
        type: req.body.type || "FILE",
      },
    });
    res.redirect(req.get("Referer") || "/academy/admin/midia");
  },

  deleteMedia: async (req, res) => {
    await prisma.academyMedia.delete({ where: { id: Number(req.params.id) } });
    res.redirect(req.get("Referer") || "/academy/admin/midia");
  },

  seedFoundation: async (req, res) => {
    await seedAcademyFoundation(prisma);
    res.redirect("/academy/admin");
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

  createAuthor: async (req, res) => {
    await prisma.academyAuthor.create({
      data: {
        userId: req.body.userId ? Number(req.body.userId) : null,
        name: req.body.name,
        slug: cleanSlug(req.body.name, req.body.slug),
        bio: req.body.bio || null,
        photoUrl: req.body.photoUrl || null,
        specialty: req.body.specialty || null,
        breedFocus: req.body.breedFocus || null,
        socialLinksJson: req.body.socialLinksJson || null,
        active: toBool(req.body.active),
      },
    });
    res.redirect("/academy/admin");
  },

  updateAuthor: async (req, res) => {
    await prisma.academyAuthor.update({
      where: { id: Number(req.params.id) },
      data: {
        userId: req.body.userId ? Number(req.body.userId) : null,
        name: req.body.name,
        slug: cleanSlug(req.body.name, req.body.slug),
        bio: req.body.bio || null,
        photoUrl: req.body.photoUrl || null,
        specialty: req.body.specialty || null,
        breedFocus: req.body.breedFocus || null,
        socialLinksJson: req.body.socialLinksJson || null,
        active: toBool(req.body.active),
      },
    });
    res.redirect("/academy/admin");
  },

  deleteAuthor: async (req, res) => {
    await prisma.academyAuthor.delete({ where: { id: Number(req.params.id) } });
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

  editLesson: async (req, res) => {
    const lessonId = Number(req.params.id);
    const [lesson, modules, authors, lessons, mediaLibrary] = await Promise.all([
      prisma.academyLesson.findUnique({
        where: { id: lessonId },
        include: {
          author: true,
          media: { orderBy: { createdAt: "desc" } },
          module: { include: { category: true } },
        },
      }),
      prisma.academyModule.findMany({ include: { category: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
      prisma.academyAuthor.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.academyLesson.findMany({
        where: { NOT: { id: lessonId } },
        select: { id: true, title: true, module: { select: { title: true } } },
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      }),
      prisma.academyMedia.findMany({
        where: { OR: [{ lessonId: null }, { lessonId }] },
        orderBy: { createdAt: "desc" },
        take: 60,
      }),
    ]);

    if (!lesson) return res.status(404).send("Aula não encontrada.");

    res.render("academy/admin/lesson-editor", {
      pageTitle: `${lesson.title} - Editor Academy`,
      user: req.user,
      academy: await getAcademyContext(prisma, req),
      lesson,
      modules,
      authors,
      lessons,
      mediaLibrary,
      levels: ACADEMY_LEVELS,
      levelLabels: LEVEL_LABELS,
      contentStatuses: ACADEMY_CONTENT_STATUSES,
      contentStatusLabels: CONTENT_STATUS_LABELS,
    });
  },

  saveLessonEditor: async (req, res) => {
    await prisma.academyLesson.update({
      where: { id: Number(req.params.id) },
      data: lessonPayloadFromBody(req.body),
    });
    res.redirect(`/academy/admin/aulas/${req.params.id}/editor`);
  },

  createLesson: async (req, res) => {
    const lesson = await prisma.academyLesson.create({
      data: lessonPayloadFromBody(req.body),
    });
    res.redirect(`/academy/admin/aulas/${lesson.id}/editor`);
  },

  updateLesson: async (req, res) => {
    await prisma.academyLesson.update({
      where: { id: Number(req.params.id) },
      data: lessonPayloadFromBody(req.body),
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
        accessLevel: req.body.accessLevel || ACADEMY_LEVELS.STUDENT,
        featured: toBool(req.body.featured),
        active: toBool(req.body.active),
        checkoutProvider: req.body.checkoutProvider || null,
        checkoutMetadataJson: req.body.checkoutMetadataJson || null,
        featuresJson: req.body.featuresJson || null,
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
        accessLevel: req.body.accessLevel || ACADEMY_LEVELS.STUDENT,
        featured: toBool(req.body.featured),
        active: toBool(req.body.active),
        checkoutProvider: req.body.checkoutProvider || null,
        checkoutMetadataJson: req.body.checkoutMetadataJson || null,
        featuresJson: req.body.featuresJson || null,
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
    if (req.body.planId) {
      await prisma.academySubscription.create({
        data: {
          userId,
          planId: Number(req.body.planId),
          status: req.body.status || "ACTIVE",
          provider: "MANUAL",
          startedAt: req.body.startedAt ? new Date(req.body.startedAt) : new Date(),
          currentPeriodStart: req.body.currentPeriodStart ? new Date(req.body.currentPeriodStart) : new Date(),
          currentPeriodEnd: req.body.currentPeriodEnd ? new Date(req.body.currentPeriodEnd) : null,
          metadataJson: req.body.metadataJson || null,
        },
      });
    }
    res.redirect("/academy/admin");
  },

  updateEnrollment: async (req, res) => {
    const enrollment = await prisma.academyEnrollment.update({
      where: { id: Number(req.params.id) },
      data: {
        level: req.body.level || ACADEMY_LEVELS.STUDENT,
        status: req.body.status || "ACTIVE",
        planId: req.body.planId ? Number(req.body.planId) : null,
      },
    });
    if (req.body.planId) {
      const existingSubscription = await prisma.academySubscription.findFirst({
        where: { userId: enrollment.userId, provider: "MANUAL" },
        orderBy: { updatedAt: "desc" },
      });
      const data = {
        planId: Number(req.body.planId),
        status: req.body.subscriptionStatus || req.body.status || "ACTIVE",
        provider: "MANUAL",
        startedAt: req.body.startedAt ? new Date(req.body.startedAt) : null,
        currentPeriodStart: req.body.currentPeriodStart ? new Date(req.body.currentPeriodStart) : null,
        currentPeriodEnd: req.body.currentPeriodEnd ? new Date(req.body.currentPeriodEnd) : null,
        metadataJson: req.body.metadataJson || null,
      };
      if (existingSubscription) {
        await prisma.academySubscription.update({ where: { id: existingSubscription.id }, data });
      } else {
        await prisma.academySubscription.create({ data: { ...data, userId: enrollment.userId } });
      }
    }
    res.redirect("/academy/admin");
  },
});
