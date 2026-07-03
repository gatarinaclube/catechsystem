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
