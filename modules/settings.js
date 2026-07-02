const express = require("express");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { ROLES, normalizeRole, userCan } = require("../utils/access");
const { encryptSecret, shapeSmtpSettings } = require("../utils/userSmtp");
const { formatCnpj, formatPhone } = require("../utils/format");
const {
  getFileUploadLimit,
  validateFilesForRole,
} = require("../utils/planLimits");
const {
  BREED_OPTIONS,
  EXAM_OPTIONS,
  examKittensTabEnabledFromSettings,
  filterAllowed,
  parseJsonList,
  selectedExamSettingsFromBody,
  selectedExamsFromSettings,
} = require("../utils/userPreferences");
const {
  MODULE_PREFERENCES,
  modulePreferenceRowsForRole,
  normalizeModulePreferences,
} = require("../utils/modulePreferences");

const MEMBERSHIP_OPTIONS = ["FIFe", "TICa", "WCF"];
const VACCINE_REMINDER_GROUP_OPTIONS = [
  { value: "SIRES", label: "Padreadores" },
  { value: "DAMS", label: "Matrizes" },
  { value: "FOUNDERS", label: "Fundadores" },
  { value: "KITTEN_AVAILABLE", label: "Filhotes Disponíveis" },
  { value: "KITTEN_RESERVED", label: "Filhotes Reservados" },
  { value: "KITTEN_UNAVAILABLE", label: "Filhotes Indisponíveis" },
  { value: "KITTEN_BREEDER", label: "Filhotes Futuros Padreadores/Matrizes" },
  { value: "KITTEN_DELIVERED", label: "Filhotes Entregues/Vendidos" },
];

function canUseQuickFinanceLinks(role) {
  return [ROLES.ADMIN, ROLES.PREMIUM, ROLES.ASSOCIADO_PREMIUM].includes(normalizeRole(role));
}

function createLogoUploadMiddleware() {
  const diskRoot =
    process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");
  const uploadDir = path.join(diskRoot, "settings-logos");

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `logo-${req.session.userId}-${uniqueSuffix}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: getFileUploadLimit("ADMIN").bytes },
    fileFilter: (req, file, cb) => {
      const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
      if (!allowedTypes.includes(file.mimetype)) {
        return cb(new Error("Envie o logo em PNG, JPG ou WEBP."));
      }
      cb(null, true);
    },
  });
}

function parseNullableInteger(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.floor(number);
}

function normalizeMicrochip(value) {
  return value ? String(value).replace(/\D/g, "").slice(0, 15) : "";
}

function formatMicrochipDisplay(value) {
  const digits = normalizeMicrochip(value);
  return digits.replace(/(\d{3})(?=\d)/g, "$1.");
}

function microchipsFromText(value) {
  const text = String(value || "");
  const found = new Set();
  const compactLines = text
    .split(/[\n,;]+/)
    .map((token) => normalizeMicrochip(token))
    .filter((token) => token.length === 15);

  compactLines.forEach((token) => found.add(token));
  (text.match(/\d[\d.\-\s]{13,}\d/g) || []).forEach((match) => {
    const digits = normalizeMicrochip(match);
    if (digits.length === 15) found.add(digits);
  });

  return Array.from(found);
}

function microchipsFromSequence(startValue, endValue) {
  const start = normalizeMicrochip(startValue);
  const end = normalizeMicrochip(endValue);
  if (start.length !== 15 || end.length !== 15) return [];

  const startNumber = BigInt(start);
  const endNumber = BigInt(end);
  if (endNumber < startNumber) return [];

  const count = endNumber - startNumber + 1n;
  if (count > 500n) {
    const error = new Error("Inclua no máximo 500 microchips por sequência.");
    error.code = "MICROCHIP_SEQUENCE_LIMIT";
    throw error;
  }

  const list = [];
  for (let current = startNumber; current <= endNumber; current += 1n) {
    list.push(current.toString().padStart(15, "0"));
  }
  return list;
}

async function loadMicrochipInventory(prisma, userId) {
  return prisma.$queryRaw`
    SELECT
      inv."id",
      inv."microchip",
      inv."linkedCatId",
      inv."linkedKittenId",
      inv."createdAt",
      cat."name" AS "catName",
      cat."kittenNumber" AS "kittenNumber"
    FROM "UserMicrochipInventory" inv
    LEFT JOIN "Cat" cat ON cat."id" = inv."linkedCatId"
    WHERE inv."userId" = ${userId}
      AND inv."deletedAt" IS NULL
    ORDER BY inv."microchip" ASC
  `;
}

async function microchipAlreadyExists(prisma, microchip) {
  const [cat, publicRegistration, inventoryRows] = await Promise.all([
    prisma.cat.findUnique({ where: { microchip }, select: { id: true } }),
    prisma.publicMicrochipRegistration.findUnique({ where: { microchip }, select: { id: true } }),
    prisma.$queryRaw`
      SELECT "id"
      FROM "UserMicrochipInventory"
      WHERE "microchip" = ${microchip}
        AND "deletedAt" IS NULL
      LIMIT 1
    `,
  ]);

  return Boolean(cat || publicRegistration || inventoryRows.length);
}

function buildAbsoluteUrl(req, path) {
  const host = req.get("host");
  const protocol = req.get("x-forwarded-proto") || req.protocol || "https";
  return `${protocol}://${host}${path}`;
}

