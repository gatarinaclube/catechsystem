function certificateNumber(userId, lessonId) {
  const year = new Date().getFullYear();
  return `CBP-${year}-${String(userId).padStart(5, "0")}-${String(lessonId).padStart(5, "0")}`;
}

async function issueLessonCertificate(prisma, userId, lessonId) {
  const lesson = await prisma.academyLesson.findUnique({
    where: { id: lessonId },
    select: { id: true, title: true },
  });
  if (!lesson) return null;

  const number = certificateNumber(userId, lessonId);
  return prisma.academyCertificate.upsert({
    where: { certificateNumber: number },
    create: {
      userId,
      lessonId,
      title: `Conclusão - ${lesson.title}`,
      certificateNumber: number,
      metadataJson: JSON.stringify({ type: "LESSON_COMPLETION" }),
    },
    update: {},
  });
}

async function listUserCertificates(prisma, userId) {
  return prisma.academyCertificate.findMany({
    where: { userId },
    include: {
      lesson: {
        include: {
          module: {
            include: { category: true },
          },
        },
      },
    },
    orderBy: { issuedAt: "desc" },
  });
}

module.exports = {
  certificateNumber,
  issueLessonCertificate,
  listUserCertificates,
};
