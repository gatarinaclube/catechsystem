const {
  ACADEMY_CONTENT_STATUSES,
  ACADEMY_LEVELS,
  CONTENT_STATUS_LABELS,
  LEVEL_LABELS,
  getAcademyContext,
  slugify,
} = require("../services/academyService");
const { academyMediaTypeForMime } = require("../middlewares/academyUpload");

function cleanSlug(title, slug) {
  return slugify(slug || title);
}

function expertLessonPayload(body, authorId) {
  const status =
    body.status === ACADEMY_CONTENT_STATUSES.REVIEW
      ? ACADEMY_CONTENT_STATUSES.REVIEW
      : ACADEMY_CONTENT_STATUSES.DRAFT;

  return {
    moduleId: Number(body.moduleId),
    authorId,
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
    published: false,
    metaTitle: body.metaTitle || null,
    metaDescription: body.metaDescription || null,
    ogImageUrl: body.ogImageUrl || null,
  };
}

async function getAuthorOrFail(prisma, req, res) {
  const academy = await getAcademyContext(prisma, req);
  if (academy.isAdmin && req.query.authorId) {
    const selectedAuthor = await prisma.academyAuthor.findUnique({
      where: { id: Number(req.query.authorId) },
    });
    if (selectedAuthor) return { academy, author: selectedAuthor };
  }
  if (!academy.author && !academy.isAdmin) {
    res.status(403).send("Especialista não vinculado ao seu usuário.");
    return null;
  }
  return { academy, author: academy.author };
}

module.exports = (prisma) => ({
  dashboard: async (req, res) => {
    const context = await getAuthorOrFail(prisma, req, res);
    if (!context) return;
    const { academy, author } = context;

    const where = academy.isAdmin && !author ? {} : { authorId: author.id };
    const [lessons, modules, authors] = await Promise.all([
      prisma.academyLesson.findMany({
        where,
        include: { module: { include: { category: true } } },
        orderBy: [{ updatedAt: "desc" }],
      }),
      prisma.academyModule.findMany({
        where: { published: true },
        include: { category: true },
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      }),
      academy.isAdmin ? prisma.academyAuthor.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [],
    ]);

    res.render("academy/expert/dashboard", {
      pageTitle: "Especialista - CatBreeder Pro",
      user: req.user,
      academy,
      author,
      authors,
      lessons,
      modules,
      contentStatusLabels: CONTENT_STATUS_LABELS,
    });
  },

  newLesson: async (req, res) => {
    const context = await getAuthorOrFail(prisma, req, res);
    if (!context) return;
    const { academy, author } = context;
    const modules = await prisma.academyModule.findMany({
      where: { published: true },
      include: { category: true },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });

    res.render("academy/expert/lesson-form", {
      pageTitle: "Nova aula - Especialista",
      user: req.user,
      academy,
      author,
      lesson: null,
      modules,
      levels: ACADEMY_LEVELS,
      levelLabels: LEVEL_LABELS,
      contentStatuses: ACADEMY_CONTENT_STATUSES,
      contentStatusLabels: CONTENT_STATUS_LABELS,
    });
  },

  createLesson: async (req, res) => {
    const context = await getAuthorOrFail(prisma, req, res);
    if (!context) return;
    if (!context.author) return res.status(400).send("Selecione ou vincule um especialista antes de criar aulas.");
    const lesson = await prisma.academyLesson.create({
      data: expertLessonPayload(req.body, context.author.id),
    });
    res.redirect(`/academy/especialista/aulas/${lesson.id}`);
  },

  editLesson: async (req, res) => {
    const context = await getAuthorOrFail(prisma, req, res);
    if (!context) return;
    const { academy, author } = context;
    const lesson = await prisma.academyLesson.findFirst({
      where: academy.isAdmin ? { id: Number(req.params.id) } : { id: Number(req.params.id), authorId: author.id },
      include: { media: { orderBy: { createdAt: "desc" } } },
    });
    if (!lesson) return res.status(404).send("Aula não encontrada.");

    const modules = await prisma.academyModule.findMany({
      where: { published: true },
      include: { category: true },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });

    res.render("academy/expert/lesson-form", {
      pageTitle: `${lesson.title} - Especialista`,
      user: req.user,
      academy,
      author,
      lesson,
      modules,
      levels: ACADEMY_LEVELS,
      levelLabels: LEVEL_LABELS,
      contentStatuses: ACADEMY_CONTENT_STATUSES,
      contentStatusLabels: CONTENT_STATUS_LABELS,
    });
  },

  updateLesson: async (req, res) => {
    const context = await getAuthorOrFail(prisma, req, res);
    if (!context) return;
    const { academy, author } = context;
    const lesson = await prisma.academyLesson.findFirst({
      where: academy.isAdmin ? { id: Number(req.params.id) } : { id: Number(req.params.id), authorId: author.id },
    });
    if (!lesson) return res.status(404).send("Aula não encontrada.");

    await prisma.academyLesson.update({
      where: { id: lesson.id },
      data: expertLessonPayload(req.body, lesson.authorId || author.id),
    });
    res.redirect(`/academy/especialista/aulas/${lesson.id}`);
  },

  uploadLessonMedia: async (req, res) => {
    const context = await getAuthorOrFail(prisma, req, res);
    if (!context || !req.file) return res.redirect(req.get("Referer") || "/academy/especialista");
    const { academy, author } = context;
    const lesson = await prisma.academyLesson.findFirst({
      where: academy.isAdmin ? { id: Number(req.params.id) } : { id: Number(req.params.id), authorId: author.id },
    });
    if (!lesson) return res.status(404).send("Aula não encontrada.");

    await prisma.academyMedia.create({
      data: {
        ownerId: req.user.id,
        authorId: lesson.authorId || author.id,
        lessonId: lesson.id,
        type: req.body.type || academyMediaTypeForMime(req.file.mimetype),
        title: req.body.title || req.file.originalname,
        url: `/uploads/academy/${req.file.filename}`,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        altText: req.body.altText || null,
      },
    });
    res.redirect(`/academy/especialista/aulas/${lesson.id}`);
  },
});