async function ensureExpensePublicToken(prisma, user) {
  if (user.expensePublicToken) return user.expensePublicToken;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = crypto.randomBytes(24).toString("hex");

    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { expensePublicToken: token },
      });
      return token;
    } catch (err) {
      if (err.code !== "P2002") throw err;
    }
  }

  throw new Error("Não foi possível gerar o link público de despesas.");
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();
  const logoUpload = createLogoUploadMiddleware();

  async function getSettings(userId) {
    const rows = await prisma.$queryRaw`
      SELECT
        "catteryName",
        "catteryEmail",
        "veterinarianFixed",
        "veterinarian",
        "veterinarianName",
        "crmv",
        "crmvUf",
        "veterinarianClinicName",
        "veterinarianTradeName",
        "veterinarianCnpj",
        "veterinarianAddress",
        "veterinarianCity",
        "veterinarianCep",
        "veterinarianState",
        "veterinarianPhone",
        "veterinarianMobile",
        "veterinarianEmail",
        "logoPath",
        "veterinarianLogoPath",
        "healthCertificateLogoPreference",
        "healthCertificateDeclarationText",
        "membershipsJson",
        "breedsJson",
        "examsJson",
        "vaccineReminderEnabled",
        "vaccineReminderDaysBefore",
        "vaccineReminderGroupsJson",
        "matingSupplementEnabled",
        "matingSupplementDaysBefore",
        "matingSupplementDaysAfter",
        "antirabicFirstDoseMonths",
        "antirabicAnnualBooster",
        "antirabicBoosterIntervalYears",
        "felineFirstDoseMonths",
        "felineSecondDoseDays",
        "felineThirdDoseDays",
        "felineAnnualBooster",
        "felineBoosterIntervalYears",
        "marketingFromName",
        "marketingFromEmail",
        "marketingSmtpHost",
        "marketingSmtpPort",
        "marketingSmtpSecure",
        "marketingSmtpUser",
        "marketingSmtpPassEncrypted",
        "modulePreferencesJson"
      FROM "UserSettings"
      WHERE "userId" = ${userId}
      LIMIT 1
    `;

    const settings = rows[0] || null;

    return {
      catteryName: settings?.catteryName || "",
      catteryEmail: settings?.catteryEmail || "",
      veterinarianFixed: Boolean(settings?.veterinarianFixed),
      veterinarian: settings?.veterinarian || settings?.veterinarianName || "",
      veterinarianName: settings?.veterinarianName || "",
      crmv: settings?.crmv || "",
      crmvUf: settings?.crmvUf || "",
      veterinarianClinicName: settings?.veterinarianClinicName || "",
      veterinarianTradeName: settings?.veterinarianTradeName || "",
      veterinarianCnpj: settings?.veterinarianCnpj || "",
      veterinarianAddress: settings?.veterinarianAddress || "",
      veterinarianCity: settings?.veterinarianCity || "",
      veterinarianCep: settings?.veterinarianCep || "",
      veterinarianState: settings?.veterinarianState || "",
      veterinarianPhone: settings?.veterinarianPhone || "",
      veterinarianMobile: settings?.veterinarianMobile || "",
      veterinarianEmail: settings?.veterinarianEmail || "",
      logoPath: settings?.logoPath || "",
      veterinarianLogoPath: settings?.veterinarianLogoPath || "",
      healthCertificateLogoPreference: settings?.healthCertificateLogoPreference || "NONE",
      healthCertificateDeclarationText: settings?.healthCertificateDeclarationText || "",
      memberships: filterAllowed(parseJsonList(settings?.membershipsJson), MEMBERSHIP_OPTIONS),
      breeds: filterAllowed(parseJsonList(settings?.breedsJson), BREED_OPTIONS),
      exams: selectedExamsFromSettings(settings, { defaultAll: true }),
      examKittensTabEnabled: examKittensTabEnabledFromSettings(settings, { defaultEnabled: true }),
      vaccineReminderEnabled: Boolean(settings?.vaccineReminderEnabled),
      vaccineReminderDaysBefore: settings?.vaccineReminderDaysBefore ?? 15,
      vaccineReminderGroups: filterAllowed(
        parseJsonList(settings?.vaccineReminderGroupsJson),
        VACCINE_REMINDER_GROUP_OPTIONS.map((option) => option.value)
      ),
      matingSupplementEnabled: Boolean(settings?.matingSupplementEnabled),
      matingSupplementDaysBefore: settings?.matingSupplementDaysBefore ?? 15,
      matingSupplementDaysAfter: settings?.matingSupplementDaysAfter ?? 30,
      antirabicFirstDoseMonths: settings?.antirabicFirstDoseMonths ?? 3,
      antirabicAnnualBooster: settings?.antirabicAnnualBooster !== false,
      antirabicBoosterIntervalYears: settings?.antirabicBoosterIntervalYears ?? 1,
      felineFirstDoseMonths: settings?.felineFirstDoseMonths ?? 2,
      felineSecondDoseDays: settings?.felineSecondDoseDays ?? 21,
      felineThirdDoseDays: settings?.felineThirdDoseDays ?? "",
      felineAnnualBooster: settings?.felineAnnualBooster !== false,
      felineBoosterIntervalYears: settings?.felineBoosterIntervalYears ?? 1,
      marketingFromName: settings?.marketingFromName || "",
      marketingFromEmail: settings?.marketingFromEmail || "",
      marketingSmtpHost: settings?.marketingSmtpHost || "",
      marketingSmtpPort: settings?.marketingSmtpPort || 587,
      marketingSmtpSecure: Boolean(settings?.marketingSmtpSecure),
      marketingSmtpUser: settings?.marketingSmtpUser || "",
      marketingSmtpPassEncrypted: settings?.marketingSmtpPassEncrypted || null,
      modulePreferences: normalizeModulePreferences(settings?.modulePreferencesJson),
      smtpSettings: shapeSmtpSettings(settings),
    };
  }

  router.get("/settings", requireAuth, requirePermission("admin.settings"), async (req, res) => {
    try {
      const savedSettings = await prisma.userSettings.findUnique({
        where: { userId: req.session.userId },
        select: { id: true },
      });
      const settings = await getSettings(req.session.userId);
      const showQuickFinanceLinks = canUseQuickFinanceLinks(req.session.userRole);
      const canUseVaccineNotifications = userCan(req.session.userRole, "notifications.vaccine");
      const expensePublicToken = showQuickFinanceLinks
        ? await ensureExpensePublicToken(prisma, req.user)
        : null;
      const initialSetupRequired = req.query.initial === "1" || !savedSettings;
      if (savedSettings) {
        req.session.initialSettingsSaved = true;
      }
      const modulePreferenceRows = modulePreferenceRowsForRole(req.session.userRole, settings.modulePreferences);
      const microchipInventory = await loadMicrochipInventory(prisma, req.session.userId);

      res.render("settings/index", {
        user: req.user,
        currentPath: req.path,
        settings,
        microchipInventory,
        formatMicrochipDisplay,
        initialSetupRequired,
        showQuickFinanceLinks,
        expensePublicLink: expensePublicToken ? buildAbsoluteUrl(req, `/despesas/u/${expensePublicToken}`) : "",
        membershipOptions: MEMBERSHIP_OPTIONS,
        breedOptions: BREED_OPTIONS,
        examOptions: EXAM_OPTIONS,
        vaccineReminderGroupOptions: VACCINE_REMINDER_GROUP_OPTIONS,
        canUseVaccineNotifications,
        modulePreferenceRows,
        success: req.query.saved === "1",
        microchipSuccess: req.query.microchips === "1",
        microchipMessage: req.query.microchipMessage || "",
        error: null,
      });
    } catch (err) {
      console.error("Erro ao abrir configurações:", err);
      res.status(500).send("Erro ao abrir configurações.");
    }
  });

  router.post("/settings", requireAuth, requirePermission("admin.settings"), (req, res, next) => {
    logoUpload.fields([
      { name: "logo", maxCount: 1 },
      { name: "veterinarianLogo", maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        req.uploadError = err.message || "Erro ao enviar o logo.";
      }
      next();
    });
  }, async (req, res) => {
    const existingSettings = await getSettings(req.session.userId);
    const savedSettingsBefore = await prisma.userSettings.findUnique({
      where: { userId: req.session.userId },
      select: { id: true },
    });
    const logoFile = req.files?.logo?.[0] || null;
    const veterinarianLogoFile = req.files?.veterinarianLogo?.[0] || null;
    const smtpPassword = (req.body.smtpPassword || "").trim();
    const clearSmtpPassword = req.body.clearSmtpPassword === "on";
    const canUseVaccineNotifications = userCan(req.session.userRole, "notifications.vaccine");
    const settings = {
      catteryName: (req.body.catteryName || "").trim(),
      catteryEmail: (req.body.catteryEmail || "").trim(),
      veterinarianFixed: req.body.veterinarianFixed === "YES",
      veterinarian: (req.body.veterinarian || "").trim(),
      veterinarianName: null,
      crmv: (req.body.crmv || "").trim(),
      crmvUf: (req.body.crmvUf || "").trim().toUpperCase().slice(0, 2),
      veterinarianClinicName: (req.body.veterinarianClinicName || "").trim(),
      veterinarianTradeName: (req.body.veterinarianTradeName || "").trim(),
      veterinarianCnpj: formatCnpj(req.body.veterinarianCnpj),
      veterinarianAddress: (req.body.veterinarianAddress || "").trim(),
      veterinarianCity: (req.body.veterinarianCity || "").trim(),
      veterinarianCep: (req.body.veterinarianCep || "").trim(),
      veterinarianState: (req.body.veterinarianState || "").trim(),
      veterinarianPhone: formatPhone(req.body.veterinarianPhone),
      veterinarianMobile: (req.body.veterinarianMobile || "").trim(),
      veterinarianEmail: (req.body.veterinarianEmail || "").trim(),
      logoPath: logoFile ? `/uploads/settings-logos/${logoFile.filename}` : existingSettings.logoPath,
      veterinarianLogoPath: veterinarianLogoFile
        ? `/uploads/settings-logos/${veterinarianLogoFile.filename}`
        : existingSettings.veterinarianLogoPath,
      healthCertificateLogoPreference: ["CATTERY", "VET", "NONE"].includes(req.body.healthCertificateLogoPreference)
        ? req.body.healthCertificateLogoPreference
        : existingSettings.healthCertificateLogoPreference || "NONE",
      healthCertificateDeclarationText: existingSettings.healthCertificateDeclarationText || "",
      memberships: filterAllowed(req.body.memberships, MEMBERSHIP_OPTIONS),
      breeds: filterAllowed(req.body.breeds, BREED_OPTIONS),
      exams: selectedExamSettingsFromBody(req.body.exams, req.body.examKittensTabEnabled === "on"),
      vaccineReminderEnabled: canUseVaccineNotifications && req.body.vaccineReminderEnabled === "on",
      vaccineReminderDaysBefore: parseNullableInteger(req.body.vaccineReminderDaysBefore) ?? 15,
      vaccineReminderGroups: canUseVaccineNotifications
        ? filterAllowed(
            req.body.vaccineReminderGroups,
            VACCINE_REMINDER_GROUP_OPTIONS.map((option) => option.value)
          )
        : [],
      matingSupplementEnabled: req.body.matingSupplementEnabled === "on",
      matingSupplementDaysBefore: parseNullableInteger(req.body.matingSupplementDaysBefore) ?? 15,
      matingSupplementDaysAfter: parseNullableInteger(req.body.matingSupplementDaysAfter) ?? 30,
      antirabicFirstDoseMonths: parseNullableInteger(req.body.antirabicFirstDoseMonths) ?? 3,
      antirabicAnnualBooster: req.body.antirabicAnnualBooster !== "NO",
      antirabicBoosterIntervalYears: parseNullableInteger(req.body.antirabicBoosterIntervalYears) ?? 1,
      felineFirstDoseMonths: parseNullableInteger(req.body.felineFirstDoseMonths) ?? 2,
      felineSecondDoseDays: parseNullableInteger(req.body.felineSecondDoseDays) ?? 21,
      felineThirdDoseDays: parseNullableInteger(req.body.felineThirdDoseDays),
      felineAnnualBooster: req.body.felineAnnualBooster !== "NO",
      felineBoosterIntervalYears: parseNullableInteger(req.body.felineBoosterIntervalYears) ?? 1,
      marketingFromName: (req.body.fromName || "").trim(),
      marketingFromEmail: (req.body.fromEmail || "").trim(),
      marketingSmtpHost: (req.body.smtpHost || "").trim(),
      marketingSmtpPort: parseNullableInteger(req.body.smtpPort) || 587,
      marketingSmtpSecure: req.body.smtpSecure === "on",
      marketingSmtpUser: (req.body.smtpUser || "").trim(),
      marketingSmtpPassEncrypted: clearSmtpPassword
        ? null
        : smtpPassword
          ? encryptSecret(smtpPassword)
          : existingSettings.marketingSmtpPassEncrypted || null,
    };
    const allowedModulePreferenceKeys = modulePreferenceRowsForRole(req.session.userRole, existingSettings.modulePreferences)
      .filter((module) => module.allowed)
      .map((module) => module.key);
    const selectedModulePreferenceKeys = filterAllowed(req.body.modulePreferences, allowedModulePreferenceKeys);
    settings.modulePreferences = selectedModulePreferenceKeys;
    settings.smtpSettings = shapeSmtpSettings(settings);

    try {
      if (req.uploadError) {
        throw new Error(req.uploadError);
      }
      validateFilesForRole([logoFile, veterinarianLogoFile].filter(Boolean), req.session?.userRole);

      await prisma.$executeRaw`
        INSERT INTO "UserSettings" (
          "userId",
          "catteryName",
          "catteryEmail",
          "veterinarianFixed",
          "veterinarian",
          "veterinarianName",
          "crmv",
          "crmvUf",
          "veterinarianClinicName",
          "veterinarianTradeName",
          "veterinarianCnpj",
          "veterinarianAddress",
          "veterinarianCity",
          "veterinarianCep",
          "veterinarianState",
          "veterinarianPhone",
          "veterinarianMobile",
          "veterinarianEmail",
          "logoPath",
          "veterinarianLogoPath",
          "healthCertificateLogoPreference",
          "healthCertificateDeclarationText",
          "membershipsJson",
          "breedsJson",
          "examsJson",
          "vaccineReminderEnabled",
          "vaccineReminderDaysBefore",
          "vaccineReminderGroupsJson",
          "matingSupplementEnabled",
          "matingSupplementDaysBefore",
          "matingSupplementDaysAfter",
          "antirabicFirstDoseMonths",
          "antirabicAnnualBooster",
          "antirabicBoosterIntervalYears",
          "felineFirstDoseMonths",
          "felineSecondDoseDays",
          "felineThirdDoseDays",
          "felineAnnualBooster",
          "felineBoosterIntervalYears",
          "marketingFromName",
          "marketingFromEmail",
          "marketingSmtpHost",
          "marketingSmtpPort",
          "marketingSmtpSecure",
          "marketingSmtpUser",
          "marketingSmtpPassEncrypted",
          "modulePreferencesJson",
          "updatedAt"
        )
        VALUES (
          ${req.session.userId},
          ${settings.catteryName || null},
          ${settings.catteryEmail || null},
          ${settings.veterinarianFixed},
          ${settings.veterinarian || null},
          ${settings.veterinarianName},
          ${settings.crmv || null},
          ${settings.crmvUf || null},
          ${settings.veterinarianClinicName || null},
          ${settings.veterinarianTradeName || null},
          ${settings.veterinarianCnpj || null},
          ${settings.veterinarianAddress || null},
          ${settings.veterinarianCity || null},
          ${settings.veterinarianCep || null},
          ${settings.veterinarianState || null},
          ${settings.veterinarianPhone || null},
          ${settings.veterinarianMobile || null},
          ${settings.veterinarianEmail || null},
          ${settings.logoPath || null},
          ${settings.veterinarianLogoPath || null},
          ${settings.healthCertificateLogoPreference || "NONE"},
          ${settings.healthCertificateDeclarationText || null},
          ${JSON.stringify(settings.memberships)},
          ${JSON.stringify(settings.breeds)},
          ${JSON.stringify(settings.exams)},
          ${settings.vaccineReminderEnabled},
          ${settings.vaccineReminderDaysBefore},
          ${JSON.stringify(settings.vaccineReminderGroups)},
          ${settings.matingSupplementEnabled},
          ${settings.matingSupplementDaysBefore},
          ${settings.matingSupplementDaysAfter},
          ${settings.antirabicFirstDoseMonths},
          ${settings.antirabicAnnualBooster},
          ${settings.antirabicBoosterIntervalYears},
          ${settings.felineFirstDoseMonths},
          ${settings.felineSecondDoseDays},
          ${settings.felineThirdDoseDays},
          ${settings.felineAnnualBooster},
          ${settings.felineBoosterIntervalYears},
          ${settings.marketingFromName || null},
          ${settings.marketingFromEmail || null},
          ${settings.marketingSmtpHost || null},
          ${settings.marketingSmtpPort},
          ${settings.marketingSmtpSecure},
          ${settings.marketingSmtpUser || null},
          ${settings.marketingSmtpPassEncrypted || null},
          ${JSON.stringify(settings.modulePreferences)},
          CURRENT_TIMESTAMP
        )
        ON CONFLICT ("userId") DO UPDATE SET
          "catteryName" = EXCLUDED."catteryName",
          "catteryEmail" = EXCLUDED."catteryEmail",
          "veterinarianFixed" = EXCLUDED."veterinarianFixed",
          "veterinarian" = EXCLUDED."veterinarian",
          "veterinarianName" = EXCLUDED."veterinarianName",
          "crmv" = EXCLUDED."crmv",
          "crmvUf" = EXCLUDED."crmvUf",
          "veterinarianClinicName" = EXCLUDED."veterinarianClinicName",
          "veterinarianTradeName" = EXCLUDED."veterinarianTradeName",
          "veterinarianCnpj" = EXCLUDED."veterinarianCnpj",
          "veterinarianAddress" = EXCLUDED."veterinarianAddress",
          "veterinarianCity" = EXCLUDED."veterinarianCity",
          "veterinarianCep" = EXCLUDED."veterinarianCep",
          "veterinarianState" = EXCLUDED."veterinarianState",
          "veterinarianPhone" = EXCLUDED."veterinarianPhone",
          "veterinarianMobile" = EXCLUDED."veterinarianMobile",
          "veterinarianEmail" = EXCLUDED."veterinarianEmail",
          "logoPath" = EXCLUDED."logoPath",
          "veterinarianLogoPath" = EXCLUDED."veterinarianLogoPath",
          "healthCertificateLogoPreference" = EXCLUDED."healthCertificateLogoPreference",
          "healthCertificateDeclarationText" = EXCLUDED."healthCertificateDeclarationText",
          "membershipsJson" = EXCLUDED."membershipsJson",
          "breedsJson" = EXCLUDED."breedsJson",
          "examsJson" = EXCLUDED."examsJson",
          "vaccineReminderEnabled" = EXCLUDED."vaccineReminderEnabled",
          "vaccineReminderDaysBefore" = EXCLUDED."vaccineReminderDaysBefore",
          "vaccineReminderGroupsJson" = EXCLUDED."vaccineReminderGroupsJson",
          "matingSupplementEnabled" = EXCLUDED."matingSupplementEnabled",
          "matingSupplementDaysBefore" = EXCLUDED."matingSupplementDaysBefore",
          "matingSupplementDaysAfter" = EXCLUDED."matingSupplementDaysAfter",
          "antirabicFirstDoseMonths" = EXCLUDED."antirabicFirstDoseMonths",
          "antirabicAnnualBooster" = EXCLUDED."antirabicAnnualBooster",
          "antirabicBoosterIntervalYears" = EXCLUDED."antirabicBoosterIntervalYears",
          "felineFirstDoseMonths" = EXCLUDED."felineFirstDoseMonths",
          "felineSecondDoseDays" = EXCLUDED."felineSecondDoseDays",
          "felineThirdDoseDays" = EXCLUDED."felineThirdDoseDays",
          "felineAnnualBooster" = EXCLUDED."felineAnnualBooster",
          "felineBoosterIntervalYears" = EXCLUDED."felineBoosterIntervalYears",
          "marketingFromName" = EXCLUDED."marketingFromName",
          "marketingFromEmail" = EXCLUDED."marketingFromEmail",
          "marketingSmtpHost" = EXCLUDED."marketingSmtpHost",
          "marketingSmtpPort" = EXCLUDED."marketingSmtpPort",
          "marketingSmtpSecure" = EXCLUDED."marketingSmtpSecure",
          "marketingSmtpUser" = EXCLUDED."marketingSmtpUser",
          "marketingSmtpPassEncrypted" = EXCLUDED."marketingSmtpPassEncrypted",
          "modulePreferencesJson" = EXCLUDED."modulePreferencesJson",
          "updatedAt" = CURRENT_TIMESTAMP
      `;

      req.session.initialSettingsSaved = true;
      req.session.modulePreferences = settings.modulePreferences;
      res.redirect("/settings?saved=1");
    } catch (err) {
      console.error("Erro ao salvar configurações:", err);
      let expensePublicLink = "";
      const showQuickFinanceLinks = canUseQuickFinanceLinks(req.session.userRole);
      try {
        if (showQuickFinanceLinks) {
          const expensePublicToken = await ensureExpensePublicToken(prisma, req.user);
          expensePublicLink = buildAbsoluteUrl(req, `/despesas/u/${expensePublicToken}`);
        }
      } catch (tokenErr) {
        console.error("Erro ao preparar link rápido de despesas:", tokenErr);
      }
      res.status(500).render("settings/index", {
        user: req.user,
        currentPath: "/settings",
        settings,
        microchipInventory: [],
        formatMicrochipDisplay,
        initialSetupRequired: !savedSettingsBefore,
        showQuickFinanceLinks,
        expensePublicLink,
        membershipOptions: MEMBERSHIP_OPTIONS,
        breedOptions: BREED_OPTIONS,
        examOptions: EXAM_OPTIONS,
        vaccineReminderGroupOptions: VACCINE_REMINDER_GROUP_OPTIONS,
        canUseVaccineNotifications,
        modulePreferenceRows: modulePreferenceRowsForRole(req.session.userRole, settings.modulePreferences),
        success: false,
        microchipSuccess: false,
        microchipMessage: "",
        error: "Erro ao salvar configurações.",
      });
    }
  });

  router.post(
    "/settings/microchips",
    requireAuth,
    requirePermission("admin.settings"),
    async (req, res) => {
      try {
        const textMicrochips = microchipsFromText(req.body.microchipNumbers);
        const sequenceMicrochips = microchipsFromSequence(req.body.microchipStart, req.body.microchipEnd);
        const microchips = Array.from(new Set([...textMicrochips, ...sequenceMicrochips]));

        if (!microchips.length) {
          return res.redirect("/settings?microchipMessage=Informe pelo menos um microchip com 15 dígitos.");
        }

        let inserted = 0;
        let skipped = 0;
        for (const microchip of microchips) {
          if (await microchipAlreadyExists(prisma, microchip)) {
            skipped += 1;
            continue;
          }

          await prisma.$executeRaw`
            INSERT INTO "UserMicrochipInventory" ("userId", "microchip", "updatedAt")
            VALUES (${req.session.userId}, ${microchip}, CURRENT_TIMESTAMP)
          `;
          inserted += 1;
        }

        const message = encodeURIComponent(
          `${inserted} microchip(s) incluído(s).${skipped ? ` ${skipped} ignorado(s) por já existirem.` : ""}`
        );
        return res.redirect(`/settings?microchips=1&microchipMessage=${message}`);
      } catch (err) {
        console.error("Erro ao incluir microchips:", err);
        return res.redirect(`/settings?microchipMessage=${encodeURIComponent(err.message || "Erro ao incluir microchips.")}`);
      }
    }
  );

  router.post(
    "/settings/microchips/:id/delete",
    requireAuth,
    requirePermission("admin.settings"),
    async (req, res) => {
      try {
        await prisma.$executeRaw`
          UPDATE "UserMicrochipInventory"
          SET "deletedAt" = CURRENT_TIMESTAMP,
              "linkedCatId" = NULL,
              "linkedKittenId" = NULL,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${Number(req.params.id)}
            AND "userId" = ${req.session.userId}
        `;
        return res.redirect("/settings?microchips=1&microchipMessage=Microchip removido da lista.");
      } catch (err) {
        console.error("Erro ao excluir microchip:", err);
        return res.redirect("/settings?microchipMessage=Erro ao excluir microchip.");
      }
    }
  );

  return router;
};
