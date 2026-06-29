const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const {
  getFileUploadLimit,
  getCreationLimits,
  validateFilesForRole,
} = require("../utils/planLimits");
const { ROLES, normalizeRole } = require("../utils/access");
const { absoluteUrl, baseSeo, cleanText, organizationSchema } = require("../utils/seo");

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

const ASSOCIATED_SHOWCASE_ROLES = new Set([
  ROLES.ASSOCIADO_B,
  ROLES.ASSOCIADO_A,
  ROLES.ASSOCIADO_PREMIUM,
]);

function createUpload(role) {
  const uploadsRoot =
    process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");
  const uploadDir = path.join(uploadsRoot, "showcase");
  const uploadLimit = getFileUploadLimit(role);

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
    limits: { fileSize: uploadLimit.bytes, files: 80 },
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

function shortText(value, max = 240) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function uniqueList(values, max = 8) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
}

function firstShowcaseImage(showcase, litters) {
  if (showcase.logoPath) return showcase.logoPath;
  for (const litter of litters || []) {
    for (const kitten of litter.kittens || []) {
      const photo = (kitten.photos || [])[0];
      if (photo?.path) return photo.path;
      if (photo?.url) return photo.url;
    }
  }
  return "/logos/catech-icon.png";
}

function buildShowcaseSeo(showcase, settings, litters) {
  const catteryName = cleanText(showcase.title || settings?.catteryName || "Gatil", 80);
  const litterBreeds = uniqueList((litters || []).flatMap((litter) => [
    litter.breed,
    litter.fatherBreed,
    litter.motherBreed,
    ...(litter.kittens || []).map((kitten) => kitten.breed),
  ]));
  const settingsBreeds = uniqueList(safeJsonArray(settings?.breedsJson));
  const breeds = litterBreeds.length ? litterBreeds : settingsBreeds;
  const breedText = breeds.length ? ` de ${breeds.slice(0, 3).join(", ")}` : "";
  const totalKittens = (litters || []).reduce((total, litter) => total + (litter.kittens || []).length, 0);
  const title = `${catteryName} - Filhotes disponíveis${breedText}`;
  const description = cleanText(
    showcase.intro ||
      `Conheça a vitrine de filhotes${breedText} do ${catteryName}. Veja ninhadas, fotos, informações dos pais, disponibilidade e contato do gatil.`,
    165
  );

  const seo = baseSeo({
    title,
    description,
    path: `/vitrine/${showcase.slug}`,
    image: firstShowcaseImage(showcase, litters),
    keywords: [
      "filhotes disponíveis",
      "vitrine de filhotes",
      "gatil",
      "gatos de raça",
      catteryName,
      ...breeds.map((breed) => `filhotes ${breed}`),
      ...breeds.map((breed) => `gatil ${breed}`),
    ],
  });

  const structuredData = [
    organizationSchema(),
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: seo.title,
      url: seo.canonicalUrl,
      description: seo.description,
      about: breeds.length ? breeds.map((breed) => ({ "@type": "Thing", name: breed })) : undefined,
      mainEntity: {
        "@type": "LocalBusiness",
        name: catteryName,
        url: seo.canonicalUrl,
        image: seo.imageUrl,
        description: seo.description,
      },
    },
  ];

  if (totalKittens > 0) {
    structuredData.push({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `Filhotes disponíveis - ${catteryName}`,
      numberOfItems: totalKittens,
      itemListElement: (litters || [])
        .flatMap((litter) => litter.kittens || [])
        .slice(0, 20)
        .map((kitten, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: kitten.displayName || kitten.name || `Filhote ${index + 1}`,
          url: seo.canonicalUrl,
        })),
    });
  }

  return { seo, structuredData, breeds };
}

function getClientIp(req) {
  const candidates = [
    req.headers["cf-connecting-ip"],
    req.headers["true-client-ip"],
    req.headers["x-real-ip"],
    req.headers["x-client-ip"],
    req.headers["fly-client-ip"],
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim(),
    req.socket?.remoteAddress,
  ];
  return candidates.map((value) => String(value || "").trim()).find(Boolean) || "";
}

