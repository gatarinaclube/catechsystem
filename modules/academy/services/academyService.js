const ACADEMY_LEVELS = {
  VISITOR: "VISITOR",
  STUDENT: "STUDENT",
  PREMIUM: "PREMIUM",
  GATARINA_ASSOCIATE: "GATARINA_ASSOCIATE",
  PARTNER_CREATOR: "PARTNER_CREATOR",
  GUEST_EXPERT: "GUEST_EXPERT",
  ADMIN: "ADMIN",
};

const LEVEL_LABELS = {
  VISITOR: "Visitante",
  STUDENT: "Aluno",
  PREMIUM: "Premium",
  GATARINA_ASSOCIATE: "Associado Gatarina",
  PARTNER_CREATOR: "Criador parceiro",
  GUEST_EXPERT: "Especialista convidado",
  ADMIN: "Administrador",
};

const PAID_ENROLLMENT_STATUSES = new Set(["ACTIVE", "PAID", "TRIALING"]);
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["ACTIVE", "PAID", "TRIALING"]);

const ACADEMY_CONTENT_STATUSES = {
  DRAFT: "DRAFT",
  REVIEW: "REVIEW",
  PUBLISHED: "PUBLISHED",
};

const CONTENT_STATUS_LABELS = {
  DRAFT: "Rascunho",
  REVIEW: "Revisão",
  PUBLISHED: "Publicado",
};

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function toBool(value) {
  return value === "on" || value === "true" || value === true;
}

function canAccessLevel(userLevel, contentLevel) {
  const order = [
    ACADEMY_LEVELS.VISITOR,
    ACADEMY_LEVELS.STUDENT,
    ACADEMY_LEVELS.GATARINA_ASSOCIATE,
    ACADEMY_LEVELS.PARTNER_CREATOR,
    ACADEMY_LEVELS.GUEST_EXPERT,
    ACADEMY_LEVELS.PREMIUM,
    ACADEMY_LEVELS.ADMIN,
  ];
  return order.indexOf(userLevel) >= order.indexOf(contentLevel || ACADEMY_LEVELS.STUDENT);
}

async function getEnrollment(prisma, userId) {
  if (!userId) return null;
  return prisma.academyEnrollment.findUnique({
    where: { userId },
    include: { plan: true },
  });
}

async function getActiveSubscription(prisma, userId) {
  if (!userId) return null;
  const now = new Date();
  const subscriptions = await prisma.academySubscription.findMany({
    where: {
      userId,
      status: { in: Array.from(ACTIVE_SUBSCRIPTION_STATUSES) },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gte: now } }],
    },
    include: { plan: true },
    orderBy: [{ currentPeriodEnd: "desc" }, { updatedAt: "desc" }],
    take: 1,
  });
  return subscriptions[0] || null;
}

async function getAcademyAuthorForUser(prisma, userId) {
  if (!userId) return null;
  return prisma.academyAuthor.findUnique({
    where: { userId },
  });
}

function isAcademyPaidEnrollment(enrollment) {
  if (!enrollment) return false;
  const status = String(enrollment.status || "").toUpperCase();
  const plan = enrollment.plan || null;
  const hasPlan = Boolean(enrollment.planId || plan);
  const planIsActive = plan ? plan.active !== false : true;
  return PAID_ENROLLMENT_STATUSES.has(status) && hasPlan && planIsActive;
}

function isAcademyActiveSubscription(subscription) {
  if (!subscription) return false;
  const status = String(subscription.status || "").toUpperCase();
  const planIsActive = subscription.plan ? subscription.plan.active !== false : true;
  const periodEnd = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
  return ACTIVE_SUBSCRIPTION_STATUSES.has(status) && planIsActive && (!periodEnd || periodEnd >= new Date());
}

function userHasAcademyAccess(user, enrollment, subscription = null) {
  const role = String(user?.role || "").toUpperCase();
  return role === "ADMIN" || role === "PREMIUM" || isAcademyPaidEnrollment(enrollment) || isAcademyActiveSubscription(subscription);
}

