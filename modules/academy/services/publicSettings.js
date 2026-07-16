const ACADEMY_PUBLIC_SETTINGS_KEY = "academy_public_page_settings";

const DEFAULT_ACADEMY_PUBLIC_SETTINGS = {
  countdownEnabled: true,
  countdownTitle: "Próxima jornada Gatofilia",
  nextJourneyStartDate: "",
  registrationEndsDate: "",
  presentationWelcomeVideoUrl: "",
  presentationClosingVideoUrl: "",
  presentationEcosystemImageUrl: "/uploads/academy/gatofilia-ecosystem-01.png",
  presentationPixLabel: "PIX - R$ 2.000,00",
  presentationCardLabel: "Cartão - 12x R$ 200,00",
  presentationOfferTitle: "Exclusiva para os 10 primeiros inscritos",
  presentationOfferNote: "Considerando os benefícios inclusos, uma parte significativa do investimento retorna em estrutura, tecnologia, associação e apoio prático.",
  portalLogoUrl: "/uploads/academy/gatofilia-main-logo-360.png",
  portalHeaderImageUrl: "",
  portalFontFamily: "Inter",
  portalTitleSize: "medium",
  portalTextColor: "#1f2933",
  portalHeadingColor: "#171717",
  portalAccentColor: "#a97824",
  portalHeadingWeight: "900",
  portalHeadingItalic: false,
  portalCarouselSeconds: 7,
  portalBannerA: [
    { imageUrl: "", linkUrl: "", altText: "Banner A" },
    { imageUrl: "", linkUrl: "", altText: "Banner A" },
  ],
  portalFeatured: [
    {
      slug: "gatofilia-jornada",
      title: "Gatofilia: conhecimento para criadores que desejam evoluir",
      subtitle: "Uma jornada para transformar criação, gestão e excelência em uma rotina mais profissional.",
      category: "Destaque",
      imageUrl: "",
      videoUrl: "",
      externalUrl: "",
      placement: "featured",
      body: "A Gatofilia reúne educação, experiência prática, comunidade e tecnologia para apoiar criadores em todas as etapas da felinocultura.",
    },
    {
      slug: "gestao-de-gatil",
      title: "Gestão profissional para gatis modernos",
      subtitle: "Organização, indicadores e processos para tomar decisões com mais segurança.",
      category: "Gestão",
      imageUrl: "",
      videoUrl: "",
      externalUrl: "",
      placement: "side",
      body: "A profissionalização de um gatil passa por registros claros, acompanhamento de rotina, planejamento financeiro e visão estratégica.",
    },
    {
      slug: "criacao-responsavel",
      title: "Criação responsável começa pelo conhecimento",
      subtitle: "Saúde, bem-estar, genética e ética como base de um programa sólido.",
      category: "Felinocultura",
      imageUrl: "",
      videoUrl: "",
      externalUrl: "",
      placement: "side",
      body: "Criar com responsabilidade exige estudo contínuo, escolha criteriosa de reprodutores e compromisso real com os animais.",
    },
  ],
  portalBannerB: [
    { imageUrl: "", linkUrl: "", altText: "Banner B" },
    { imageUrl: "", linkUrl: "", altText: "Banner B" },
    { imageUrl: "", linkUrl: "", altText: "Banner B" },
  ],
  portalNewsRows: [
    {
      left: {
        slug: "excelencia-na-felinocultura",
        title: "Excelência na felinocultura",
        caption: "Conteúdos, notícias e referências para criadores que buscam evolução.",
        category: "Matéria",
        imageUrl: "",
        videoUrl: "",
        externalUrl: "",
        placement: "list",
        body: "Use este espaço para publicar uma matéria completa, compartilhar uma notícia, destacar um criador, apresentar uma raça ou direcionar o leitor para uma página externa.",
      },
      right: {
        title: "Agenda de Eventos",
        text: "Espaço para textos curtos, comunicados, chamadas de eventos, notas institucionais ou links importantes.",
        externalUrl: "",
      },
    },
  ],
  portalBannerC: [
    { imageUrl: "", linkUrl: "", altText: "Banner C" },
    { imageUrl: "", linkUrl: "", altText: "Banner C" },
    { imageUrl: "", linkUrl: "", altText: "Banner C" },
    { imageUrl: "", linkUrl: "", altText: "Banner C" },
  ],
  portalPodcastVideos: [],
  portalSocialLinks: [],
  portalManualEvents: [],
  portalExternalEvents: [],
  portalExternalEventsUpdatedAt: "",
  portalExternalEventsError: "",
  presentationGuests: [
    {
      sortOrder: 1,
      status: "Confirmado",
      name: "Médicos-veterinários",
      education: "Saúde felina",
      story: "",
      specializations: ["Reprodução", "Neonatologia", "Manejo preventivo"],
      experiences: ["Atuação prática em saúde, reprodução e protocolos de criação."],
    },
    {
      sortOrder: 2,
      status: "Convidado",
      name: "Criadores experientes",
      education: "Felinocultura prática",
      story: "",
      specializations: ["Seleção", "Exposições", "Desenvolvimento de raça"],
      experiences: ["Vivência em seleção, pista e desenvolvimento de programas de criação."],
    },
    {
      sortOrder: 3,
      status: "Convidado",
      name: "Profissionais de gestão",
      education: "Gestão e posicionamento",
      story: "",
      specializations: ["Organização", "Marca", "Processos"],
      experiences: ["Apoio em organização, comercialização e processos para gatis."],
    },
  ],
};

