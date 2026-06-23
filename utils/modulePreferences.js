const { PERMISSIONS, ROLES, getRoleLabel, normalizeRole, userCan } = require("./access");

const MODULE_PREFERENCES = [
  { key: "cats", label: "Meus Gatos", group: "Principal", permission: "cats.manage" },
  { key: "services", label: "Serviços", group: "Principal", permission: "services.portal", defaultHidden: true },
  { key: "breeders", label: "Reprodutores", group: "Gestão do Gatil", permission: "admin.breeders" },
  { key: "matings", label: "Acasalamentos", group: "Gestão do Gatil", permission: "admin.matings" },
  { key: "litters", label: "Ninhadas", group: "Gestão do Gatil", permission: "admin.litters" },
  { key: "kittens", label: "Filhotes", group: "Gestão do Gatil", permission: "admin.kittens" },
  { key: "vaccinations", label: "Vacinação", group: "Gestão do Gatil", permission: "admin.vaccinations" },
  { key: "deworming", label: "Vermifugação", group: "Gestão do Gatil", permission: "admin.deworming" },
  { key: "weighing", label: "Pesagem", group: "Gestão do Gatil", permission: "admin.weighing" },
  { key: "treatments", label: "Tratamento", group: "Gestão do Gatil", permission: "admin.treatments" },
  { key: "exams", label: "Exames", group: "Gestão do Gatil", permission: "admin.exams" },
  { key: "history", label: "Histórico", group: "Gestão do Gatil", permission: "admin.history" },
  { key: "administrative", label: "Financeiro", group: "Administrativo", permission: "admin.administrative" },
  { key: "documents", label: "Documentos", group: "Administrativo", permission: "admin.documents" },
  { key: "reports", label: "Relatórios", group: "Administrativo", permission: "admin.reports" },
  { key: "tacticalPanel", label: "Painel", group: "Administrativo", permission: "admin.tacticalPanel" },
  { key: "crm", label: "CRM", group: "Administrativo", permission: "admin.crm" },
  { key: "showcase", label: "Vitrine de Filhotes", group: "Administrativo", permission: "showcase.manage" },
  { key: "ffbServices", label: "Serviços FFB", group: "Administrador", permission: "admin.ffb", adminOnly: true },
  { key: "gatarinaPhotos", label: "Fotos Gatarina 2026", group: "Administrador", permission: "admin.gatarinaPhotos", adminOnly: true },
  { key: "users", label: "Usuários", group: "Administrador", permission: "admin.users", adminOnly: true },
  { key: "microchips", label: "Gestão de Microchip", group: "Administrador", permission: "admin.microchips", adminOnly: true },
  { key: "financeSettings", label: "Financeiro técnico", group: "Administrador", permission: "admin.financeSettings", adminOnly: true },
  { key: "academy", label: "CatBreeder Pro", group: "Academy", permission: "academy.access" },
];

function parsePreferenceJson(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

function normalizeModulePreferences(value) {
  const selected = parsePreferenceJson(value);
  if (!selected) {
    return MODULE_PREFERENCES
      .filter((module) => !module.defaultHidden)
      .map((module) => module.key);
  }
  const validKeys = new Set(MODULE_PREFERENCES.map((module) => module.key));
  return selected.filter((key) => validKeys.has(key));
}

function isModuleEnabled(preferences, key) {
  if (!key) return true;
  const selected = Array.isArray(preferences) ? preferences : normalizeModulePreferences(preferences);
  return selected.includes(key);
}

function roleRequirementLabel(permission) {
  const allowedRoles = PERMISSIONS[permission] || [];
  if (allowedRoles.includes(ROLES.ADMIN) && allowedRoles.length === 1) {
    return "Administrador";
  }

  const commercialRoles = [ROLES.BASIC, ROLES.MASTER, ROLES.PREMIUM]
    .filter((role) => allowedRoles.includes(role))
    .map(getRoleLabel);
  const associateRoles = [ROLES.ASSOCIADO_B, ROLES.ASSOCIADO_A, ROLES.ASSOCIADO_PREMIUM]
    .filter((role) => allowedRoles.includes(role))
    .map(getRoleLabel);

  if (commercialRoles.length && associateRoles.length) {
    return `${commercialRoles.join(", ")} ou ${associateRoles.join(", ")}`;
  }
  if (commercialRoles.length) return commercialRoles.join(", ");
  if (associateRoles.length) return associateRoles.join(", ");
  return allowedRoles.map(getRoleLabel).join(", ") || "Plano não disponível";
}

function modulePreferenceRowsForRole(role, selectedPreferences) {
  const normalizedRole = normalizeRole(role);
  const selected = Array.isArray(selectedPreferences)
    ? selectedPreferences
    : normalizeModulePreferences(selectedPreferences);

  return MODULE_PREFERENCES.map((module) => {
    const allowed = userCan(normalizedRole, module.permission);
    return {
      ...module,
      allowed,
      checked: allowed && selected.includes(module.key),
      requirementLabel: allowed ? "" : roleRequirementLabel(module.permission),
    };
  });
}

module.exports = {
  MODULE_PREFERENCES,
  isModuleEnabled,
  modulePreferenceRowsForRole,
  normalizeModulePreferences,
};
