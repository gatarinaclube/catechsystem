const express = require("express");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { isAdminRole } = require("../utils/access");
const { encryptSecret, shapeSmtpSettings } = require("../utils/userSmtp");
const {
  MANAGED_PLAN_ROLES,
  getFileUploadLimit,
  getPlanLimitRows,
  setPlanLimitOverrides,
  validateFilesForRole,
} = require("../utils/planLimits");
const {
  BREED_OPTIONS,
  EXAM_OPTIONS,
  filterAllowed,
  parseJsonList,
  selectedExamsFromSettings,
} = require("../utils/userPreferences");

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

function parseUploadLimitKb(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const normalized = String(value).replace(",", ".");
  const number = Number(normalized);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.round(number * 1024);
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

function buildPlanLimitRows(body) {
  return MANAGED_PLAN_ROLES.map((role) => ({
    role,
    uploadLimitKb: parseUploadLimitKb(body[`plan_${role}_uploadLimitMb`]),
    breeders: parseNullableInteger(body[`plan_${role}_breeders`]),
    showcaseLitters: parseNullableInteger(body[`plan_${role}_showcaseLitters`]),
    showcaseEvolutionComparisons: parseNullableInteger(body[`plan_${role}_showcaseEvolutionComparisons`]),
    littersPerYear: parseNullableInteger(body[`plan_${role}_littersPerYear`]),
    kittensPerYear: parseNullableInteger(body[`plan_${role}_kittensPerYear`]),
  }));
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
        "marketingSmtpPassEncrypted"
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
      vaccineReminderEnabled: Boolean(settings?.vaccineReminderEnabled),
      vaccineReminderDaysBefore: settings?.vaccineReminderDaysBefore ?? 15,
      vaccineReminderGroups: filterAllowed(
        parseJsonList(settings?.vaccineReminderGroupsJson),
        VACCINE_REMINDER_GROUP_OPTIONS.map((option) => option.value)
      ),
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
      smtpSettings: shapeSmtpSettings(settings),
    };
  }

  router.get("/settings", requireAuth, requirePermission("admin.settings"), async (req, res) => {
    try {
      const settings = await getSettings(req.session.userId);
      const expensePublicToken = await ensureExpensePublicToken(prisma, req.user);

      res.render("settings/index", {
        user: req.user,
        currentPath: req.path,
        settings,
        expensePublicLink: buildAbsoluteUrl(req, `/despesas/u/${expensePublicToken}`),
        membershipOptions: MEMBERSHIP_OPTIONS,
        breedOptions: BREED_OPTIONS,
        examOptions: EXAM_OPTIONS,
        vaccineReminderGroupOptions: VACCINE_REMINDER_GROUP_OPTIONS,
        planLimits: isAdminRole(req.session.userRole) ? getPlanLimitRows() : [],
        canManagePlanLimits: isAdminRole(req.session.userRole),
        success: req.query.saved === "1",
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
    const logoFile = req.files?.logo?.[0] || null;
    const veterinarianLogoFile = req.files?.veterinarianLogo?.[0] || null;
    const smtpPassword = (req.body.smtpPassword || "").trim();
    const clearSmtpPassword = req.body.clearSmtpPassword === "on";
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
      veterinarianCnpj: (req.body.veterinarianCnpj || "").trim(),
      veterinarianAddress: (req.body.veterinarianAddress || "").trim(),
      veterinarianCity: (req.body.veterinarianCity || "").trim(),
      veterinarianCep: (req.body.veterinarianCep || "").trim(),
      veterinarianState: (req.body.veterinarianState || "").trim(),
      veterinarianPhone: (req.body.veterinarianPhone || "").trim(),
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
      exams: filterAllowed(req.body.exams, EXAM_OPTIONS),
      vaccineReminderEnabled: req.body.vaccineReminderEnabled === "on",
      vaccineReminderDaysBefore: parseNullableInteger(req.body.vaccineReminderDaysBefore) ?? 15,
      vaccineReminderGroups: filterAllowed(
        req.body.vaccineReminderGroups,
        VACCINE_REMINDER_GROUP_OPTIONS.map((option) => option.value)
      ),
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
    settings.smtpSettings = shapeSmtpSettings(settings);
    const canManagePlanLimits = isAdminRole(req.session.userRole);
    const planLimits = canManagePlanLimits ? buildPlanLimitRows(req.body) : getPlanLimitRows();

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
          "updatedAt" = CURRENT_TIMESTAMP
      `;

      if (canManagePlanLimits) {
        for (const row of planLimits) {
          await prisma.rolePlanLimit.upsert({
            where: { role: row.role },
            update: {
              uploadLimitKb: row.uploadLimitKb,
              breeders: row.breeders,
              showcaseLitters: row.showcaseLitters,
              showcaseEvolutionComparisons: row.showcaseEvolutionComparisons,
              littersPerYear: row.littersPerYear,
              kittensPerYear: row.kittensPerYear,
            },
            create: row,
          });
        }
        setPlanLimitOverrides(planLimits);
      }

      res.redirect("/settings?saved=1");
    } catch (err) {
      console.error("Erro ao salvar configurações:", err);
      let expensePublicLink = "";
      try {
        const expensePublicToken = await ensureExpensePublicToken(prisma, req.user);
        expensePublicLink = buildAbsoluteUrl(req, `/despesas/u/${expensePublicToken}`);
      } catch (tokenErr) {
        console.error("Erro ao preparar link rápido de despesas:", tokenErr);
      }
      res.status(500).render("settings/index", {
        user: req.user,
        currentPath: "/settings",
        settings,
        expensePublicLink,
        membershipOptions: MEMBERSHIP_OPTIONS,
        breedOptions: BREED_OPTIONS,
        examOptions: EXAM_OPTIONS,
        vaccineReminderGroupOptions: VACCINE_REMINDER_GROUP_OPTIONS,
        planLimits,
        canManagePlanLimits,
        success: false,
        error: "Erro ao salvar configurações.",
      });
    }
  });

  return router;
};