function normalizeSettings(value = {}) {
  return {
    ...DEFAULT_ACADEMY_PUBLIC_SETTINGS,
    ...value,
    countdownEnabled: value.countdownEnabled !== false,
    countdownTitle: String(value.countdownTitle || DEFAULT_ACADEMY_PUBLIC_SETTINGS.countdownTitle).trim(),
    nextJourneyStartDate: normalizeDateInput(value.nextJourneyStartDate),
    registrationEndsDate: normalizeDateInput(value.registrationEndsDate),
    presentationWelcomeVideoUrl: normalizeUrl(value.presentationWelcomeVideoUrl),
    presentationClosingVideoUrl: normalizeUrl(value.presentationClosingVideoUrl),
    presentationEcosystemImageUrl: normalizeUrl(value.presentationEcosystemImageUrl) || DEFAULT_ACADEMY_PUBLIC_SETTINGS.presentationEcosystemImageUrl,
    presentationPixLabel: cleanText(value.presentationPixLabel, DEFAULT_ACADEMY_PUBLIC_SETTINGS.presentationPixLabel),
    presentationCardLabel: cleanText(value.presentationCardLabel, DEFAULT_ACADEMY_PUBLIC_SETTINGS.presentationCardLabel),
    presentationOfferTitle: cleanText(value.presentationOfferTitle, DEFAULT_ACADEMY_PUBLIC_SETTINGS.presentationOfferTitle),
    presentationOfferNote: cleanText(value.presentationOfferNote, DEFAULT_ACADEMY_PUBLIC_SETTINGS.presentationOfferNote),
    portalLogoUrl: normalizeUrl(value.portalLogoUrl) || DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalLogoUrl,
    portalHeaderImageUrl: normalizeUrl(value.portalHeaderImageUrl),
    portalFontFamily: normalizeFontFamily(value.portalFontFamily),
    portalTitleSize: normalizeTitleSize(value.portalTitleSize),
    portalTextColor: normalizeHexColor(value.portalTextColor, DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalTextColor),
    portalHeadingColor: normalizeHexColor(value.portalHeadingColor, DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalHeadingColor),
    portalAccentColor: normalizeHexColor(value.portalAccentColor, DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalAccentColor),
    portalHeadingWeight: normalizeHeadingWeight(value.portalHeadingWeight),
    portalHeadingItalic: value.portalHeadingItalic === true,
    portalCarouselSeconds: normalizeCarouselSeconds(value.portalCarouselSeconds),
    portalBannerA: normalizePortalBannerA(value.portalBannerA),
    portalFeatured: normalizeArticles(value.portalFeatured, DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalFeatured),
    portalBannerB: normalizeBanners(value.portalBannerB, DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalBannerB, 3),
    portalNewsRows: normalizeNewsRows(value.portalNewsRows, DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalNewsRows),
    portalBannerC: normalizeBanners(
      value.portalBannerC,
      DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalBannerC,
      Math.max(4, Array.isArray(value.portalBannerC) ? value.portalBannerC.length : DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalBannerC.length),
    ),
    portalPodcastVideos: normalizePodcastVideos(value.portalPodcastVideos),
    portalSocialLinks: normalizeSocialLinks(value.portalSocialLinks),
    portalManualEvents: normalizePortalEvents(value.portalManualEvents, "Manual"),
    portalExternalEvents: normalizePortalEvents(value.portalExternalEvents, ""),
    portalExternalEventsUpdatedAt: normalizeIsoDateTime(value.portalExternalEventsUpdatedAt),
    portalExternalEventsError: cleanText(value.portalExternalEventsError, "", 600),
    presentationGuests: normalizeGuests(value.presentationGuests),
  };
}