function resolveAcademyLevel(user, enrollment, subscription) {
  const role = String(user?.role || "").toUpperCase();
  if (role === "ADMIN") return ACADEMY_LEVELS.ADMIN;
  if (role === "PREMIUM") return ACADEMY_LEVELS.PREMIUM;
  return (
    subscription?.plan?.accessLevel ||
    enrollment?.plan?.accessLevel ||
    enrollment?.level ||
    ACADEMY_LEVELS.VISITOR
  );
}

function isPublishedStatus(status, published) {
  if (status) return status === ACADEMY_CONTENT_STATUSES.PUBLISHED;
  return Boolean(published);
}

async function getAcademyContext(prisma, req) {
  if (!req.user?.id) {
    return {
      level: ACADEMY_LEVELS.VISITOR,
      levelLabel: LEVEL_LABELS.VISITOR,
      enrollment: null,
      isAdmin: false,
      hasMemberAccess: false,
    };
  }

  const isAdmin = req.user.role === "ADMIN";
  const [enrollment, subscription, author] = await Promise.all([
    getEnrollment(prisma, req.user.id),
    getActiveSubscription(prisma, req.user.id),
    getAcademyAuthorForUser(prisma, req.user.id),
  ]);
  const hasMemberAccess = userHasAcademyAccess(req.user, enrollment, subscription);
  const level = hasMemberAccess ? resolveAcademyLevel(req.user, enrollment, subscription) : ACADEMY_LEVELS.VISITOR;

  return {
    level,
    levelLabel: LEVEL_LABELS[level] || LEVEL_LABELS.STUDENT,
    enrollment,
    subscription,
    author,
    isAdmin,
    canContribute: isAdmin || Boolean(author?.active),
    hasMemberAccess,
  };
}

async function ensureEnrollment(prisma, userId, level = ACADEMY_LEVELS.STUDENT) {
  return prisma.academyEnrollment.upsert({
    where: { userId },
    create: { userId, level },
    update: {},
  });
}

async function getPublishedCatalog(prisma, level = ACADEMY_LEVELS.VISITOR) {
  const categories = await prisma.academyCategory.findMany({
    where: { published: true },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    include: {
      modules: {
        where: { published: true },
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
        include: {
          lessons: {
            where: { published: true, status: ACADEMY_CONTENT_STATUSES.PUBLISHED },
            orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
          },
        },
      },
    },
  });

  return categories.map((category) => ({
    ...category,
    modules: category.modules.map((module) => ({
      ...module,
      locked: !canAccessLevel(level, module.level),
      lessons: module.lessons.map((lesson) => ({
        ...lesson,
        locked: !canAccessLevel(level, lesson.level),
      })),
    })),
  }));
}

async function getMemberDashboard(prisma, userId, level) {
  const catalog = await getPublishedCatalog(prisma, level);
  const flatLessons = catalog.flatMap((category) =>
    category.modules.flatMap((module) =>
      module.lessons.map((lesson) => ({
        ...lesson,
        categoryTitle: category.title,
        categorySlug: category.slug,
        moduleTitle: module.title,
        moduleSlug: module.slug,
        moduleLocked: module.locked,
      }))
    )
  );
  const lessonIds = flatLessons.map((lesson) => lesson.id);
  const progress = lessonIds.length
    ? await prisma.academyProgress.findMany({
        where: { userId, lessonId: { in: lessonIds } },
        orderBy: { lastSeenAt: "desc" },
      })
    : [];
  const favorites = lessonIds.length
    ? await prisma.academyFavorite.findMany({ where: { userId, lessonId: { in: lessonIds } } })
    : [];
  const completedSet = new Set(progress.filter((item) => item.completed).map((item) => item.lessonId));
  const favoriteSet = new Set(favorites.map((item) => item.lessonId));
  const totalLessons = lessonIds.length;
  const completedLessons = completedSet.size;
  const progressByLesson = new Map(progress.map((item) => [item.lessonId, item]));
  const enrichedLessons = flatLessons.map((lesson) => ({
    ...lesson,
    completed: completedSet.has(lesson.id),
    favorite: favoriteSet.has(lesson.id),
    progress: progressByLesson.get(lesson.id) || null,
  }));
  const accessibleLessons = enrichedLessons.filter((lesson) => !lesson.locked && !lesson.moduleLocked);
  const inProgressLessons = accessibleLessons
    .filter((lesson) => lesson.progress && !lesson.completed)
    .sort((a, b) => new Date(b.progress.lastSeenAt) - new Date(a.progress.lastSeenAt))
    .slice(0, 4);
  const recommendedLessons = accessibleLessons
    .filter((lesson) => !lesson.completed && !lesson.progress)
    .slice(0, 6);
  const latestLessons = accessibleLessons
    .slice()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .slice(0, 4);
  const recentFavorites = accessibleLessons
    .filter((lesson) => lesson.favorite)
    .slice(0, 4);
  const nextLesson = inProgressLessons[0] || recommendedLessons[0] || accessibleLessons.find((lesson) => !lesson.completed) || null;
  const catalogWithProgress = catalog.map((category) => ({
    ...category,
    modules: category.modules.map((module) => ({
      ...module,
      lessons: module.lessons.map((lesson) => ({
        ...lesson,
        completed: completedSet.has(lesson.id),
        favorite: favoriteSet.has(lesson.id),
        progress: progressByLesson.get(lesson.id) || null,
      })),
    })),
  }));
  const learningPaths = buildLearningPaths(catalogWithProgress);

  return {
    catalog: catalogWithProgress,
    totalLessons,
    completedLessons,
    progressPercent: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
    favoriteCount: favoriteSet.size,
    nextLesson,
    learningPaths,
    inProgressLessons,
    recommendedLessons,
    latestLessons,
    recentFavorites,
    accessibleLessonCount: accessibleLessons.length,
  };
}

