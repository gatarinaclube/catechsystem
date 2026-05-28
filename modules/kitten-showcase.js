const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const RESERVED_SLUGS = new Set([
  "admin",
  "academy",
  "api",
  "buscar",
  "cats",
  "dashboard",
  "despesas",
  "ffb-services",
  "login",
  "logout",
  "meus-dados",
  "my-services",
  "register",
  "reset-password",
  "services",
  "settings",
  "uploads",
  "users",
  "vendas",
]);

function createUpload() {
  const uploadsRoot =
    process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");
  const uploadDir = path.join(uploadsRoot, "showcase");

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase();
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
      },
    }),
    limits: { fileSize: 8 * 1024 * 1024, files: 80 },
    fileFilter: (req, file, cb) => {
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      cb(allowed.includes(file.mimetype) ? null : new Error("Envie apenas imagens."), allowed.includes(file.mimetype));
    },
  });
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function formatDateInput(date) {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function publicDate(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(date));
}

function compact(value) {
  const text = String(value || "").trim();
  return text || null;
}

function filesByField(files) {
  const map = new Map();
  for (const file of files || []) {
    if (!map.has(file.fieldname)) map.set(file.fieldname, []);
    map.get(file.fieldname).push(`/uploads/showcase/${file.filename}`);
  }
  return map;
}

function emptyShowcase(settings, user) {
  const catteryName = compact(settings?.catteryName) || compact(user?.fifeCatteryName) || compact(user?.name) || "Meu Gatil";
  return {
    slug: slugify(catteryName) || `gatil-${user.id}`,
    title: catteryName,
    intro: "",
    published: false,
    litters: [],
  };
}

function shapeShowcase(showcase, settings, user) {
  const fallback = emptyShowcase(settings, user);
  if (!showcase) return fallback;

  return {
    ...showcase,
    slug: showcase.slug || fallback.slug,
    title: showcase.title || fallback.title,
    litters: (showcase.litters || []).map((litter) => ({
      ...litter,
      birthDate: formatDateInput(litter.birthDate),
      deliveryForecast: formatDateInput(litter.deliveryForecast),
      kittens: (litter.kittens || []).map((kitten) => ({
        ...kitten,
        photos: (kitten.photos || []).map((photo) => photo.path),
      })),
    })),
  };
}

function sortPublicKittens(kittens) {
  return [...kittens].sort((a, b) => {
    const sexOrder = (a.sex === "M" ? 0 : 1) - (b.sex === "M" ? 0 : 1);
    if (sexOrder !== 0) return sexOrder;
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  });
}

