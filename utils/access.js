const ROLES = {
  ADMIN: "ADMIN",
  PREMIUM: "PREMIUM",
  MASTER: "MASTER",
  BASIC: "BASIC",
};

const LEGACY_ROLE_MAP = {
  USER: ROLES.BASIC,
};

const ROLE_LABELS = {
  [ROLES.ADMIN]: "Administrador",
  [ROLES.PREMIUM]: "Premium",
  [ROLES.MASTER]: "Master",
  [ROLES.BASIC]: "Básico",
};

const PERMISSIONS = {
  "dashboard.view": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "profile.self": [ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "cats.manage": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "cats.view.all": [ROLES.ADMIN],
  "services.portal": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "services.my": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "services.downloads": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "service.litter": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "service.transfer": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER, ROLES.BASIC],
  "service.secondCopy": [ROLES.ADMIN, ROLES.PREMIUM, ROLES.MASTER],
  "service.titleHomologation": [ROLES.ADMIN, ROLES.PREMIUM],
  "service.pedigreeHomologation": [ROLES.ADMIN, ROLES.PREMIUM],
  "service.catteryRegistration": [ROLES.ADMIN, ROLES.PREMIUM],
  "admin.users": [ROLES.ADMIN],
  "admin.ffb": [ROLES.ADMIN],
  "admin.breeders": [ROLES.ADMIN],
  "admin.litters": [ROLES.ADMIN],
  "admin.kittens": [ROLES.ADMIN],
  "admin.matings": [ROLES.ADMIN],
  "admin.vaccinations": [ROLES.ADMIN],
  "admin.deworming": [ROLES.ADMIN],
  "admin.weighing": [ROLES.ADMIN],
  "admin.exams": [ROLES.ADMIN],
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

function buildAccessContext(role) {
  const normalizedRole = normalizeRole(role);

  return {
    role: normalizedRole,
    roleLabel: getRoleLabel(normalizedRole),
    isAdmin: isAdminRole(normalizedRole),
    canManageCats: userCan(normalizedRole, "cats.manage"),
    canViewAllCats: userCan(normalizedRole, "cats.view.all"),
    canAccessServices: userCan(normalizedRole, "services.portal"),
    canAccessMyProfile: userCan(normalizedRole, "profile.self"),
    canManageUsers: userCan(normalizedRole, "admin.users"),
    canAccessFfbServices: userCan(normalizedRole, "admin.ffb"),
    canAccessBreeders: userCan(normalizedRole, "admin.breeders"),
    canAccessLittersAdmin: userCan(normalizedRole, "admin.litters"),
    canAccessKittensAdmin: userCan(normalizedRole, "admin.kittens"),
    canAccessMatingsAdmin: userCan(normalizedRole, "admin.matings"),
    canAccessVaccinationsAdmin: userCan(normalizedRole, "admin.vaccinations"),
    canAccessDewormingAdmin: userCan(normalizedRole, "admin.deworming"),
    canAccessWeighingAdmin: userCan(normalizedRole, "admin.weighing"),
    canAccessExamsAdmin: userCan(normalizedRole, "admin.exams"),
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
  buildAccessContext,
};
