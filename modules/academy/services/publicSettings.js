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
  presentationGuests: [
    {
      status: "Confirmado",
      name: "Médicos-veterinários",
      education: "Saúde felina",
      specializations: ["Reprodução", "Neonatologia", "Manejo preventivo"],
      experiences: ["Atuação prática em saúde, reprodução e protocolos de criação."],
    },
    {
      status: "Convidado",
      name: "Criadores experientes",
      education: "Felinocultura prática",
      specializations: ["Seleção", "Exposições", "Desenvolvimento de raça"],
      experiences: ["Vivência em seleção, pista e desenvolvimento de programas de criação."],
    },
    {
      status: "Convidado",
      name: "Profissionais de gestão",
      education: "Gestão e posicionamento",
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
  if (/^https?:\/\//i.test(raw)) return raw;
  return "";
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
    .map((guest) => ({
      status: cleanText(guest?.status, "Convidado") === "Confirmado" ? "Confirmado" : "Convidado",
      name: cleanText(guest?.name, ""),
      education: cleanText(guest?.education, ""),
      specializations: normalizeList(guest?.specializations),
      experiences: normalizeList(guest?.experiences),
    }))
    .filter((guest) => guest.name || guest.education || guest.specializations.length || guest.experiences.length);
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
