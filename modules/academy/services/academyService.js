const ACADEMY_LEVELS = {
  VISITOR: "VISITOR",
  STUDENT: "STUDENT",
  PREMIUM: "PREMIUM",
  GATARINA_ASSOCIATE: "GATARINA_ASSOCIATE",
  ADMIN: "ADMIN",
};

const LEVEL_LABELS = {
  VISITOR: "Visitante",
  STUDENT: "Aluno",
  PREMIUM: "Premium",
  GATARINA_ASSOCIATE: "Associado Gatarina",
  ADMIN: "Administrador",
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

async function getAcademyContext(prisma, req) {
  if (!req.user?.id) {
    return {
      level: ACADEMY_LEVELS.VISITOR,
      levelLabel: LEVEL_LABELS.VISITOR,
      enrollment: null,
      isAdmin: false,
    };
  }

  const isAdmin = req.user.role === "ADMIN";
  const enrollment = await getEnrollment(prisma, req.user.id);
  const level = isAdmin ? ACADEMY_LEVELS.ADMIN : enrollment?.level || ACADEMY_LEVELS.STUDENT;

  return {
    level,
    levelLabel: LEVEL_LABELS[level] || LEVEL_LABELS.STUDENT,
    enrollment,
    isAdmin,
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
            where: { published: true },
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
  const lessonIds = catalog.flatMap((category) =>
    category.modules.flatMap((module) => module.lessons.map((lesson) => lesson.id))
  );
  const progress = lessonIds.length
    ? await prisma.academyProgress.findMany({ where: { userId, lessonId: { in: lessonIds } } })
    : [];
  const favorites = lessonIds.length
    ? await prisma.academyFavorite.findMany({ where: { userId, lessonId: { in: lessonIds } } })
    : [];
  const completedSet = new Set(progress.filter((item) => item.completed).map((item) => item.lessonId));
  const favoriteSet = new Set(favorites.map((item) => item.lessonId));
  const totalLessons = lessonIds.length;
  const completedLessons = completedSet.size;

  return {
    catalog: catalog.map((category) => ({
      ...category,
      modules: category.modules.map((module) => ({
        ...module,
        lessons: module.lessons.map((lesson) => ({
          ...lesson,
          completed: completedSet.has(lesson.id),
          favorite: favoriteSet.has(lesson.id),
        })),
      })),
    })),
    totalLessons,
    completedLessons,
    progressPercent: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
    favoriteCount: favoriteSet.size,
  };
}

async function getAdminOverview(prisma) {
  const [categories, modules, lessons, plans, enrollments] = await Promise.all([
    prisma.academyCategory.count(),
    prisma.academyModule.count(),
    prisma.academyLesson.count(),
    prisma.academyPlan.count(),
    prisma.academyEnrollment.count(),
  ]);

  return { categories, modules, lessons, plans, enrollments };
}

module.exports = {
  ACADEMY_LEVELS,
  LEVEL_LABELS,
  slugify,
  toBool,
  canAccessLevel,
  getAcademyContext,
  ensureEnrollment,
  getPublishedCatalog,
  getMemberDashboard,
  getAdminOverview,
};
