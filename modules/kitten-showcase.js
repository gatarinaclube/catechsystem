const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const {
  getFileUploadLimit,
  getCreationLimits,
  validateFilesForRole,
} = require("../utils/planLimits");

const SHOWCASE_UPLOAD_LIMIT = getFileUploadLimit("ADMIN");
const DEFAULT_SHOWCASE_THEME = {
  backgroundColor: "#f5f7f3",
  cardColor: "#ffffff",
  textColor: "#1f2933",
  accentColor: "#8a5a20",
};

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
  "vitrine",
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
    limits: { fileSize: SHOWCASE_UPLOAD_LIMIT.bytes, files: 80 },
    fileFilter: (req, file, cb) => {
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      const isAboutPdf = file.fieldname === "aboutPdf" && file.mimetype === "application/pdf";
      const accepted = allowed.includes(file.mimetype) || isAboutPdf;
      cb(accepted ? null : new Error("Envie imagens na vitrine e PDF apenas na apresentação do gatil."), accepted);
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

function normalizeUrl(value) {
  const text = compact(value);
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}

function normalizeWhatsappUrl(value) {
  const text = compact(value);
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  const digits = text.replace(/\D/g, "");
  if (digits) return `https://wa.me/${digits}`;
  return normalizeUrl(text);
}

function normalizeInstallments(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 2) return null;
  return Math.min(number, 24);
}

