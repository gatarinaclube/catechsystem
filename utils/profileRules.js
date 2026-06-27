const PROFILE_RULES_SETTING_KEY = "profileRulesConfig";

const PLAN_KEYS = ["basic", "master", "premium"];

const PLAN_LABELS = {
  basic: "Básico",
  master: "Master",
  premium: "Premium",
};

const ROLE_TO_PLAN_KEY = {
  BASIC: "basic",
  ASSOCIADO_B: "basic",
  MASTER: "master",
  ASSOCIADO_A: "master",
  PREMIUM: "premium",
  ASSOCIADO_PREMIUM: "premium",
};

const PLAN_KEY_TO_ROLE = {
  basic: "BASIC",
  master: "MASTER",
  premium: "PREMIUM",
};

const LIMIT_ROWS = [
  { key: "kittensPerYear", label: "Cadastro de Filhotes", unit: "filhotes/ano", blankLabel: "Ilimitado" },
  { key: "littersPerYear", label: "Ninhadas", unit: "ninhadas/ano", blankLabel: "Ilimitado" },
  { key: "uploadLimitKb", label: "Upload", unit: "KB por arquivo", blankLabel: "Sem limite" },
  { key: "signatureDocumentsPerMonth", label: "Assinatura Eletrônica", unit: "documentos/mês", blankLabel: "Ilimitado" },
  { key: "pdfReducerPerMonth", label: "Redutor de PDF", unit: "arquivos/mês", blankLabel: "Ilimitado" },
];

const FEATURE_ROWS = [
  { key: "breeders", label: "Reprodutores", permissions: ["admin.breeders"] },
  { key: "matings", label: "Acasalamentos", permissions: ["admin.matings"] },
  { key: "history", label: "Histórico do gato", permissions: ["admin.history"] },
  { key: "vaccinations", label: "Vacinação", permissions: ["admin.vaccinations"] },
  { key: "notifications", label: "Notificações", permissions: ["notifications.vaccine"] },
  { key: "deworming", label: "Vermifugação", permissions: ["admin.deworming"] },
  { key: "weighing", label: "Pesagem", permissions: ["admin.weighing"] },
  { key: "treatments", label: "Tratamentos", permissions: ["admin.treatments"] },
  { key: "exams", label: "Exames", permissions: ["admin.exams"] },
  { key: "documents", label: "Documentos", permissions: ["admin.documents"] },
  { key: "crm", label: "CRM de clientes", permissions: ["admin.crm"] },
  { key: "showcase", label: "Vitrine de filhotes", permissions: ["showcase.manage"] },
  { key: "controlPanel", label: "Painel de Controle", permissions: ["admin.tacticalPanel"] },
  { key: "evolutionComparison", label: "Comparativo de Evolução", permissions: [] },
  { key: "basicReports", label: "Relatórios básicos", permissions: ["admin.reports"] },
  { key: "advancedReports", label: "Relatórios avançados", permissions: ["admin.reportsAdvanced"] },
  { key: "financialAdmin", label: "Administrativo financeiro", permissions: ["admin.administrative", "admin.quickLaunch", "admin.revenues", "admin.sales"] },
  { key: "payablesReceivables", label: "Contas a pagar/receber", permissions: ["admin.administrative"] },
  { key: "cashFlow", label: "Fluxo de caixa", permissions: ["admin.reportsAdvanced"] },
];

const DEFAULT_PROFILE_RULES = {
  limits: {
    kittensPerYear: { basic: 10, master: 40, premium: null },
    littersPerYear: { basic: 4, master: 15, premium: null },
    uploadLimitKb: { basic: 512, master: 1024, premium: 2048 },
    signatureDocumentsPerMonth: { basic: 5, master: 10, premium: null },
    pdfReducerPerMonth: { basic: 2, master: 5, premium: null },
  },
  features: Object.fromEntries(
    FEATURE_ROWS.map((row) => [
      row.key,
      {
        basic: ["breeders", "matings", "history", "vaccinations"].includes(row.key),
        master: !["basicReports", "advancedReports", "financialAdmin", "payablesReceivables", "cashFlow"].includes(row.key),
        premium: true,
      },
    ])
  ),
};

let currentRules = clone(DEFAULT_PROFILE_RULES);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeNullableNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.floor(number);
}

function normalizePlanKeyForRole(role) {
  const normalized = String(role || "BASIC").trim().toUpperCase();
  return ROLE_TO_PLAN_KEY[normalized] || "basic";
}