function buildLearningPaths(catalog) {
  return catalog.map((category) => {
    const modules = category.modules.map((module) => {
      const lessons = module.lessons.map((lesson) => ({
        ...lesson,
        effectivelyLocked: Boolean(module.locked || lesson.locked),
      }));
      const totalLessons = lessons.length;
      const completedLessons = lessons.filter((lesson) => lesson.completed).length;
      const availableLessons = lessons.filter((lesson) => !lesson.effectivelyLocked).length;
      const nextLesson = lessons.find((lesson) => !lesson.effectivelyLocked && !lesson.completed) || null;

      return {
        ...module,
        lessons,
        totalLessons,
        completedLessons,
        availableLessons,
        progressPercent: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
        nextLesson,
      };
    });
    const lessons = modules.flatMap((module) => module.lessons);
    const totalLessons = lessons.length;
    const completedLessons = lessons.filter((lesson) => lesson.completed).length;
    const lockedLessons = lessons.filter((lesson) => lesson.effectivelyLocked).length;
    const nextLesson = modules.map((module) => module.nextLesson).find(Boolean) || null;
    const activeModule = modules.find((module) => module.nextLesson) || modules.find((module) => module.totalLessons) || null;

    return {
      ...category,
      modules,
      totalLessons,
      completedLessons,
      lockedLessons,
      availableLessons: totalLessons - lockedLessons,
      progressPercent: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
      nextLesson,
      activeModule,
      completed: totalLessons > 0 && completedLessons === totalLessons,
    };
  });
}

async function getLearningPaths(prisma, userId, level) {
  const dashboard = await getMemberDashboard(prisma, userId, level);
  return dashboard.learningPaths;
}

async function getAdminOverview(prisma) {
  const [categories, modules, lessons, authors, media, subscriptions, certificates, plans, enrollments] = await Promise.all([
    prisma.academyCategory.count(),
    prisma.academyModule.count(),
    prisma.academyLesson.count(),
    prisma.academyAuthor.count(),
    prisma.academyMedia.count(),
    prisma.academySubscription.count(),
    prisma.academyCertificate.count(),
    prisma.academyPlan.count(),
    prisma.academyEnrollment.count(),
  ]);

  return { categories, modules, lessons, authors, media, subscriptions, certificates, plans, enrollments };
}

module.exports = {
  ACADEMY_LEVELS,
  LEVEL_LABELS,
  ACADEMY_CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  slugify,
  toBool,
  canAccessLevel,
  isPublishedStatus,
  getEnrollment,
  getActiveSubscription,
  getAcademyAuthorForUser,
  isAcademyPaidEnrollment,
  isAcademyActiveSubscription,
  userHasAcademyAccess,
  resolveAcademyLevel,
  getAcademyContext,
  ensureEnrollment,
  getPublishedCatalog,
  getMemberDashboard,
  getLearningPaths,
  getAdminOverview,
};
