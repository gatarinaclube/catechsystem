const ROLES = {
  ADMIN: "ADMIN",
  PREMIUM: "PREMIUM",
  MASTER: "MASTER",
  BASIC: "BASIC",
  CATBREED: "CATBREED",
};

const LEGACY_ROLE_MAP = {
  USER: ROLES.BASIC,
  BASICO: ROLES.BASIC,
  "BÁSICO": ROLES.BASIC,
  BASIC: ROLES.BASIC,
  PREMIUM: ROLES.PREMIUM,
  MASTER: ROLES.MASTER,
  ADMIN: ROLES.ADMIN,
  CATBREED: ROLES.CATBREED,
};

const ROLE_LABELS = {
  [ROLES.ADMIN]: "Administrador",
  [ROLES.PREMIUM]: "Premium",
  [ROLES.MASTER]: "Master",
  [ROLES.BASIC]: "Básico",
  [ROLES.CATBREED]: "Catbreed",
};

const PERMISSIONS = {
  "dashboard.view": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "profile.self": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC, ROLES.CATBREED],
  "cats.manage": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "cats.view.all": [ROLES.ADMIN],
  "services.portal": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "services.my": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "services.downloads": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "service.litter": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "service.transfer": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "service.secondCopy": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "service.titleHomologation": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "service.pedigreeHomologation": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "service.catteryRegistration": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "admin.users": [ROLES.ADMIN],
  "admin.ffb": [ROLES.ADMIN],
  "admin.gatarinaPhotos": [ROLES.ADMIN],
  "admin.settings": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "admin.breeders": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "admin.litters": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "admin.kittens": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "admin.matings": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "admin.vaccinations": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "admin.deworming": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "admin.weighing": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "admin.exams": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "admin.treatments": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "admin.history": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "admin.quickLaunch": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER],
  "admin.revenues": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER],
  "admin.crm": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER],
  "admin.sales": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER],
  "admin.tacticalPanel": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "admin.reports": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER],
  "admin.administrative": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER],
  "academy.access": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.CATBREED],
  "showcase.manage": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
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