function cleanText(value, fallback = "", maxLength = 0) {
  const text = String(value || "").trim();
  const resolved = text || fallback;
  if (!maxLength || resolved.length <= maxLength) return resolved;
  return resolved.slice(0, maxLength).trim();
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/uploads/academy/")) return raw;
  if (raw.startsWith("/logos/")) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  return "";
}

function normalizeExternalUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return "";
}

function youtubeVideoId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
    if (host.endsWith("youtube.com")) {
      if (url.pathname === "/watch") return url.searchParams.get("v") || "";
      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live"].includes(parts[0])) return parts[1] || "";
    }
  } catch (err) {
    return "";
  }

  return "";
}

function youtubeWatchUrl(videoId) {
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : "";
}

function youtubeEmbedUrl(videoId) {
  return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
}

function normalizeFontFamily(value) {
  const raw = String(value || "").trim();
  return ["Inter", "Lora", "Merriweather", "Playfair Display", "Georgia"].includes(raw) ? raw : DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalFontFamily;
}

function normalizeTitleSize(value) {
  const raw = String(value || "").trim();
  return ["compact", "small", "medium", "large"].includes(raw) ? raw : DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalTitleSize;
}

function normalizeHexColor(value, fallback) {
  const raw = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : fallback;
}

function normalizeHeadingWeight(value) {
  const raw = String(value || "").trim();
  return ["600", "700", "800", "900"].includes(raw) ? raw : DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalHeadingWeight;
}

function normalizeCarouselSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalCarouselSeconds;
  return Math.min(20, Math.max(3, Math.round(number)));
}

function normalizePlacement(value, fallback = "list") {
  const raw = String(value || "").trim();
  return ["featured", "side", "list", "archive"].includes(raw) ? raw : fallback;
}

function slugify(value, fallback = "materia") {
  const slug = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return slug || fallback;
}

function normalizeBanner(value = {}, fallback = {}) {
  return {
    imageUrl: normalizeUrl(value.imageUrl) || normalizeUrl(fallback.imageUrl),
    linkUrl: normalizeUrl(value.linkUrl) || normalizeUrl(fallback.linkUrl),
    altText: cleanText(value.altText, fallback.altText || ""),
    positionX: normalizePercent(value.positionX, fallback.positionX ?? 50),
    positionY: normalizePercent(value.positionY, fallback.positionY ?? 50),
    scale: normalizeScale(value.scale, fallback.scale ?? 100),
    fit: normalizeBannerFit(value.fit, fallback.fit || "cover"),
  };
}

function normalizePercent(value, fallback = 50) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(0, Math.round(number)));
}

function normalizeScale(value, fallback = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(200, Math.max(50, Math.round(number)));
}

function normalizeBannerFit(value, fallback = "cover") {
  const raw = String(value || "").trim().toLowerCase();
  return ["cover", "contain"].includes(raw) ? raw : fallback;
}

function normalizeSortOrder(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return Number(fallback) || 0;
  return Math.max(0, Math.round(number));
}

function normalizeBanners(value, fallback, size) {
  const source = Array.isArray(value) ? value : fallback;
  return Array.from({ length: size }, (_, index) => normalizeBanner(source[index] || {}, fallback[index] || {}));
}

function normalizePortalBannerA(value) {
  const fallback = DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalBannerA;
  if (Array.isArray(value)) return normalizeBanners(value, fallback, 2);
  if (value && typeof value === "object") return normalizeBanners([value, {}], fallback, 2);
  return normalizeBanners(fallback, fallback, 2);
}