function normalizeColor(value, fallback) {
  const text = compact(value);
  if (!text) return fallback;
  return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
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
    logoPath: settings?.logoPath || "",
    ...DEFAULT_SHOWCASE_THEME,
    websiteUrl: "",
    instagramUrl: "",
    whatsappUrl: "",
    paymentPix: false,
    paymentCardCash: false,
    paymentCardInstallments: false,
    paymentInstallments: null,
    paymentText: "",
    aboutText: "",
    aboutPdfPath: "",
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
    backgroundColor: showcase.backgroundColor || fallback.backgroundColor,
    cardColor: showcase.cardColor || fallback.cardColor,
    textColor: showcase.textColor || fallback.textColor,
    accentColor: showcase.accentColor || fallback.accentColor,
    paymentText: showcase.paymentText || "",
    aboutText: showcase.aboutText || "",
    aboutPdfPath: showcase.aboutPdfPath || "",
    litters: (showcase.litters || []).map((litter) => ({
      ...litter,
      birthDate: formatDateInput(litter.birthDate),
      deliveryForecast: formatDateInput(litter.deliveryForecast),
      fatherPhotos: [litter.fatherPhoto, litter.fatherPhoto2].filter(Boolean),
      motherPhotos: [litter.motherPhoto, litter.motherPhoto2].filter(Boolean),
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

async function renderPublicShowcase(prisma, req, res, next, rawSlug) {
  try {
    const slug = slugify(rawSlug);
    if (!slug || RESERVED_SLUGS.has(slug)) {
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

    return res.render("kitten-showcase/public", {
      showcase,
      settings: showcase.owner?.settings || null,
      litters,
      hasPaymentInfo: Boolean(
        showcase.paymentPix ||
        showcase.paymentCardCash ||
        showcase.paymentCardInstallments ||
        compact(showcase.paymentText)
      ),
      hasAboutInfo: Boolean(compact(showcase.aboutText) || compact(showcase.aboutPdfPath)),
    });
  } catch (err) {
    return next(err);
  }
}

function publicRouter(prisma) {
  const router = express.Router();

  router.get("/vitrine/:slug", async (req, res, next) => {
    return renderPublicShowcase(prisma, req, res, next, req.params.slug);
  });

  return router;
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

  async function renderAdmin(req, res, options = {}) {
    const settings = await getSettings(req.session.userId);
    const showcase = await getShowcase(req.session.userId);
    const showcaseLitterLimit = getCreationLimits(req.session.userRole).showcaseLitters;
    const publicBaseUrl = `${req.protocol}://${req.get("host")}/vitrine`;

    return res.status(options.status || 200).render("kitten-showcase/admin", {
      user: req.user,
      currentPath: "/admin/vitrine-filhotes",
      showcase: shapeShowcase(showcase, settings, req.user),
      showcaseLimits: {
        litters: showcaseLitterLimit,
        littersLabel: showcaseLitterLimit === null
          ? "Ilimitado"
          : `${showcaseLitterLimit} ninhada${showcaseLitterLimit === 1 ? "" : "s"} por vez`,
        littersNote: showcaseLitterLimit === 1
          ? "Seu perfil permite manter 1 ninhada publicada na vitrine. Ninhadas ocultas ficam salvas e não entram neste limite."
          : null,
      },
      publicBaseUrl,
      error: options.error || null,
      success: options.success || false,
    });
  }

  function uploadShowcaseFiles(req, res, next) {
    upload.any()(req, res, async (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        try {
          return renderAdmin(req, res, {
            status: 413,
            error: `Uma das imagens ultrapassa ${SHOWCASE_UPLOAD_LIMIT.label}. Reduza o tamanho da foto e tente novamente.`,
          });
        } catch (renderErr) {
          return next(renderErr);
        }
      }

      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_COUNT") {
        try {
          return renderAdmin(req, res, {
            status: 413,
            error: "Envie no máximo 80 imagens por vez.",
          });
        } catch (renderErr) {
          return next(renderErr);
        }
      }

      if (err.message) {
        try {
          return renderAdmin(req, res, {
            status: 400,
            error: err.message,
          });
        } catch (renderErr) {
          return next(renderErr);
        }
      }

      return next(err);
    });
  }

  router.get("/admin/vitrine-filhotes", requireAuth, requirePermission("showcase.manage"), async (req, res, next) => {
    try {
      return renderAdmin(req, res, { success: req.query.ok === "1" });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/admin/vitrine-filhotes",
    requireAuth,
    requirePermission("showcase.manage"),
    uploadShowcaseFiles,
    async (req, res, next) => {
      try {
        const uploaded = filesByField(req.files || []);
        const payload = JSON.parse(req.body.payload || "{}");
        const settings = await getSettings(req.session.userId);
        const fallback = emptyShowcase(settings, req.user);
        const slug = slugify(payload.slug || fallback.slug);
        validateFilesForRole(req.files || [], req.session.userRole);
        const logoUpload = uploaded.get("showcaseLogo")?.[0] || null;
        const aboutPdfUpload = uploaded.get("aboutPdf")?.[0] || null;

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
        const showcaseLitterLimit = getCreationLimits(req.session.userRole).showcaseLitters;
        const publishedLitters = litters.filter((litter) => litter.published !== false);
        if (showcaseLitterLimit !== null && publishedLitters.length > showcaseLitterLimit) {
          throw new Error(`Seu perfil permite até ${showcaseLitterLimit} ninhada${showcaseLitterLimit === 1 ? "" : "s"} publicada${showcaseLitterLimit === 1 ? "" : "s"} na vitrine por vez. Ninhadas ocultas não entram neste limite.`);
        }

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
              logoPath: logoUpload || compact(payload.logoPath),
              backgroundColor: normalizeColor(payload.backgroundColor, DEFAULT_SHOWCASE_THEME.backgroundColor),
              cardColor: normalizeColor(payload.cardColor, DEFAULT_SHOWCASE_THEME.cardColor),
              textColor: normalizeColor(payload.textColor, DEFAULT_SHOWCASE_THEME.textColor),
              accentColor: normalizeColor(payload.accentColor, DEFAULT_SHOWCASE_THEME.accentColor),
              websiteUrl: normalizeUrl(payload.websiteUrl),
              instagramUrl: normalizeUrl(payload.instagramUrl),
              whatsappUrl: normalizeWhatsappUrl(payload.whatsappUrl),
              paymentPix: payload.paymentPix === true,
              paymentCardCash: payload.paymentCardCash === true,
              paymentCardInstallments: payload.paymentCardInstallments === true,
              paymentInstallments: payload.paymentCardInstallments === true
                ? normalizeInstallments(payload.paymentInstallments)
                : null,
              paymentText: compact(payload.paymentText),
              aboutText: compact(payload.aboutText),
              aboutPdfPath: aboutPdfUpload || compact(payload.aboutPdfPath),
              published: payload.published === true,
            },
            create: {
              ownerId: req.session.userId,
              slug,
              title: compact(payload.title) || fallback.title,
              intro: compact(payload.intro),
              logoPath: logoUpload || compact(payload.logoPath),
              backgroundColor: normalizeColor(payload.backgroundColor, DEFAULT_SHOWCASE_THEME.backgroundColor),
              cardColor: normalizeColor(payload.cardColor, DEFAULT_SHOWCASE_THEME.cardColor),
              textColor: normalizeColor(payload.textColor, DEFAULT_SHOWCASE_THEME.textColor),
              accentColor: normalizeColor(payload.accentColor, DEFAULT_SHOWCASE_THEME.accentColor),
              websiteUrl: normalizeUrl(payload.websiteUrl),
              instagramUrl: normalizeUrl(payload.instagramUrl),
              whatsappUrl: normalizeWhatsappUrl(payload.whatsappUrl),
              paymentPix: payload.paymentPix === true,
              paymentCardCash: payload.paymentCardCash === true,
              paymentCardInstallments: payload.paymentCardInstallments === true,
              paymentInstallments: payload.paymentCardInstallments === true
                ? normalizeInstallments(payload.paymentInstallments)
                : null,
              paymentText: compact(payload.paymentText),
              aboutText: compact(payload.aboutText),
              aboutPdfPath: aboutPdfUpload || compact(payload.aboutPdfPath),
              published: payload.published === true,
            },
          });

          await tx.catteryShowcaseLitter.deleteMany({
            where: { showcaseId: showcase.id },
          });

          for (const [litterIndex, litter] of litters.entries()) {
            const litterKey = litter.key;
            const fatherUploads = uploaded.get(`fatherPhotos_${litterKey}`) || [];
            const motherUploads = uploaded.get(`motherPhotos_${litterKey}`) || [];
            const fatherPhotos = [
              ...fatherUploads,
              ...(Array.isArray(litter.fatherPhotos) ? litter.fatherPhotos.map(compact).filter(Boolean) : []),
            ].slice(0, 2);
            const motherPhotos = [
              ...motherUploads,
              ...(Array.isArray(litter.motherPhotos) ? litter.motherPhotos.map(compact).filter(Boolean) : []),
            ].slice(0, 2);
            const savedLitter = await tx.catteryShowcaseLitter.create({
              data: {
                showcaseId: showcase.id,
                birthDate: parseDate(litter.birthDate),
                deliveryForecast: parseDate(litter.deliveryForecast),
                published: litter.published !== false,
                note: compact(litter.note),
                fatherName: compact(litter.fatherName),
                fatherPhoto: fatherPhotos[0] || null,
                fatherPhoto2: fatherPhotos[1] || null,
                fatherColor: compact(litter.fatherColor),
                fatherNote: compact(litter.fatherNote),
                fatherPkdef: compact(litter.fatherPkdef),
                fatherPra: compact(litter.fatherPra),
                fatherHcm: compact(litter.fatherHcm),
                motherName: compact(litter.motherName),
                motherPhoto: motherPhotos[0] || null,
                motherPhoto2: motherPhotos[1] || null,
                motherColor: compact(litter.motherColor),
                motherNote: compact(litter.motherNote),
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
                  note: compact(kitten.note),
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
            return renderAdmin(req, res, { status: 400, error: err.message });
          } catch {
            return next(err);
          }
        }
        next(err);
      }
    }
  );

  router.get("/vitrine/:slug", async (req, res, next) => {
    return renderPublicShowcase(prisma, req, res, next, req.params.slug);
  });

  router.get("/:slug", async (req, res, next) => {
    return renderPublicShowcase(prisma, req, res, next, req.params.slug);
  });

  return router;
};

module.exports.publicRouter = publicRouter;
