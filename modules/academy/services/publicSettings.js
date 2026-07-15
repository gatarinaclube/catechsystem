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
  portalFontFamily: "Inter",
  portalTitleSize: "medium",
  portalTextColor: "#1f2933",
  portalHeadingColor: "#171717",
  portalAccentColor: "#a97824",
  portalHeadingWeight: "900",
  portalHeadingItalic: false,
  portalCarouselSeconds: 7,
  portalBannerA: {
    imageUrl: "",
    linkUrl: "",
    altText: "Banner A",
  },
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
        title: "Agenda e avisos",
        text: "Espaço para textos curtos, comunicados, chamadas de eventos, notas institucionais ou links importantes.",
        externalUrl: "",
      },
    },
  ],
  portalBannerC: [
    { imageUrl: "", linkUrl: "", altText: "Banner C" },
    { imageUrl: "", linkUrl: "", altText: "Banner C" },
    { imageUrl: "", linkUrl: "", altText: "Banner C" },
  ],
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
    portalFontFamily: normalizeFontFamily(value.portalFontFamily),
    portalTitleSize: normalizeTitleSize(value.portalTitleSize),
    portalTextColor: normalizeHexColor(value.portalTextColor, DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalTextColor),
    portalHeadingColor: normalizeHexColor(value.portalHeadingColor, DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalHeadingColor),
    portalAccentColor: normalizeHexColor(value.portalAccentColor, DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalAccentColor),
    portalHeadingWeight: normalizeHeadingWeight(value.portalHeadingWeight),
    portalHeadingItalic: value.portalHeadingItalic === true,
    portalCarouselSeconds: normalizeCarouselSeconds(value.portalCarouselSeconds),
    portalBannerA: normalizeBanner(value.portalBannerA, DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalBannerA),
    portalFeatured: normalizeArticles(value.portalFeatured, DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalFeatured),
    portalBannerB: normalizeBanners(value.portalBannerB, DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalBannerB, 2),
    portalNewsRows: normalizeNewsRows(value.portalNewsRows, DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalNewsRows),
    portalBannerC: normalizeBanners(
      value.portalBannerC,
      DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalBannerC,
      Math.max(3, Array.isArray(value.portalBannerC) ? value.portalBannerC.length : DEFAULT_ACADEMY_PUBLIC_SETTINGS.portalBannerC.length),
    ),
    presentationGuests: normalizeGuests(value.presentationGuests),
  };
}

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/uploads/academy/")) return raw;
  if (raw.startsWith("/logos/")) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  return "";
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
  };
}

function normalizeBanners(value, fallback, size) {
  const source = Array.isArray(value) ? value : fallback;
  return Array.from({ length: size }, (_, index) => normalizeBanner(source[index] || {}, fallback[index] || {}));
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
    videoUrl: normalizeUrl(value.videoUrl) || normalizeUrl(fallback.videoUrl),
    externalUrl: normalizeUrl(value.externalUrl) || normalizeUrl(fallback.externalUrl),
    placement: normalizePlacement(value.placement, fallback.placement || "list"),
    body: cleanText(value.body, fallback.body || "", 9000),
  };
  if (!article.title && !article.subtitle && !article.imageUrl && !article.videoUrl && !article.body) return null;
  return article;
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
};