function normalizeArticle(value = {}, fallback = {}, index = 0) {
  const title = cleanText(value.title, fallback.title || "");
  const article = {
    slug: slugify(value.slug || title || fallback.slug, `materia-${index + 1}`),
    title,
    subtitle: cleanText(value.subtitle, fallback.subtitle || ""),
    caption: cleanText(value.caption, fallback.caption || ""),
    category: cleanText(value.category, fallback.category || ""),
    imageUrl: normalizeUrl(value.imageUrl) || normalizeUrl(fallback.imageUrl),
    imagePositionX: normalizePercent(value.imagePositionX, fallback.imagePositionX ?? 50),
    imagePositionY: normalizePercent(value.imagePositionY, fallback.imagePositionY ?? 50),
    imageScale: normalizeScale(value.imageScale, fallback.imageScale ?? 100),
    imageFit: normalizeBannerFit(value.imageFit, fallback.imageFit || "cover"),
    bodyImages: normalizeArticleImages(value.bodyImages, fallback.bodyImages),
    videoUrl: normalizeUrl(value.videoUrl) || normalizeUrl(fallback.videoUrl),
    externalUrl: normalizeUrl(value.externalUrl) || normalizeUrl(fallback.externalUrl),
    placement: normalizePlacement(value.placement, fallback.placement || "list"),
    sortOrder: normalizeSortOrder(value.sortOrder, fallback.sortOrder ?? index + 1),
    body: cleanText(value.body, fallback.body || "", 9000),
  };
  if (!article.title && !article.subtitle && !article.imageUrl && !article.videoUrl && !article.body) return null;
  return article;
}

function normalizeArticleImages(value, fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .map((item) => ({
      imageUrl: normalizeUrl(item?.imageUrl),
      caption: cleanText(item?.caption, ""),
    }))
    .filter((item) => item.imageUrl);
}

