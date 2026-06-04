const { ROLES, normalizeRole, getRoleLabel } = require("./access");

const MANAGED_PLAN_ROLES = [
  ROLES.PREMIUM,
  ROLES.ASSOCIADO_A,
  ROLES.ASSOCIADO_B,
  ROLES.MASTER,
  ROLES.BASIC,
];

const DEFAULT_FILE_UPLOAD_LIMITS = {
  [ROLES.ADMIN]: { bytes: 5 * 1024 * 1024, label: "5 MB", kb: 5 * 1024 },
  [ROLES.PREMIUM]: { bytes: 2 * 1024 * 1024, label: "2 MB", kb: 2 * 1024 },
  [ROLES.MASTER]: { bytes: 1 * 1024 * 1024, label: "1 MB", kb: 1 * 1024 },
  [ROLES.ASSOCIADO_A]: { bytes: 1 * 1024 * 1024, label: "1 MB", kb: 1 * 1024 },
  [ROLES.ASSOCIADO_B]: { bytes: 500 * 1024, label: "500 KB", kb: 500 },
  [ROLES.BASIC]: { bytes: 500 * 1024, label: "500 KB", kb: 500 },
  [ROLES.CATBREED]: { bytes: 500 * 1024, label: "500 KB", kb: 500 },
};

const DEFAULT_CREATION_LIMITS = {
  [ROLES.ADMIN]: {
    breeders: null,
    showcaseLitters: null,
    littersPerYear: null,
    kittensPerYear: null,
  },
  [ROLES.PREMIUM]: {
    breeders: null,
    showcaseLitters: null,
    littersPerYear: null,
    kittensPerYear: null,
  },
  [ROLES.MASTER]: {
    breeders: 10,
    showcaseLitters: 3,
    littersPerYear: 10,
    kittensPerYear: 40,
  },
  [ROLES.ASSOCIADO_A]: {
    breeders: 10,
    showcaseLitters: 3,
    littersPerYear: 10,
    kittensPerYear: 40,
  },
  [ROLES.ASSOCIADO_B]: {
    breeders: 3,
    showcaseLitters: 1,
    littersPerYear: 2,
    kittensPerYear: 10,
  },
  [ROLES.BASIC]: {
    breeders: 3,
    showcaseLitters: 1,
    littersPerYear: 2,
    kittensPerYear: 10,
  },
  [ROLES.CATBREED]: {
    breeders: 0,
    showcaseLitters: 0,
    littersPerYear: 0,
    kittensPerYear: 0,
  },
};

let roleLimitOverrides = {};

function normalizeNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function formatUploadLabel(kb) {
  if (!Number.isFinite(kb) || kb <= 0) return "Sem limite";
  if (kb >= 1024) {
    const mb = kb / 1024;
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1).replace(".", ",")} MB`;
  }
  return `${kb} KB`;
}

function rowToOverride(row) {
  if (!row || !row.role) return null;
  const role = normalizeRole(row.role);
  return {
    role,
    uploadLimitKb: normalizeNullableNumber(row.uploadLimitKb),
    breeders: normalizeNullableNumber(row.breeders),
    showcaseLitters: normalizeNullableNumber(row.showcaseLitters),
    littersPerYear: normalizeNullableNumber(row.littersPerYear),
    kittensPerYear: normalizeNullableNumber(row.kittensPerYear),
  };
}

function setPlanLimitOverrides(rows = []) {
  roleLimitOverrides = {};
  rows.map(rowToOverride).filter(Boolean).forEach((row) => {
    roleLimitOverrides[row.role] = row;
  });
}

async function loadPlanLimitOverrides(prisma) {
  try {
    const rows = await prisma.rolePlanLimit.findMany();
    setPlanLimitOverrides(rows);
  } catch (err) {
    console.warn("Limites de perfis usando padrões do sistema:", err.message);
  }
}

function getFileUploadLimit(role) {
  const normalized = normalizeRole(role);
  const defaults = DEFAULT_FILE_UPLOAD_LIMITS[normalized] || DEFAULT_FILE_UPLOAD_LIMITS[ROLES.BASIC];
  const overrideKb = roleLimitOverrides[normalized]?.uploadLimitKb;

  if (!Number.isFinite(overrideKb) || overrideKb <= 0) return defaults;

  return {
    kb: overrideKb,
    bytes: overrideKb * 1024,
    label: formatUploadLabel(overrideKb),
  };
}

function getCreationLimits(role) {
  const normalized = normalizeRole(role);
  const defaults = DEFAULT_CREATION_LIMITS[normalized] || DEFAULT_CREATION_LIMITS[ROLES.BASIC];
  const override = roleLimitOverrides[normalized];

  if (!override) return { ...defaults };

  return {
    breeders: override.breeders,
    showcaseLitters: override.showcaseLitters,
    littersPerYear: override.littersPerYear,
    kittensPerYear: override.kittensPerYear,
  };
}

function getPlanLimitRows() {
  return MANAGED_PLAN_ROLES.map((role) => {
    const uploadLimit = getFileUploadLimit(role);
    const limits = getCreationLimits(role);
    const uploadLimitMb = uploadLimit.kb
      ? String(Math.round((uploadLimit.kb / 1024) * 10) / 10)
      : "";
    return {
      role,
      label: getRoleLabel(role),
      uploadLimitMb,
      uploadLimitLabel: uploadLimit.label,
      ...limits,
    };
  });
}

function validateFilesForRole(files, role) {
  const limit = getFileUploadLimit(role);
  const oversized = (files || []).find((file) => file.size > limit.bytes);

  if (!oversized) return;

  const error = new Error(`O arquivo ${oversized.originalname} ultrapassa o limite de ${limit.label} do seu perfil.`);
  error.code = "UPLOAD_LIMIT";
  throw error;
}

function yearlyRange(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
  return { start, end };
}

module.exports = {
  FILE_UPLOAD_LIMITS: DEFAULT_FILE_UPLOAD_LIMITS,
  CREATION_LIMITS: DEFAULT_CREATION_LIMITS,
  MANAGED_PLAN_ROLES,
  getFileUploadLimit,
  getCreationLimits,
  getPlanLimitRows,
  loadPlanLimitOverrides,
  setPlanLimitOverrides,
  validateFilesForRole,
  yearlyRange,
};
