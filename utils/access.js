const ROLES = {
  ADMIN: "ADMIN",
  PREMIUM: "PREMIUM",
  ASSOCIADO_PREMIUM: "ASSOCIADO_PREMIUM",
  MASTER: "MASTER",
  ASSOCIADO_A: "ASSOCIADO_A",
  ASSOCIADO_B: "ASSOCIADO_B",
  BASIC: "BASIC",
  CATBREED: "CATBREED",
};

const LEGACY_ROLE_MAP = {
  USER: ROLES.BASIC,
  BASICO: ROLES.BASIC,
  "BÁSICO": ROLES.BASIC,
  BASIC: ROLES.BASIC,
  PREMIUM: ROLES.PREMIUM,
  ASSOCIADO_PREMIUM: ROLES.ASSOCIADO_PREMIUM,
  "ASSOCIADO PREMIUM": ROLES.ASSOCIADO_PREMIUM,
  ASSOCIADOPREMIUM: ROLES.ASSOCIADO_PREMIUM,
  MASTER: ROLES.MASTER,
  ASSOCIADO_A: ROLES.ASSOCIADO_A,
  "ASSOCIADO A": ROLES.ASSOCIADO_A,
  "ASSOCIADO MASTER": ROLES.ASSOCIADO_A,
  ASSOCIADOMASTER: ROLES.ASSOCIADO_A,
  ASSOCIADOA: ROLES.ASSOCIADO_A,
  ASSOCIADO_B: ROLES.ASSOCIADO_B,
  "ASSOCIADO B": ROLES.ASSOCIADO_B,
  "ASSOCIADO BASICO": ROLES.ASSOCIADO_B,
  "ASSOCIADO BÁSICO": ROLES.ASSOCIADO_B,
  ASSOCIADOBASICO: ROLES.ASSOCIADO_B,
  ASSOCIADOB: ROLES.ASSOCIADO_B,
  ADMIN: ROLES.ADMIN,
  CATBREED: ROLES.CATBREED,
};

const ROLE_LABELS = {
  [ROLES.ADMIN]: "Administrador",
  [ROLES.PREMIUM]: "Premium",
  [ROLES.ASSOCIADO_PREMIUM]: "Associado Premium",
  [ROLES.MASTER]: "Master",
  [ROLES.ASSOCIADO_A]: "Associado Master",
  [ROLES.ASSOCIADO_B]: "Associado Básico",
  [ROLES.BASIC]: "Básico",
  [ROLES.CATBREED]: "Catbreed",
};

const BASIC_LEVEL_ROLES = [
  ROLES.ADMIN,
  ROLES.PREMIUM,
  ROLES.ASSOCIADO_PREMIUM,
  ROLES.MASTER,
  ROLES.ASSOCIADO_A,
  ROLES.BASIC,
  ROLES.ASSOCIADO_B,
];

const MASTER_LEVEL_ROLES = [
  ROLES.ADMIN,
  ROLES.PREMIUM,
  ROLES.ASSOCIADO_PREMIUM,
  ROLES.MASTER,
  ROLES.ASSOCIADO_A,
];

const PERMISSIONS = {
  "dashboard.view": BASIC_LEVEL_ROLES,
  "profile.self": [...BASIC_LEVEL_ROLES, ROLES.CATBREED],
  "cats.manage": BASIC_LEVEL_ROLES,
  "cats.view.all": [ROLES.ADMIN],
  "services.portal": BASIC_LEVEL_ROLES,
  "services.my": BASIC_LEVEL_ROLES,
  "services.downloads": BASIC_LEVEL_ROLES,
  "service.litter": BASIC_LEVEL_ROLES,
  "service.transfer": BASIC_LEVEL_ROLES,
  "service.secondCopy": BASIC_LEVEL_ROLES,
  "service.titleHomologation": BASIC_LEVEL_ROLES,
  "service.pedigreeHomologation": BASIC_LEVEL_ROLES,
  "service.catteryRegistration": BASIC_LEVEL_ROLES,
  "admin.users": [ROLES.ADMIN],
  "admin.ffb": [ROLES.ADMIN],
  "admin.gatarinaPhotos": [ROLES.ADMIN],
  "admin.settings": BASIC_LEVEL_ROLES,
  "admin.breeders": BASIC_LEVEL_ROLES,
  "admin.litters": BASIC_LEVEL_ROLES,
  "admin.kittens": BASIC_LEVEL_ROLES,
  "admin.matings": BASIC_LEVEL_ROLES,
  "admin.vaccinations": BASIC_LEVEL_ROLES,
  "admin.deworming": BASIC_LEVEL_ROLES,
  "admin.weighing": BASIC_LEVEL_ROLES,
  "admin.exams": BASIC_LEVEL_ROLES,
  "admin.treatments": BASIC_LEVEL_ROLES,
  "admin.history": BASIC_LEVEL_ROLES,
  "admin.quickLaunch": MASTER_LEVEL_ROLES,
  "admin.revenues": MASTER_LEVEL_ROLES,
  "admin.crm": MASTER_LEVEL_ROLES,
  "admin.sales": MASTER_LEVEL_ROLES,
  "admin.tacticalPanel": BASIC_LEVEL_ROLES,
  "admin.documents": BASIC_LEVEL_ROLES,
  "admin.reports": MASTER_LEVEL_ROLES,
  "admin.administrative": MASTER_LEVEL_ROLES,
  "academy.access": [ROLES.ADMIN],
  "showcase.manage": BASIC_LEVEL_ROLES,
};