function publicKittenName(kitten, counters) {
  if (kitten.name) return kitten.name;
  const sex = kitten.sex === "M" ? "Macho" : "Femea";
  counters[kitten.sex] = (counters[kitten.sex] || 0) + 1;
  return `${sex} ${String(counters[kitten.sex]).padStart(2, "0")}`;
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();
  const upload = createUpload();

  async function getSettings(userId) {
    return prisma.userSettings.findUnique({ where: { userId } });
  }

  async function getShowcase(ownerId) {
    return prisma.catteryKittenShowcase.findUnique({
      where: { ownerId },
      include: {
        litters: {
          orderBy: [{ birthDate: "asc" }, { id: "asc" }],
          include: {
            kittens: {
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              include: { photos: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
            },
          },
        },
      },
    });
  }

  router.get("/admin/vitrine-filhotes", requireAuth, requirePermission("showcase.manage"), async (req, res, next) => {
    try {
      const settings = await getSettings(req.session.userId);
      const showcase = await getShowcase(req.session.userId);
      const publicBaseUrl = `${req.protocol}://${req.get("host")}`;

      res.render("kitten-showcase/admin", {
        user: req.user,
        currentPath: "/admin/vitrine-filhotes",
        showcase: shapeShowcase(showcase, settings, req.user),
        publicBaseUrl,
        error: null,
        success: req.query.ok === "1",
      });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/admin/vitrine-filhotes",
    requireAuth,
    requirePermission("showcase.manage"),
    upload.any(),
    async (req, res, next) => {
      try {
        const uploaded = filesByField(req.files || []);
        const payload = JSON.parse(req.body.payload || "{}");
        const settings = await getSettings(req.session.userId);
        const fallback = emptyShowcase(settings, req.user);
        const slug = slugify(payload.slug || fallback.slug);

        if (!slug || RESERVED_SLUGS.has(slug)) {
          throw new Error("Informe um link válido para o gatil.");
        }

        const slugOwner = await prisma.catteryKittenShowcase.findUnique({
          where: { slug },
          select: { ownerId: true },
        });
        if (slugOwner && slugOwner.ownerId !== req.session.userId) {
          throw new Error("Este link já está sendo usado por outro gatil.");
        }

        const litters = Array.isArray(payload.litters) ? payload.litters : [];
        for (const litter of litters) {
          if (!parseDate(litter.birthDate) || !parseDate(litter.deliveryForecast)) {
            throw new Error("Data de nascimento e previsão de entrega são obrigatórias em todas as ninhadas.");
          }
          if (!compact(litter.fatherName) || !compact(litter.motherName)) {
            throw new Error("Nome do pai e nome da mãe são obrigatórios em todas as ninhadas.");
          }
          for (const kitten of litter.kittens || []) {
            if (!["M", "F"].includes(kitten.sex)) {
              throw new Error("Informe o sexo de todos os filhotes.");
            }
          }
        }

        await prisma.$transaction(async (tx) => {
          const showcase = await tx.catteryKittenShowcase.upsert({
            where: { ownerId: req.session.userId },
            update: {
              slug,
              title: compact(payload.title) || fallback.title,
              intro: compact(payload.intro),
              published: payload.published === true,
            },
            create: {
              ownerId: req.session.userId,
              slug,
              title: compact(payload.title) || fallback.title,
              intro: compact(payload.intro),
              published: payload.published === true,
            },
          });

          await tx.catteryShowcaseLitter.deleteMany({
            where: { showcaseId: showcase.id },
          });

          for (const [litterIndex, litter] of litters.entries()) {
            const litterKey = litter.key;
            const fatherUpload = uploaded.get(`fatherPhoto_${litterKey}`)?.[0] || null;
            const motherUpload = uploaded.get(`motherPhoto_${litterKey}`)?.[0] || null;
            const savedLitter = await tx.catteryShowcaseLitter.create({
              data: {
                showcaseId: showcase.id,
                birthDate: parseDate(litter.birthDate),
                deliveryForecast: parseDate(litter.deliveryForecast),
                published: litter.published !== false,
                fatherName: compact(litter.fatherName),
                fatherPhoto: fatherUpload || compact(litter.fatherPhoto),
                fatherColor: compact(litter.fatherColor),
                fatherPkdef: compact(litter.fatherPkdef),
                fatherPra: compact(litter.fatherPra),
                fatherHcm: compact(litter.fatherHcm),
                motherName: compact(litter.motherName),
                motherPhoto: motherUpload || compact(litter.motherPhoto),
                motherColor: compact(litter.motherColor),
                motherPkdef: compact(litter.motherPkdef),
                motherPra: compact(litter.motherPra),
                motherHcm: compact(litter.motherHcm),
                sortOrder: litterIndex,
              },
            });

            const kittens = Array.isArray(litter.kittens) ? litter.kittens : [];
            for (const [kittenIndex, kitten] of kittens.entries()) {
              const savedKitten = await tx.catteryShowcaseKitten.create({
                data: {
                  litterId: savedLitter.id,
                  name: compact(kitten.name),
                  color: compact(kitten.color),
                  sex: kitten.sex,
                  available: kitten.available !== false,
                  sortOrder: kittenIndex,
                },
              });

              const newPhotos = uploaded.get(`kittenPhotos_${kitten.key}`) || [];
              const existingPhotos = Array.isArray(kitten.photos) ? kitten.photos.map(compact).filter(Boolean) : [];
              const photos = [...newPhotos, ...existingPhotos];
              for (const [photoIndex, photoPath] of photos.entries()) {
                await tx.catteryShowcasePhoto.create({
                  data: {
                    kittenId: savedKitten.id,
                    path: photoPath,
                    sortOrder: photoIndex,
                  },
                });
              }
            }
          }
        });

        res.redirect("/admin/vitrine-filhotes?ok=1");
      } catch (err) {
        if (err.message && !err.code) {
          try {
            const settings = await getSettings(req.session.userId);
            const publicBaseUrl = `${req.protocol}://${req.get("host")}`;
            return res.status(400).render("kitten-showcase/admin", {
              user: req.user,
              currentPath: "/admin/vitrine-filhotes",
              showcase: shapeShowcase(null, settings, req.user),
              publicBaseUrl,
              error: err.message,
              success: false,
            });
          } catch {
            return next(err);
          }
        }
        next(err);
      }
    }
  );

  router.get("/:slug", async (req, res, next) => {
    try {
      const slug = slugify(req.params.slug);
      if (!slug || slug !== req.params.slug || RESERVED_SLUGS.has(slug)) {
        return next();
      }

      const showcase = await prisma.catteryKittenShowcase.findUnique({
        where: { slug },
        include: {
          owner: { include: { settings: true } },
          litters: {
            where: { published: true },
            orderBy: [{ birthDate: "asc" }, { id: "asc" }],
            include: {
              kittens: {
                where: { available: true },
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                include: { photos: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
              },
            },
          },
        },
      });

      if (!showcase || !showcase.published) return next();

      const litters = showcase.litters.map((litter) => {
        const counters = { M: 0, F: 0 };
        return {
          ...litter,
          birthDateLabel: publicDate(litter.birthDate),
          deliveryForecastLabel: publicDate(litter.deliveryForecast),
          kittens: sortPublicKittens(litter.kittens).map((kitten) => ({
            ...kitten,
            displayName: publicKittenName(kitten, counters),
          })),
        };
      });

      res.render("kitten-showcase/public", {
        showcase,
        settings: showcase.owner?.settings || null,
        litters,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
