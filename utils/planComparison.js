const { ROLES, getRoleLabel, normalizeRole } = require("./access");
const {
  FEATURE_ROWS,
  LIMIT_ROWS,
  PLAN_KEY_TO_ROLE,
  formatLimitForComparison,
  getProfileRulesConfig,
} = require("./profileRules");

const ROLE_TO_PLAN_KEY = {
  [ROLES.BASIC]: "basic",
  [ROLES.ASSOCIADO_B]: "basic",
  [ROLES.MASTER]: "master",
  [ROLES.ASSOCIADO_A]: "master",
  [ROLES.PREMIUM]: "premium",
  [ROLES.ASSOCIADO_PREMIUM]: "premium",
};

function planKeyForRole(role) {
  return ROLE_TO_PLAN_KEY[normalizeRole(role)] || "basic";
}

function buildPlanComparisonRows() {
  const rules = getProfileRulesConfig();
  const limitRows = LIMIT_ROWS.map((row) => ({
    label: row.label,
    type: "text",
    values: Object.fromEntries(
      Object.keys(PLAN_KEY_TO_ROLE).map((planKey) => [
        planKey,
        formatLimitForComparison(row.key, rules.limits[row.key]?.[planKey] ?? null),
      ])
    ),
  }));
  const featureRows = FEATURE_ROWS.map((row) => ({
    label: row.label,
    type: "check",
    values: Object.fromEntries(
      Object.keys(PLAN_KEY_TO_ROLE).map((planKey) => [planKey, Boolean(rules.features[row.key]?.[planKey])])
    ),
  }));

  return [...limitRows, ...featureRows];
}

function buildProfilePlanCards(currentRole) {
  const normalizedCurrentRole = normalizeRole(currentRole);
  const isAssociate = [ROLES.ASSOCIADO_B, ROLES.ASSOCIADO_A, ROLES.ASSOCIADO_PREMIUM].includes(normalizedCurrentRole);
  const roles = isAssociate
    ? [ROLES.ASSOCIADO_B, ROLES.ASSOCIADO_A, ROLES.ASSOCIADO_PREMIUM]
    : [ROLES.BASIC, ROLES.MASTER, ROLES.PREMIUM];
  const comparisonRows = buildPlanComparisonRows();

  return roles.map((role) => {
    const planKey = planKeyForRole(role);
    return {
      role,
      planKey,
      title: getRoleLabel(role),
      isCurrent: normalizedCurrentRole === role,
      rows: comparisonRows.map((row) => ({
        label: row.label,
        type: row.type,
        value: row.values[planKey],
      })),
    };
  });
}

module.exports = {
  buildPlanComparisonRows,
  buildProfilePlanCards,
  planKeyForRole,
};