function normalizeRole(role) {
  if (!role) {
    return ROLES.BASIC;
  }

  const normalized = String(role).trim().toUpperCase();
  return LEGACY_ROLE_MAP[normalized] || normalized;
}

function getRoleLabel(role) {
  return ROLE_LABELS[normalizeRole(role)] || "Usuário";
}

function userCan(role, permission) {
  const normalizedRole = normalizeRole(role);
  const allowedRoles = PERMISSIONS[permission] || [];
  return allowedRoles.includes(normalizedRole);
}

function isAdminRole(role) {
  return normalizeRole(role) === ROLES.ADMIN;
}

function canViewAllData(role) {
  return isAdminRole(role);
}

function buildAccessContext(role) {
  const normalizedRole = normalizeRole(role);

  return {
    role: normalizedRole,
    roleLabel: getRoleLabel(normalizedRole),
    isAdmin: isAdminRole(normalizedRole),
    canViewAllData: canViewAllData(normalizedRole),
    canManageCats: userCan(normalizedRole, "cats.manage"),
    canViewAllCats: userCan(normalizedRole, "cats.view.all"),
    canAccessServices: userCan(normalizedRole, "services.portal"),
    canAccessMyProfile: userCan(normalizedRole, "profile.self"),
    canManageUsers: userCan(normalizedRole, "admin.users"),
    canAccessFfbServices: userCan(normalizedRole, "admin.ffb"),
    canManageGatarinaPhotos: userCan(normalizedRole, "admin.gatarinaPhotos"),
    canAccessSettings: userCan(normalizedRole, "admin.settings"),
    canAccessBreeders: userCan(normalizedRole, "admin.breeders"),
    canAccessLittersAdmin: userCan(normalizedRole, "admin.litters"),
    canAccessKittensAdmin: userCan(normalizedRole, "admin.kittens"),
    canAccessMatingsAdmin: userCan(normalizedRole, "admin.matings"),
    canAccessVaccinationsAdmin: userCan(normalizedRole, "admin.vaccinations"),
    canAccessDewormingAdmin: userCan(normalizedRole, "admin.deworming"),
    canAccessWeighingAdmin: userCan(normalizedRole, "admin.weighing"),
    canAccessExamsAdmin: userCan(normalizedRole, "admin.exams"),
    canAccessTreatmentsAdmin: userCan(normalizedRole, "admin.treatments"),
    canAccessHistoryAdmin: userCan(normalizedRole, "admin.history"),
    canAccessQuickLaunch: userCan(normalizedRole, "admin.quickLaunch"),
    canAccessRevenues: userCan(normalizedRole, "admin.revenues"),
    canAccessCrm: userCan(normalizedRole, "admin.crm"),
    canAccessSales: userCan(normalizedRole, "admin.sales"),
    canAccessTacticalPanel: userCan(normalizedRole, "admin.tacticalPanel"),
    canAccessDocuments: userCan(normalizedRole, "admin.documents"),
    canAccessReports: userCan(normalizedRole, "admin.reports"),
    canAccessAdministrative: userCan(normalizedRole, "admin.administrative"),
    canAccessAcademy: userCan(normalizedRole, "academy.access"),
    canManageShowcase: userCan(normalizedRole, "showcase.manage"),
    canUseLitterService: userCan(normalizedRole, "service.litter"),
    canUseTransferService: userCan(normalizedRole, "service.transfer"),
    canUseSecondCopyService: userCan(normalizedRole, "service.secondCopy"),
    canUseTitleHomologationService: userCan(
      normalizedRole,
      "service.titleHomologation"
    ),
    canUsePedigreeHomologationService: userCan(
      normalizedRole,
      "service.pedigreeHomologation"
    ),
    canUseCatteryRegistrationService: userCan(
      normalizedRole,
      "service.catteryRegistration"
    ),
    canDownloadServiceForms: userCan(normalizedRole, "services.downloads"),
  };
}

module.exports = {
  ROLES,
  ROLE_LABELS,
  normalizeRole,
  getRoleLabel,
  userCan,
  isAdminRole,
  canViewAllData,
  buildAccessContext,
};
