const { ROLES, getRoleLabel, normalizeRole } = require("./access");
const { getCreationLimits, getFileUploadLimit } = require("./planLimits");

const FEATURE_COMPARISON_ROWS = [
  { label: "Assinatura Eletrônica", type: "text", values: { basic: "5 documentos/mês", master: "10 documentos/mês", premium: "Ilimitado" } },
  { label: "Reprodutores", type: "check", values: { basic: true, master: true, premium: true } },
  { label: "Acasalamentos", type: "check", values: { basic: true, master: true, premium: true } },
  { label: "Histórico do gato", type: "check", values: { basic: true, master: true, premium: true } },
  { label: "Vacinação", type: "check", values: { basic: true, master: true, premium: true } },
  { label: "Notificações", type: "check", values: { basic: false, master: true, premium: true } },
  { label: "Vermifugação", type: "check", values: { basic: false, master: true, premium: true } },
  { label: "Pesagem", type: "check", values: { basic: false, master: true, premium: true } },
  { label: "Tratamentos", type: "check", values: { basic: false, master: true, premium: true } },
  { label: "Exames", type: "check", values: { basic: false, master: true, premium: true } },
  { label: "Documentos", type: "check", values: { basic: false, master: true, premium: true } },
  { label: "CRM de clientes", type: "check", values: { basic: false, master: true, premium: true } },
  { label: "Vitrine de filhotes", type: "check", values: { basic: false, master: true, premium: true } },
  { label: "Painel de Controle", type: "check", values: { basic: false, master: true, premium: true } },
  { label: "Comparativo de Evolução", type: "check", values: { basic: false, master: true, premium: true } },
  { label: "Relatórios básicos", type: "check", values: { basic: false, master: false, premium: true } },
  { label: "Relatórios avançados", type: "check", values: { basic: false, master: false, premium: true } },
  { label: "Administrativo financeiro", type: "check", values: { basic: false, master: false, premium: true } },
  { label: "Contas a pagar/receber", type: "check", values: { basic: false, master: false, premium: true } },
  { label: "Fluxo de caixa", type: "check", values: { basic: false, master: false, premium: true } },
];

const ROLE_TO_PLAN_KEY = {
  [ROLES.BASIC]: "basic",
  [ROLES.ASSOCIADO_B]: "basic",
  [ROLES.MASTER]: "master",
  [ROLES.ASSOCIADO_A]: "master",
  [ROLES.PREMIUM]: "premium",
  [ROLES.ASSOCIADO_PREMIUM]: "premium",
};

const PLAN_KEY_TO_ROLE = {
  basic: ROLES.BASIC,
  master: ROLES.MASTER,
  premium: ROLES.PREMIUM,
};

function planKeyForRole(role) {
  return ROLE_TO_PLAN_KEY[normalizeRole(role)] || "basic";
}

function yearlyLimitLabel(value, singular, plural) {
  if (value === null || value === undefined) return "Ilimitado";
  return `Até ${value} ${value === 1 ? singular : plural}/ano`;
}

function buildPlanComparisonRows() {
  const valuesFor = (picker) => Object.fromEntries(
    Object.entries(PLAN_KEY_TO_ROLE).map(([planKey, role]) => [planKey, picker(role)])
  );

  return [
    {
      label: "Cadastro de Filhotes",
      type: "text",
      values: valuesFor((role) => yearlyLimitLabel(getCreationLimits(role).kittensPerYear, "filhote", "filhotes")),
    },
    {
      label: "Ninhadas",
      type: "text",
      values: valuesFor((role) => yearlyLimitLabel(getCreationLimits(role).littersPerYear, "ninhada", "ninhadas")),
    },
    {
      label: "Upload",
      type: "text",
      values: valuesFor((role) => `${getFileUploadLimit(role).label} por arquivo`),
    },
    ...FEATURE_COMPARISON_ROWS,
  ];
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
