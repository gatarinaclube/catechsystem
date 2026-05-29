const { ROLES, normalizeRole } = require("./access");

const FILE_UPLOAD_LIMITS = {
  [ROLES.ADMIN]: { bytes: 5 * 1024 * 1024, label: "5 MB" },
  [ROLES.PREMIUM]: { bytes: 2 * 1024 * 1024, label: "2 MB" },
  [ROLES.MASTER]: { bytes: 1 * 1024 * 1024, label: "1 MB" },
  [ROLES.BASIC]: { bytes: 500 * 1024, label: "500 KB" },
  [ROLES.CATBREED]: { bytes: 500 * 1024, label: "500 KB" },
};

const CREATION_LIMITS = {
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

function getFileUploadLimit(role) {
  return FILE_UPLOAD_LIMITS[normalizeRole(role)] || FILE_UPLOAD_LIMITS[ROLES.BASIC];
}

function getCreationLimits(role) {
  return CREATION_LIMITS[normalizeRole(role)] || CREATION_LIMITS[ROLES.BASIC];
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
  FILE_UPLOAD_LIMITS,
  getFileUploadLimit,
  getCreationLimits,
  validateFilesForRole,
  yearlyRange,
};