const geoIpCache = new Map();

function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash("sha256").update(`${process.env.SESSION_SECRET || "catech"}:${ip}`).digest("hex");
}

function normalizeIp(ip) {
  const value = String(ip || "").trim();
  if (!value) return "";
  if (value.startsWith("::ffff:")) return value.slice(7);
  return value;
}

function isPrivateIp(ip) {
  const value = normalizeIp(ip);
  if (!value || value === "::1" || value === "127.0.0.1" || value === "localhost") return true;
  if (/^(10|127)\./.test(value)) return true;
  if (/^192\.168\./.test(value)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) return true;
  if (/^(fc|fd)/i.test(value)) return true;
  return false;
}

async function lookupGeoLocationByIp(ip) {
  const cleanIp = normalizeIp(ip);
  if (isPrivateIp(cleanIp)) return {};

  const cached = geoIpCache.get(cleanIp);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.location;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1400);

  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(cleanIp)}?fields=success,city,region,country_code,country`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return {};

    const data = await response.json();
    if (!data || data.success === false) return {};

    const location = {
      city: shortText(data.city, 100),
      region: shortText(data.region, 100),
      country: shortText(data.country_code || data.country, 100),
    };
    if (location.city) {
      geoIpCache.set(cleanIp, { location, expiresAt: now + 12 * 60 * 60 * 1000 });
      return location;
    }
  } catch {
  } finally {
    clearTimeout(timeout);
  }

  const fallbackController = new AbortController();
  const fallbackTimeout = setTimeout(() => fallbackController.abort(), 1400);

  try {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(cleanIp)}/json/`, {
      signal: fallbackController.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return {};

    const data = await response.json();
    const location = {
      city: shortText(data.city, 100),
      region: shortText(data.region || data.region_code, 100),
      country: shortText(data.country_code || data.country_name, 100),
    };
    geoIpCache.set(cleanIp, { location, expiresAt: now + 12 * 60 * 60 * 1000 });
    return location;
  } catch {
    return {};
  } finally {
    clearTimeout(fallbackTimeout);
  }
}

function firstHeader(req, names) {
  for (const name of names) {
    const value = req.headers[name.toLowerCase()];
    if (value) return decodeURIComponent(String(Array.isArray(value) ? value[0] : value));
  }
  return null;
}

function locationFromHeaders(req) {
  return {
    city: firstHeader(req, ["cf-ipcity", "x-vercel-ip-city", "x-appengine-city"]),
    region: firstHeader(req, ["cf-region", "x-vercel-ip-country-region", "x-appengine-region"]),
    country: firstHeader(req, ["cf-ipcountry", "x-vercel-ip-country", "x-appengine-country"]),
  };
}

function parseCoordinate(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return Number(number.toFixed(5));
}

function locationUpdateData(body = {}) {
  const data = {};
  const latitude = parseCoordinate(body.latitude, -90, 90);
  const longitude = parseCoordinate(body.longitude, -180, 180);
  if (latitude !== null) data.latitude = latitude;
  if (longitude !== null) data.longitude = longitude;
  if (shortText(body.city, 100)) data.city = shortText(body.city, 100);
  if (shortText(body.region, 100)) data.region = shortText(body.region, 100);
  if (shortText(body.country, 100)) data.country = shortText(body.country, 100);
  return data;
}

function placeLabel(session) {
  const city = shortText(session.city, 100);
  if (city) return [city, session.region, session.country].filter(Boolean).join(" / ");
  if (session.latitude !== null && session.latitude !== undefined && session.longitude !== null && session.longitude !== undefined) {
    return `Localização aprox. ${Number(session.latitude).toFixed(3)}, ${Number(session.longitude).toFixed(3)}`;
  }
  return "Local exato desconhecido";
}

function browserLabel(userAgent) {
  const ua = String(userAgent || "");
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return "Safari";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  return "Navegador";
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes ? `${minutes}min ${rest}s` : `${rest}s`;
}