function mergeRules(input = {}) {
  const merged = clone(DEFAULT_PROFILE_RULES);

  LIMIT_ROWS.forEach((row) => {
    PLAN_KEYS.forEach((planKey) => {
      if (Object.prototype.hasOwnProperty.call(input?.limits?.[row.key] || {}, planKey)) {
        merged.limits[row.key][planKey] = normalizeNullableNumber(input.limits[row.key][planKey]);
      }
    });
  });

  FEATURE_ROWS.forEach((row) => {
    PLAN_KEYS.forEach((planKey) => {
      if (Object.prototype.hasOwnProperty.call(input?.features?.[row.key] || {}, planKey)) {
        merged.features[row.key][planKey] = Boolean(input.features[row.key][planKey]);
      }
    });
  });

  return merged;
}

function setProfileRulesConfig(rules) {
  currentRules = mergeRules(rules);
  return getProfileRulesConfig();
}

function getProfileRulesConfig() {
  return clone(currentRules);
}

async function loadProfileRulesConfig(prisma) {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: PROFILE_RULES_SETTING_KEY } });
    if (row?.value) {
      setProfileRulesConfig(JSON.parse(row.value));
    }
  } catch (err) {
    console.warn("Regras de perfis usando padrões do sistema:", err.message);
  }
}

async function saveProfileRulesConfig(prisma, rules) {
  const normalized = setProfileRulesConfig(rules);
  await prisma.systemSetting.upsert({
    where: { key: PROFILE_RULES_SETTING_KEY },
    update: { value: JSON.stringify(normalized) },
    create: { key: PROFILE_RULES_SETTING_KEY, value: JSON.stringify(normalized) },
  });
  return normalized;
}

function getLimitValueForRole(role, key) {
  const planKey = normalizePlanKeyForRole(role);
  return currentRules.limits?.[key]?.[planKey] ?? null;
}

function isFeatureEnabledForRole(role, key) {
  const normalized = String(role || "").trim().toUpperCase();
  if (normalized === "ADMIN") return true;
  const planKey = normalizePlanKeyForRole(normalized);
  return Boolean(currentRules.features?.[key]?.[planKey]);
}

function isPermissionEnabledForRole(role, permission) {
  const normalized = String(role || "").trim().toUpperCase();
  if (normalized === "ADMIN") return true;
  const feature = FEATURE_ROWS.find((row) => row.permissions.includes(permission));
  if (!feature) return null;
  return isFeatureEnabledForRole(normalized, feature.key);
}

function formatUploadLabel(kb) {
  const value = normalizeNullableNumber(kb);
  if (!value) return "Sem limite";
  if (value >= 1024) {
    const mb = value / 1024;
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1).replace(".", ",")} MB`;
  }
  return `${value} KB`;
}

function formatLimitForComparison(key, value) {
  if (value === null || value === undefined) return "Ilimitado";
  if (key === "uploadLimitKb") return `${formatUploadLabel(value)} por arquivo`;
  const row = LIMIT_ROWS.find((item) => item.key === key);
  if (key === "kittensPerYear") return `Até ${value} ${value === 1 ? "filhote" : "filhotes"}/ano`;
  if (key === "littersPerYear") return `Até ${value} ${value === 1 ? "ninhada" : "ninhadas"}/ano`;
  if (key === "signatureDocumentsPerMonth") return `${value} ${value === 1 ? "documento" : "documentos"}/mês`;
  if (key === "pdfReducerPerMonth") return `${value} ${value === 1 ? "arquivo" : "arquivos"}/mês`;
  return row ? `${value} ${row.unit}` : String(value);
}

function buildProfileRuleRows() {
  const rules = getProfileRulesConfig();
  return {
    planKeys: PLAN_KEYS,
    planLabels: PLAN_LABELS,
    limitRows: LIMIT_ROWS.map((row) => ({
      ...row,
      values: Object.fromEntries(PLAN_KEYS.map((planKey) => [planKey, rules.limits[row.key]?.[planKey] ?? null])),
    })),
    featureRows: FEATURE_ROWS.map((row) => ({
      ...row,
      values: Object.fromEntries(PLAN_KEYS.map((planKey) => [planKey, Boolean(rules.features[row.key]?.[planKey])])),
    })),
  };
}

module.exports = {
  PLAN_KEYS,
  PLAN_LABELS,
  PLAN_KEY_TO_ROLE,
  LIMIT_ROWS,
  FEATURE_ROWS,
  DEFAULT_PROFILE_RULES,
  getProfileRulesConfig,
  setProfileRulesConfig,
  loadProfileRulesConfig,
  saveProfileRulesConfig,
  getLimitValueForRole,
  isFeatureEnabledForRole,
  isPermissionEnabledForRole,
  formatUploadLabel,
  formatLimitForComparison,
  buildProfileRuleRows,
  normalizePlanKeyForRole,
};