function normalizePodcastVideos(value = []) {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item, index) => {
      const videoId = youtubeVideoId(item?.url || item?.youtubeUrl || item?.watchUrl || item?.embedUrl);
      if (!videoId) return null;
      return {
        title: cleanText(item?.title, `Podcast Gatofilia ${index + 1}`),
        description: cleanText(item?.description, "", 600),
        sortOrder: normalizeSortOrder(item?.sortOrder, index + 1),
        url: youtubeWatchUrl(videoId),
        embedUrl: youtubeEmbedUrl(videoId),
        videoId,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function normalizeSocialLinks(value = []) {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item, index) => ({
      title: cleanText(item?.title, `Rede social ${index + 1}`, 80),
      iconUrl: normalizeUrl(item?.iconUrl),
      linkUrl: normalizeExternalUrl(item?.linkUrl),
      sortOrder: normalizeSortOrder(item?.sortOrder, index + 1),
    }))
    .filter((item) => item.iconUrl && item.linkUrl)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function normalizePortalEvents(value = [], fallbackSource = "") {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item, index) => ({
      title: cleanText(item?.title, "", 180),
      date: normalizeDateInput(item?.date),
      location: cleanText(item?.location, "", 160),
      description: cleanText(item?.description, "", 700),
      linkUrl: normalizeExternalUrl(item?.linkUrl),
      sourceName: cleanText(item?.sourceName, fallbackSource, 80),
      sortOrder: normalizeSortOrder(item?.sortOrder, index + 1),
      origin: cleanText(item?.origin, fallbackSource ? "manual" : "external", 20),
    }))
    .filter((item) => item.title && item.date)
    .sort((a, b) => eventTime(a.date) - eventTime(b.date) || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

function normalizeArticles(value, fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .map((item, index) => normalizeArticle(item, fallback[index] || {}, index))
    .filter(Boolean);
}

function normalizeNewsRows(value, fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .map((row, index) => {
      const left = normalizeArticle(row?.left || {}, fallback[index]?.left || {}, index);
      const right = {
        title: cleanText(row?.right?.title, fallback[index]?.right?.title || ""),
        text: cleanText(row?.right?.text, fallback[index]?.right?.text || "", 4000),
        externalUrl: normalizeUrl(row?.right?.externalUrl) || normalizeUrl(fallback[index]?.right?.externalUrl),
      };
      if (!left && !right.title && !right.text) return null;
      return { left: left || normalizeArticle({}, {}, index), right };
    })
    .filter(Boolean);
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeGuests(value) {
  const source = value === undefined ? DEFAULT_ACADEMY_PUBLIC_SETTINGS.presentationGuests : value;
  if (!Array.isArray(source)) return [];

  return source
    .map((guest, index) => ({
      sortOrder: Number.isFinite(Number(guest?.sortOrder)) ? Number(guest.sortOrder) : index + 1,
      status: cleanText(guest?.status, "Convidado") === "Confirmado" ? "Confirmado" : "Convidado",
      name: cleanText(guest?.name, ""),
      education: cleanText(guest?.education, ""),
      story: cleanText(guest?.story, ""),
      specializations: normalizeList(guest?.specializations),
      experiences: normalizeList(guest?.experiences),
    }))
    .filter((guest) => guest.name || guest.education || guest.story || guest.specializations.length || guest.experiences.length)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function normalizeDateInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function normalizeIsoDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function eventTime(value) {
  const [year, month, day] = normalizeDateInput(value).split("-").map(Number);
  if (!year || !month || !day) return Number.MAX_SAFE_INTEGER;
  return new Date(year, month - 1, day).getTime();
}

function todayTime() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

function formatPortalEventDate(value) {
  const date = dateFromInput(value);
  if (!date) return "";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).replace(".", "");
}

function getPortalEvents(settings, options = {}) {
  const normalized = normalizeSettings(settings);
  const limit = Number(options.limit || 0);
  const includePast = options.includePast === true;
  const events = [
    ...normalized.portalManualEvents,
    ...normalized.portalExternalEvents,
  ];
  const seen = new Set();
  const filtered = events
    .filter((event) => includePast || eventTime(event.date) >= todayTime())
    .filter((event) => {
      const key = `${event.date}|${event.title}|${event.sourceName}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => eventTime(a.date) - eventTime(b.date) || String(a.title).localeCompare(String(b.title)))
    .map((event) => ({
      ...event,
      displayDate: formatPortalEventDate(event.date),
    }));
  return limit ? filtered.slice(0, limit) : filtered;
}

const PORTAL_EVENT_SOURCES = [
  {
    sourceName: "FIFe - Brasil",
    url: "https://fifeweb.org/events/list/?tribe_country%5B0%5D=10123-10124-10125-10126-10127-10165-10166-16659-124806-124948-126001-128890-132246-133792",
  },
  {
    sourceName: "TICA - Brasil",
    url: "https://shows.tica.org/en/",
  },
  {
    sourceName: "FIFe - Winner Show",
    url: "https://fifeweb.org/events/list/?tribe_eventcategory%5B0%5D=9",
  },
];

function shouldRefreshExternalEvents(settings) {
  if (!settings.portalExternalEventsUpdatedAt) return true;
  const last = new Date(settings.portalExternalEventsUpdatedAt);
  if (Number.isNaN(last.getTime())) return true;
  return Date.now() - last.getTime() >= 7 * 24 * 60 * 60 * 1000;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return decodeHtml(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function absoluteExternalUrl(baseUrl, href) {
  try {
    return new URL(href, baseUrl).toString();
  } catch (err) {
    return "";
  }
}

function dateFromParts(year, month, day) {
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function findDateInText(text) {
  const raw = decodeHtml(text);
  const iso = raw.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return dateFromParts(iso[1], iso[2], iso[3]);

  const br = raw.match(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/);
  if (br) return dateFromParts(br[3], br[2], br[1]);

  const months = {
    jan: 1, january: 1, janeiro: 1,
    feb: 2, february: 2, fevereiro: 2,
    mar: 3, march: 3, marco: 3, "março": 3,
    apr: 4, april: 4, abril: 4,
    may: 5, maio: 5,
    jun: 6, june: 6, junho: 6,
    jul: 7, july: 7, julho: 7,
    aug: 8, august: 8, agosto: 8,
    sep: 9, sept: 9, september: 9, setembro: 9,
    oct: 10, october: 10, outubro: 10,
    nov: 11, november: 11, novembro: 11,
    dec: 12, december: 12, dezembro: 12,
  };
  const pattern = "(jan(?:uary|eiro)?|feb(?:ruary|vereiro)?|mar(?:ch|[çc]o)?|apr(?:il)?|abril|may|maio|jun(?:e|ho)?|jul(?:y|ho)?|aug(?:ust|osto)?|sep(?:t|tember|tembro)?|oct(?:ober|ubro)?|nov(?:ember|embro)?|dec(?:ember|embro)?)";
  const dayFirst = raw.match(new RegExp(`\\b(\\d{1,2})\\s+${pattern}\\s*,?\\s*(20\\d{2})\\b`, "i"));
  if (dayFirst) return dateFromParts(dayFirst[3], months[dayFirst[2].toLowerCase()], dayFirst[1]);
  const monthFirst = raw.match(new RegExp(`\\b${pattern}\\s+(\\d{1,2}),?\\s*(20\\d{2})\\b`, "i"));
  if (monthFirst) return dateFromParts(monthFirst[3], months[monthFirst[1].toLowerCase()], monthFirst[2]);
  return "";
}

function extractExternalEvents(html, source) {
  const events = [];
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRegex.exec(html)) !== null) {
    const href = absoluteExternalUrl(source.url, match[1]);
    const title = stripTags(match[2]).replace(/\s+/g, " ").trim();
    if (!href || title.length < 4 || title.length > 180) continue;
    if (/^(home|login|register|search|next|previous|read more|ler mais)$/i.test(title)) continue;
    const context = html.slice(Math.max(0, match.index - 900), Math.min(html.length, match.index + match[0].length + 1300));
    const date = findDateInText(context);
    if (!date) continue;
    events.push({
      title,
      date,
      location: "",
      description: "",
      linkUrl: href,
      sourceName: source.sourceName,
      origin: "external",
    });
  }

  const seen = new Set();
  return normalizePortalEvents(events, source.sourceName).filter((event) => {
    const key = `${event.date}|${event.title}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 80);
}

async function refreshPortalExternalEvents(prisma, options = {}) {
  const current = await getAcademyPublicSettings(prisma);
  if (!options.force && !shouldRefreshExternalEvents(current)) return current;
  if (typeof fetch !== "function") return current;

  const externalEvents = [];
  const errors = [];

  for (const source of PORTAL_EVENT_SOURCES) {
    try {
      const response = await fetch(source.url, {
        headers: {
          "User-Agent": "GatofiliaBot/1.0 (+https://www.gatofilia.com.br)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      externalEvents.push(...extractExternalEvents(html, source));
    } catch (err) {
      errors.push(`${source.sourceName}: ${err.message || err}`);
    }
  }

  return saveAcademyPublicSettings(prisma, {
    ...current,
    portalExternalEvents: externalEvents.length ? externalEvents : current.portalExternalEvents,
    portalExternalEventsUpdatedAt: new Date().toISOString(),
    portalExternalEventsError: errors.join(" | "),
  });
}

async function getAcademyPublicSettings(prisma) {
  const row = await prisma.systemSetting.findUnique({
    where: { key: ACADEMY_PUBLIC_SETTINGS_KEY },
  });

  if (!row?.value) return normalizeSettings();

  try {
    return normalizeSettings(JSON.parse(row.value));
  } catch (err) {
    console.error("Erro ao carregar configurações públicas da Academy:", err.message || err);
    return normalizeSettings();
  }
}

async function saveAcademyPublicSettings(prisma, input) {
  const settings = normalizeSettings(input);
  await prisma.systemSetting.upsert({
    where: { key: ACADEMY_PUBLIC_SETTINGS_KEY },
    create: {
      key: ACADEMY_PUBLIC_SETTINGS_KEY,
      value: JSON.stringify(settings),
    },
    update: {
      value: JSON.stringify(settings),
    },
  });
  return settings;
}

function dateFromInput(value) {
  const date = normalizeDateInput(value);
  if (!date) return null;
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDisplayDate(value) {
  const date = dateFromInput(value);
  if (!date) return "";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function countdownItem(value, label, pastLabel) {
  const target = dateFromInput(value);
  if (!target) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const days = Math.ceil((target.getTime() - today.getTime()) / 86400000);
  return {
    label,
    pastLabel,
    days,
    date: formatDisplayDate(value),
    isPast: days < 0,
    isToday: days === 0,
  };
}

function buildAcademyCountdown(settings) {
  const normalized = normalizeSettings(settings);
  const items = [
    countdownItem(normalized.nextJourneyStartDate, "Próxima jornada inicia em", "Jornada iniciada"),
    countdownItem(normalized.registrationEndsDate, "Inscrições encerram em", "Inscrições encerradas"),
  ].filter(Boolean);

  return {
    enabled: normalized.countdownEnabled && items.length > 0,
    title: normalized.countdownTitle,
    items,
  };
}

module.exports = {
  getAcademyPublicSettings,
  saveAcademyPublicSettings,
  buildAcademyCountdown,
  getPortalEvents,
  refreshPortalExternalEvents,
};
