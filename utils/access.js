const ROLES = {
  ADMIN: "ADMIN",
  PREMIUM: "PREMIUM",
  MASTER: "MASTER",
  BASIC: "BASIC",
  CATBREED: "CATBREED",
};

const LEGACY_ROLE_MAP = {
  USER: ROLES.BASIC,
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
  "profile.self": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "cats.manage": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "cats.view.all": [ROLES.ADMIN],
  "services.portal": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER],
  "services.my": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER],
  "services.downloads": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER],
  "service.litter": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER],
  "service.transfer": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER],
  "service.secondCopy": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER],
  "service.titleHomologation": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER],
  "service.pedigreeHomologation": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER],
  "service.catteryRegistration": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER],
  "admin.users": [ROLES.ADMIN, ROLES.PREMIUM],
  "admin.ffb": [ROLES.ADMIN, ROLES.PREMIUM],
  "admin.settings": [ROLES.ADMIN, ROLES.PREMIUM],
  "admin.breeders": [ROLES.ADMIN, ROLES.PREMIUM],
  "admin.litters": [ROLES.ADMIN, ROLES.PREMIUM],
  "admin.kittens": [ROLES.ADMIN, ROLES.PREMIUM],
  "admin.matings": [ROLES.ADMIN, ROLES.PREMIUM],
  "admin.vaccinations": [ROLES.ADMIN, ROLES.PREMIUM],
  "admin.deworming": [ROLES.ADMIN, ROLES.PREMIUM],
  "admin.weighing": [ROLES.ADMIN, ROLES.PREMIUM],
  "admin.exams": [ROLES.ADMIN, ROLES.PREMIUM],
  "admin.history": [ROLES.ADMIN, ROLES.PREMIUM],
  "admin.quickLaunch": [ROLES.ADMIN, ROLES.PREMIUM],
  "admin.revenues": [ROLES.ADMIN, ROLES.PREMIUM],
  "admin.crm": [ROLES.ADMIN, ROLES.PREMIUM],
  "admin.sales": [ROLES.ADMIN, ROLES.PREMIUM],
  "admin.reports": [ROLES.ADMIN, ROLES.PREMIUM],
  "admin.administrative": [ROLES.ADMIN, ROLES.PREMIUM],
  "academy.access": [ROLES.ADMIN, ROLES.PREMIUM],
};

function normalizeRole(role) {
  if (!role) {
    return ROLES.BASIC;
  }

  return LEGACY_ROLE_MAP[role] || role;
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
    canAccessSettings: userCan(normalizedRole, "admin.settings"),
    canAccessBreeders: userCan(normalizedRole, "admin.breeders"),
    canAccessLittersAdmin: userCan(normalizedRole, "admin.litters"),
    canAccessKittensAdmin: userCan(normalizedRole, "admin.kittens"),
    canAccessMatingsAdmin: userCan(normalizedRole, "admin.matings"),
    canAccessVaccinationsAdmin: userCan(normalizedRole, "admin.vaccinations"),
    canAccessDewormingAdmin: userCan(normalizedRole, "admin.deworming"),
    canAccessWeighingAdmin: userCan(normalizedRole, "admin.weighing"),
    canAccessExamsAdmin: userCan(normalizedRole, "admin.exams"),
    canAccessHistoryAdmin: userCan(normalizedRole, "admin.history"),
    canAccessQuickLaunch: userCan(normalizedRole, "admin.quickLaunch"),
    canAccessRevenues: userCan(normalizedRole, "admin.revenues"),
    canAccessCrm: userCan(normalizedRole, "admin.crm"),
    canAccessSales: userCan(normalizedRole, "admin.sales"),
    canAccessReports: userCan(normalizedRole, "admin.reports"),
    canAccessAdministrative: userCan(normalizedRole, "admin.administrative"),
    canAccessAcademy: userCan(normalizedRole, "academy.access"),
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