function formatDateTime(date) {
  if (!date) return "-";
  return new Date(date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
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
    evolutionText: "",
    published: false,
    litters: [],
    evolutionComparisons: [],
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
    evolutionText: showcase.evolutionText || "",
    evolutionComparisons: (showcase.evolutionComparisons || []).map((comparison) => ({
      ...comparison,
      key: `comparison_${comparison.id}`,
    })),
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

function isAssociatedShowcaseOwner(user) {
  return ASSOCIATED_SHOWCASE_ROLES.has(normalizeRole(user?.role));
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
        evolutionComparisons: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
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
    const { seo, structuredData, breeds } = buildShowcaseSeo(
      showcase,
      showcase.owner?.settings || null,
      litters
    );

    return res.render("kitten-showcase/public", {
      showcase,
      settings: showcase.owner?.settings || null,
      litters,
      seo,
      structuredData,
      seoBreeds: breeds,
      hasPaymentInfo: Boolean(
        showcase.paymentPix ||
        showcase.paymentCardCash ||
        showcase.paymentCardInstallments ||
        compact(showcase.paymentText)
      ),
      hasAboutInfo: Boolean(compact(showcase.aboutText) || compact(showcase.aboutPdfPath)),
      hasEvolutionInfo: Boolean(
        showcase.evolutionComparisons.length &&
        showcase.evolutionComparisons.some((item) => item.reservePhoto && item.deliveryPhoto && item.oneYearPhoto)
      ),
      isAssociatedShowcase: isAssociatedShowcaseOwner(showcase.owner),
    });
  } catch (err) {
    return next(err);
  }
}

async function findPublishedShowcaseBySlug(prisma, rawSlug) {
  const slug = slugify(rawSlug);
  if (!slug || RESERVED_SLUGS.has(slug)) return null;
  return prisma.catteryKittenShowcase.findFirst({
    where: { slug, published: true },
    select: { id: true, slug: true },
  });
}

async function createAnalyticsSession(prisma, req, rawSlug) {
  const showcase = await findPublishedShowcaseBySlug(prisma, rawSlug);
  if (!showcase) return null;
  const clientIp = getClientIp(req);
  const location = locationFromHeaders(req);
  const locationData = locationUpdateData(req.body || {});
  const geoIpLocation = await lookupGeoLocationByIp(clientIp);
  const visitorId = shortText(req.body?.visitorId, 80) || crypto.randomBytes(12).toString("hex");
  const userAgent = shortText(req.headers["user-agent"], 500);
  const now = new Date();

  return prisma.catteryShowcaseAnalyticsSession.create({
    data: {
      showcaseId: showcase.id,
      visitorId,
      ipHash: hashIp(clientIp),
      userAgent,
      browserLabel: browserLabel(userAgent),
      referrer: shortText(req.body?.referrer || req.headers.referer, 500),
      language: shortText(req.body?.language || req.headers["accept-language"], 80),
      timezone: shortText(req.body?.timezone, 80),
      screen: shortText(req.body?.screen, 40),
      city: locationData.city || shortText(location.city, 100) || geoIpLocation.city,
      region: locationData.region || shortText(location.region, 100) || geoIpLocation.region,
      country: locationData.country || shortText(location.country, 100) || geoIpLocation.country,
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      startedAt: now,
      lastSeenAt: now,
    },
  });
}

async function updateAnalyticsSession(prisma, req, rawSlug, { event = null, close = false } = {}) {
  const showcase = await findPublishedShowcaseBySlug(prisma, rawSlug);
  const sessionId = Number(req.body?.sessionId);
  if (!showcase || !Number.isInteger(sessionId)) return null;

  const session = await prisma.catteryShowcaseAnalyticsSession.findFirst({
    where: { id: sessionId, showcaseId: showcase.id },
    select: { id: true, startedAt: true },
  });
  if (!session) return null;

  const now = new Date();
  const durationSeconds = Math.max(0, Math.round((now.getTime() - new Date(session.startedAt).getTime()) / 1000));
  await prisma.catteryShowcaseAnalyticsSession.update({
    where: { id: session.id },
    data: { lastSeenAt: now, durationSeconds, ...locationUpdateData(req.body || {}) },
  });

  if (event) {
    await prisma.catteryShowcaseAnalyticsEvent.create({
      data: {
        sessionId: session.id,
        type: shortText(event.type, 40) || (close ? "leave" : "event"),
        label: shortText(event.label, 180),
        details: shortText(event.details, 500),
        path: shortText(event.path, 300),
      },
    });
  }

  return { id: session.id, durationSeconds };
}

function publicRouter(prisma) {
  const router = express.Router();

  router.post("/vitrine/:slug/analytics/session", async (req, res) => {
    try {
      const session = await createAnalyticsSession(prisma, req, req.params.slug);
      if (!session) return res.status(404).json({ ok: false });
      await prisma.catteryShowcaseAnalyticsEvent.create({
        data: {
          sessionId: session.id,
          type: "page_view",
          label: "Acessou a vitrine",
          path: shortText(req.body?.path, 300),
        },
      });
      res.json({ ok: true, sessionId: session.id });
    } catch (err) {
      console.error("Erro ao iniciar analytics da vitrine:", err);
      res.status(204).end();
    }
  });

  router.post("/vitrine/:slug/analytics/heartbeat", async (req, res) => {
    try {
      await updateAnalyticsSession(prisma, req, req.params.slug);
      res.json({ ok: true });
    } catch {
      res.status(204).end();
    }
  });

  router.post("/vitrine/:slug/analytics/event", async (req, res) => {
    try {
      await updateAnalyticsSession(prisma, req, req.params.slug, {
        event: {
          type: req.body?.type,
          label: req.body?.label,
          details: req.body?.details,
          path: req.body?.path,
        },
      });
      res.json({ ok: true });
    } catch {
      res.status(204).end();
    }
  });

  router.get("/vitrine/:slug", async (req, res, next) => {
    return renderPublicShowcase(prisma, req, res, next, req.params.slug);
  });

  return router;
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

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
        evolutionComparisons: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        },
      },
    });
  }

  async function loadAnalyticsOverview(showcaseId) {
    if (!showcaseId) {
      return {
        active: [],
        recent: [],
        events: [],
        rankings: {
          whatsappClicks: 0,
          averageDurationLabel: "0s",
          topActions: [],
          topKittens: [],
          topPlaces: [],
          leadVisits: [],
        },
        totals: { active: 0, today: 0, total: 0 },
      };
    }

    const now = Date.now();
    const activeSince = new Date(now - 90 * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [activeSessions, recentSessions, recentEvents, rankingEvents, todayCount, totalCount] = await Promise.all([
      prisma.catteryShowcaseAnalyticsSession.findMany({
        where: { showcaseId, lastSeenAt: { gte: activeSince } },
        orderBy: { lastSeenAt: "desc" },
        take: 12,
      }),
      prisma.catteryShowcaseAnalyticsSession.findMany({
        where: { showcaseId },
        orderBy: { startedAt: "desc" },
        take: 18,
        include: { events: { orderBy: { createdAt: "desc" }, take: 30 } },
      }),
      prisma.catteryShowcaseAnalyticsEvent.findMany({
        where: { session: { showcaseId } },
        include: { session: true },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      prisma.catteryShowcaseAnalyticsEvent.findMany({
        where: { session: { showcaseId } },
        include: { session: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.catteryShowcaseAnalyticsSession.count({
        where: { showcaseId, startedAt: { gte: today } },
      }),
      prisma.catteryShowcaseAnalyticsSession.count({ where: { showcaseId } }),
    ]);

    const shapeSession = (session) => ({
      id: session.id,
      browserLabel: session.browserLabel || "Navegador",
      place: placeLabel(session),
      startedAtLabel: formatDateTime(session.startedAt),
      lastSeenAtLabel: formatDateTime(session.lastSeenAt),
      durationLabel: formatDuration(session.durationSeconds),
      referrer: session.referrer || "",
      language: session.language || "",
      timezone: session.timezone || "",
      screen: session.screen || "",
      coordinates: session.latitude !== null && session.latitude !== undefined && session.longitude !== null && session.longitude !== undefined
        ? `${Number(session.latitude).toFixed(5)}, ${Number(session.longitude).toFixed(5)}`
        : "",
      events: (session.events || []).map((event) => ({
        id: event.id,
        type: event.type,
        label: event.label || event.type,
        details: event.details || "",
        path: event.path || "",
        createdAtLabel: formatDateTime(event.createdAt),
      })),
    });

    const increment = (map, key, meta = {}) => {
      const label = shortText(key, 180);
      if (!label) return;
      const current = map.get(label) || { label, count: 0, ...meta };
      current.count += 1;
      map.set(label, current);
    };
    const topList = (map, limit = 5) => [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, limit);
    const actionMap = new Map();
    const kittenMap = new Map();
    const placeMap = new Map();
    let whatsappClicks = 0;

    rankingEvents.forEach((event) => {
      const label = event.label || event.type || "";
      const place = placeLabel(event.session);
      if (event.type === "click") {
        increment(actionMap, label);
        if (/whats/i.test(label)) {
          whatsappClicks += 1;
        }
      }
      if (event.type === "view_section" && /^Filhote:/i.test(label)) {
        increment(kittenMap, label.replace(/^Filhote:\s*/i, ""));
      }
      if (place) increment(placeMap, place);
    });

    const averageDuration = recentSessions.length
      ? Math.round(recentSessions.reduce((sum, session) => sum + Number(session.durationSeconds || 0), 0) / recentSessions.length)
      : 0;

    const leadVisits = recentSessions
      .filter((session) => (session.events || []).some((event) => /whats/i.test(event.label || "")))
      .sort((a, b) => Number(b.durationSeconds || 0) - Number(a.durationSeconds || 0))
      .slice(0, 5)
      .map((session) => ({
        id: session.id,
        place: placeLabel(session),
        browserLabel: session.browserLabel || "Navegador",
        durationLabel: formatDuration(session.durationSeconds),
        startedAtLabel: formatDateTime(session.startedAt),
        clicks: (session.events || []).filter((event) => /whats/i.test(event.label || "")).length,
      }));

    return {
      active: activeSessions.map(shapeSession),
      recent: recentSessions.map(shapeSession),
      events: recentEvents.map((event) => ({
        id: event.id,
        type: event.type,
        label: event.label || event.type,
        details: event.details || "",
        path: event.path || "",
        createdAtLabel: formatDateTime(event.createdAt),
        place: placeLabel(event.session),
      })),
      rankings: {
        whatsappClicks,
        averageDurationLabel: formatDuration(averageDuration),
        topActions: topList(actionMap),
        topKittens: topList(kittenMap),
        topPlaces: topList(placeMap),
        leadVisits,
      },
      totals: {
        active: activeSessions.length,
        today: todayCount,
        total: totalCount,
      },
    };
  }

  async function renderAdmin(req, res, options = {}) {
    const settings = await getSettings(req.session.userId);
    const showcase = await getShowcase(req.session.userId);
    const showcaseLitterLimit = getCreationLimits(req.session.userRole).showcaseLitters;
    const showcaseEvolutionLimit = getCreationLimits(req.session.userRole).showcaseEvolutionComparisons;
    const uploadLimit = getFileUploadLimit(req.session.userRole);
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
        evolutionComparisons: showcaseEvolutionLimit,
        evolutionComparisonsLabel: showcaseEvolutionLimit === null
          ? "Ilimitado"
          : `${showcaseEvolutionLimit} comparativo${showcaseEvolutionLimit === 1 ? "" : "s"}`,
        uploadLimitBytes: uploadLimit.bytes,
        uploadLimitLabel: uploadLimit.label,
      },
      publicBaseUrl,
      analytics: await loadAnalyticsOverview(showcase?.id),
      error: options.error || null,
      success: options.success || false,
    });
  }

  function uploadShowcaseFiles(req, res, next) {
    const uploadLimit = getFileUploadLimit(req.session?.userRole);
    const upload = createUpload(req.session?.userRole);
    upload.any()(req, res, async (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        try {
          return renderAdmin(req, res, {
            status: 413,
            error: `Uma das imagens ultrapassa ${uploadLimit.label}. Reduza o tamanho da foto e tente novamente.`,
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

  router.get("/admin/vitrine-filhotes/analytics", requireAuth, requirePermission("showcase.manage"), async (req, res, next) => {
    try {
      const showcase = await getShowcase(req.session.userId);
      res.json(await loadAnalyticsOverview(showcase?.id));
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
        const evolutionComparisons = Array.isArray(payload.evolutionComparisons)
          ? payload.evolutionComparisons
          : [];
        const showcaseLitterLimit = getCreationLimits(req.session.userRole).showcaseLitters;
        const showcaseEvolutionLimit = getCreationLimits(req.session.userRole).showcaseEvolutionComparisons;
        const publishedLitters = litters.filter((litter) => litter.published !== false);
        if (showcaseLitterLimit !== null && publishedLitters.length > showcaseLitterLimit) {
          throw new Error(`Seu perfil permite até ${showcaseLitterLimit} ninhada${showcaseLitterLimit === 1 ? "" : "s"} publicada${showcaseLitterLimit === 1 ? "" : "s"} na vitrine por vez. Ninhadas ocultas não entram neste limite.`);
        }
        if (showcaseEvolutionLimit !== null && evolutionComparisons.length > showcaseEvolutionLimit) {
          throw new Error(`Seu perfil permite até ${showcaseEvolutionLimit} comparativo${showcaseEvolutionLimit === 1 ? "" : "s"} de evolução na vitrine.`);
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
        for (const comparison of evolutionComparisons) {
          const key = comparison.key;
          const reservePhoto = (uploaded.get(`comparisonReservePhoto_${key}`)?.[0] || compact(comparison.reservePhoto));
          const deliveryPhoto = (uploaded.get(`comparisonDeliveryPhoto_${key}`)?.[0] || compact(comparison.deliveryPhoto));
          const oneYearPhoto = (uploaded.get(`comparisonOneYearPhoto_${key}`)?.[0] || compact(comparison.oneYearPhoto));
          if (!reservePhoto || !deliveryPhoto || !oneYearPhoto) {
            throw new Error("Cada comparativo de evolução precisa ter as fotos: momento da reserva, momento da entrega e 1 ano de idade.");
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
              evolutionText: compact(payload.evolutionText),
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
              evolutionText: compact(payload.evolutionText),
              published: payload.published === true,
            },
          });

          await tx.catteryShowcaseLitter.deleteMany({
            where: { showcaseId: showcase.id },
          });
          await tx.catteryShowcaseEvolutionComparison.deleteMany({
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
          for (const [comparisonIndex, comparison] of evolutionComparisons.entries()) {
            const key = comparison.key;
            await tx.catteryShowcaseEvolutionComparison.create({
              data: {
                showcaseId: showcase.id,
                caption: compact(comparison.caption),
                reservePhoto: uploaded.get(`comparisonReservePhoto_${key}`)?.[0] || compact(comparison.reservePhoto),
                deliveryPhoto: uploaded.get(`comparisonDeliveryPhoto_${key}`)?.[0] || compact(comparison.deliveryPhoto),
                oneYearPhoto: uploaded.get(`comparisonOneYearPhoto_${key}`)?.[0] || compact(comparison.oneYearPhoto),
                sortOrder: comparisonIndex,
              },
            });
          }
        });

        res.redirect("/admin/vitrine-filhotes?ok=1");
      } catch (err) {
        if (err.code === "UPLOAD_LIMIT") {
          try {
            return renderAdmin(req, res, { status: 413, error: err.message });
          } catch {
            return next(err);
          }
        }

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
