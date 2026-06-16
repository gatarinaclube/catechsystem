const ASAAS_PRODUCTION_URL = "https://api.asaas.com/v3";
const ASAAS_SANDBOX_URL = "https://api-sandbox.asaas.com/v3";

const PLAN_ENV = {
  BASIC: "ASAAS_PLAN_BASIC_CENTS",
  MASTER: "ASAAS_PLAN_MASTER_CENTS",
  PREMIUM: "ASAAS_PLAN_PREMIUM_CENTS",
};

const PLAN_DEFAULT_CENTS = {
  BASIC: 1490,
  MASTER: 2490,
  PREMIUM: 3490,
};

const PLAN_ANNUAL_CARD_ENV = {
  BASIC: "ASAAS_PLAN_BASIC_ANNUAL_CARD_CENTS",
  MASTER: "ASAAS_PLAN_MASTER_ANNUAL_CARD_CENTS",
  PREMIUM: "ASAAS_PLAN_PREMIUM_ANNUAL_CARD_CENTS",
};

const PLAN_ANNUAL_CARD_DEFAULT_CENTS = {
  BASIC: 14990,
  MASTER: 24990,
  PREMIUM: 34990,
};

const PLAN_ANNUAL_PIX_ENV = {
  BASIC: "ASAAS_PLAN_BASIC_ANNUAL_PIX_CENTS",
  MASTER: "ASAAS_PLAN_MASTER_ANNUAL_PIX_CENTS",
  PREMIUM: "ASAAS_PLAN_PREMIUM_ANNUAL_PIX_CENTS",
};

const PLAN_ANNUAL_PIX_DEFAULT_CENTS = {
  BASIC: 12000,
  MASTER: 20000,
  PREMIUM: 30000,
};

const ASSOCIATION_PLAN_DEFAULT_CENTS = {
  ASSOCIADO_A: 30000,
  ASSOCIADO_PREMIUM: 35000,
};

const ASSOCIATION_FEE_DEFAULT_CENTS = 20000;
const ASAAS_SETTING_KEY = "asaas.billingConfig.v1";
const PLAN_KEYS = ["BASIC", "MASTER", "PREMIUM"];

let runtimeConfig = null;

function envCents(envName, fallback) {
  const value = Number(process.env[envName]);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function normalizeApiMode(value) {
  return String(value || "").toUpperCase() === "SANDBOX" ? "SANDBOX" : "PRODUCTION";
}

function normalizeBaseUrl(value, fallback) {
  return String(value || fallback || "").trim().replace(/\/$/, "");
}

function normalizeCents(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : fallback;
}

function defaultBillingConfigFromEnv() {
  const apiKey = String(process.env.ASAAS_API_KEY || "").trim();
  const inferredMode = apiKey.includes("$aact_hmlg_") ? "SANDBOX" : "PRODUCTION";
  const configuredBaseUrl = process.env.ASAAS_BASE_URL
    ? normalizeBaseUrl(process.env.ASAAS_BASE_URL)
    : null;

  return {
    apiMode: inferredMode,
    userAgent: String(process.env.ASAAS_USER_AGENT || "CaTechSystem/1.0").trim(),
    production: {
      apiKey: inferredMode === "PRODUCTION" ? apiKey : "",
      baseUrl: inferredMode === "PRODUCTION" && configuredBaseUrl ? configuredBaseUrl : ASAAS_PRODUCTION_URL,
      webhookToken: inferredMode === "PRODUCTION" ? String(process.env.ASAAS_WEBHOOK_TOKEN || "").trim() : "",
    },
    sandbox: {
      apiKey: inferredMode === "SANDBOX" ? apiKey : "",
      baseUrl: inferredMode === "SANDBOX" && configuredBaseUrl ? configuredBaseUrl : ASAAS_SANDBOX_URL,
      webhookToken: inferredMode === "SANDBOX" ? String(process.env.ASAAS_WEBHOOK_TOKEN || "").trim() : "",
    },
    commercial: {
      BASIC: {
        monthlyCents: envCents(PLAN_ENV.BASIC, PLAN_DEFAULT_CENTS.BASIC),
        annualCardCents: envCents(PLAN_ANNUAL_CARD_ENV.BASIC, PLAN_ANNUAL_CARD_DEFAULT_CENTS.BASIC),
        annualPixCents: envCents(PLAN_ANNUAL_PIX_ENV.BASIC, PLAN_ANNUAL_PIX_DEFAULT_CENTS.BASIC),
      },
      MASTER: {
        monthlyCents: envCents(PLAN_ENV.MASTER, PLAN_DEFAULT_CENTS.MASTER),
        annualCardCents: envCents(PLAN_ANNUAL_CARD_ENV.MASTER, PLAN_ANNUAL_CARD_DEFAULT_CENTS.MASTER),
        annualPixCents: envCents(PLAN_ANNUAL_PIX_ENV.MASTER, PLAN_ANNUAL_PIX_DEFAULT_CENTS.MASTER),
      },
      PREMIUM: {
        monthlyCents: envCents(PLAN_ENV.PREMIUM, PLAN_DEFAULT_CENTS.PREMIUM),
        annualCardCents: envCents(PLAN_ANNUAL_CARD_ENV.PREMIUM, PLAN_ANNUAL_CARD_DEFAULT_CENTS.PREMIUM),
        annualPixCents: envCents(PLAN_ANNUAL_PIX_ENV.PREMIUM, PLAN_ANNUAL_PIX_DEFAULT_CENTS.PREMIUM),
      },
    },
    association: {
      joinFeeCents: envCents("ASAAS_ASSOCIATION_JOIN_FEE_CENTS", ASSOCIATION_FEE_DEFAULT_CENTS),
      masterAnnualCents: envCents("ASAAS_ASSOCIATION_MASTER_ANNUAL_CENTS", ASSOCIATION_PLAN_DEFAULT_CENTS.ASSOCIADO_A),
      premiumAnnualCents: envCents("ASAAS_ASSOCIATION_PREMIUM_ANNUAL_CENTS", ASSOCIATION_PLAN_DEFAULT_CENTS.ASSOCIADO_PREMIUM),
    },
  };
}

function normalizeBillingConfig(input = {}) {
  const fallback = defaultBillingConfigFromEnv();
  const commercial = {};

  for (const key of PLAN_KEYS) {
    commercial[key] = {
      monthlyCents: normalizeCents(
        input.commercial?.[key]?.monthlyCents,
        fallback.commercial[key].monthlyCents
      ),
      annualCardCents: normalizeCents(
        input.commercial?.[key]?.annualCardCents,
        fallback.commercial[key].annualCardCents
      ),
      annualPixCents: normalizeCents(
        input.commercial?.[key]?.annualPixCents,
        fallback.commercial[key].annualPixCents
      ),
    };
  }

  return {
    apiMode: normalizeApiMode(input.apiMode || fallback.apiMode),
    userAgent: String(input.userAgent || fallback.userAgent || "CaTechSystem/1.0").trim(),
    production: {
      apiKey: String(input.production?.apiKey ?? fallback.production.apiKey ?? "").trim(),
      baseUrl: normalizeBaseUrl(input.production?.baseUrl, fallback.production.baseUrl || ASAAS_PRODUCTION_URL),
      webhookToken: String(input.production?.webhookToken ?? fallback.production.webhookToken ?? "").trim(),
    },
    sandbox: {
      apiKey: String(input.sandbox?.apiKey ?? fallback.sandbox.apiKey ?? "").trim(),
      baseUrl: normalizeBaseUrl(input.sandbox?.baseUrl, fallback.sandbox.baseUrl || ASAAS_SANDBOX_URL),
      webhookToken: String(input.sandbox?.webhookToken ?? fallback.sandbox.webhookToken ?? "").trim(),
    },
    commercial,
    association: {
      joinFeeCents: normalizeCents(input.association?.joinFeeCents, fallback.association.joinFeeCents),
      masterAnnualCents: normalizeCents(input.association?.masterAnnualCents, fallback.association.masterAnnualCents),
      premiumAnnualCents: normalizeCents(input.association?.premiumAnnualCents, fallback.association.premiumAnnualCents),
    },
  };
}

function getAsaasRuntimeConfig() {
  if (!runtimeConfig) {
    runtimeConfig = normalizeBillingConfig();
  }
  return runtimeConfig;
}

function setAsaasRuntimeConfig(config) {
  runtimeConfig = normalizeBillingConfig(config);
  return runtimeConfig;
}

async function loadAsaasRuntimeConfig(prisma) {
  if (!prisma?.systemSetting) {
    return setAsaasRuntimeConfig(defaultBillingConfigFromEnv());
  }

  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key: ASAAS_SETTING_KEY },
    });

    if (row?.value) {
      return setAsaasRuntimeConfig(JSON.parse(row.value));
    }
  } catch (err) {
    console.warn("Não foi possível carregar configuração Asaas do banco:", err.message);
  }

  return setAsaasRuntimeConfig(defaultBillingConfigFromEnv());
}

function activeApiConfig() {
  const config = getAsaasRuntimeConfig();
  return config.apiMode === "SANDBOX" ? config.sandbox : config.production;
}

function maskSecret(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= 8) return "••••";
  return `••••${text.slice(-4)}`;
}

function cleanDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function isAsaasConfigured() {
  return Boolean(activeApiConfig().apiKey);
}

function asaasBaseUrl() {
  const config = getAsaasRuntimeConfig();
  const api = activeApiConfig();
  return normalizeBaseUrl(
    api.baseUrl,
    config.apiMode === "SANDBOX" ? ASAAS_SANDBOX_URL : ASAAS_PRODUCTION_URL
  );
}

function planPriceCents(planKey) {
  const key = String(planKey || "").toUpperCase();
  if (!PLAN_KEYS.includes(key)) return null;
  return getAsaasRuntimeConfig().commercial[key]?.monthlyCents || PLAN_DEFAULT_CENTS[key] || null;
}

function planPriceValue(planKey) {
  const cents = planPriceCents(planKey);
  return cents ? Number((cents / 100).toFixed(2)) : null;
}

function formatPlanPrice(planKey, fallback = "Valor a configurar") {
  const cents = planPriceCents(planKey);
  if (!cents) return fallback;
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateInput(date) {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function externalReference(userId, planKey, billingMode = "MONTHLY") {
  return `catech:${userId}:${String(planKey || "").toUpperCase()}:${String(billingMode || "MONTHLY").toUpperCase()}`;
}

function paymentUrlFrom(payment) {
  return payment?.invoiceUrl || payment?.bankSlipUrl || payment?.checkoutUrl || null;
}

function centsToValue(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

function isMissingAsaasCustomerError(err) {
  const message = String(err?.message || "").toLowerCase();
  return (
    err?.status === 404 ||
    message.includes("customer inválido") ||
    (message.includes("cliente") && message.includes("não encontrado"))
  );
}

function annualTotalCents(planKey) {
  const key = String(planKey || "").toUpperCase();
  if (!PLAN_KEYS.includes(key)) return null;
  return getAsaasRuntimeConfig().commercial[key]?.annualCardCents || PLAN_ANNUAL_CARD_DEFAULT_CENTS[key] || null;
}

function annualPixCents(planKey) {
  const key = String(planKey || "").toUpperCase();
  if (!PLAN_KEYS.includes(key)) return null;
  return getAsaasRuntimeConfig().commercial[key]?.annualPixCents || PLAN_ANNUAL_PIX_DEFAULT_CENTS[key] || null;
}

function formatAnnualPlanPrice(planKey, mode, fallback = "Valor a configurar") {
  const cents = mode === "ANNUAL_PIX" ? annualPixCents(planKey) : annualTotalCents(planKey);
  if (!cents) return fallback;
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

async function asaasRequest(path, options = {}) {
  const config = getAsaasRuntimeConfig();
  const api = activeApiConfig();
  const apiKey = String(api.apiKey || "").trim();
  if (!apiKey) {
    throw new Error("Chave de API do Asaas não configurada.");
  }

  const response = await fetch(`${asaasBaseUrl()}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": config.userAgent || "CaTechSystem/1.0",
      access_token: apiKey,
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const message = payload?.errors?.[0]?.description || payload?.message || `Erro Asaas HTTP ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

async function findCustomerByExternalReference(reference) {
  const params = new URLSearchParams({ externalReference: reference, limit: "1" });
  const result = await asaasRequest(`/customers?${params.toString()}`);
  return Array.isArray(result?.data) && result.data.length ? result.data[0] : null;
}

async function ensureCustomerForUser(user) {
  const cpfCnpj = cleanDigits(user.cpf);
  const mobilePhone = cleanDigits(user.phones) || undefined;

  if (!cpfCnpj) {
    throw new Error("Para criar esta cobrança é necessário preencher o CPF ou CNPJ do cliente.");
  }

  if (user.asaasCustomerId) {
    try {
      await asaasRequest(`/customers/${user.asaasCustomerId}`, {
        method: "PUT",
        body: {
          name: user.name,
          email: user.email,
          cpfCnpj,
          mobilePhone,
        },
      });
      return user.asaasCustomerId;
    } catch (err) {
      console.warn("Não foi possível atualizar o cliente Asaas antes da cobrança:", err.message);
      if (!isMissingAsaasCustomerError(err)) {
        return user.asaasCustomerId;
      }
    }
  }

  const reference = `catech-user-${user.id}`;
  const existing = await findCustomerByExternalReference(reference);
  if (existing?.id) {
    try {
      await asaasRequest(`/customers/${existing.id}`, {
        method: "PUT",
        body: {
          name: user.name,
          email: user.email,
          cpfCnpj,
          mobilePhone,
        },
      });
    } catch (err) {
      console.warn("Não foi possível atualizar o cliente Asaas existente:", err.message);
    }
    return existing.id;
  }

  const payload = {
    name: user.name,
    email: user.email,
    cpfCnpj,
    mobilePhone,
    externalReference: reference,
    notificationDisabled: false,
  };

  const created = await asaasRequest("/customers", {
    method: "POST",
    body: payload,
  });

  return created.id;
}

async function createPlanSubscription(user, plan) {
  const planKey = String(plan?.key || "").toUpperCase();
  const value = planPriceValue(planKey);
  if (!value) {
    throw new Error(`Valor do plano ${planKey} não configurado.`);
  }

  const customerId = await ensureCustomerForUser(user);
  const nextDueDate = formatDateInput(user.trialEndsAt || new Date());
  const subscription = await asaasRequest("/subscriptions", {
    method: "POST",
    body: {
      customer: customerId,
      billingType: "UNDEFINED",
      value,
      nextDueDate,
      cycle: "MONTHLY",
      description: `Assinatura CaTech System - Plano ${plan.title}`,
      externalReference: externalReference(user.id, planKey, "MONTHLY"),
    },
  });

  let firstPayment = null;
  try {
    const payments = await asaasRequest(`/subscriptions/${subscription.id}/payments?limit=1`);
    firstPayment = Array.isArray(payments?.data) ? payments.data[0] : null;
  } catch (err) {
    console.warn("Não foi possível buscar a primeira cobrança da assinatura Asaas:", err.message);
  }

  return {
    customerId,
    subscription,
    firstPayment,
    paymentUrl: paymentUrlFrom(firstPayment),
  };
}

async function createAnnualPlanPayment(user, plan, mode) {
  const billingMode = String(mode || "").toUpperCase();
  const planKey = String(plan?.key || "").toUpperCase();
  const customerId = await ensureCustomerForUser(user);
  const annualCents = annualTotalCents(planKey);
  const pixCents = annualPixCents(planKey);

  if (!annualCents || !pixCents) {
    throw new Error(`Valor do plano ${planKey} não configurado.`);
  }

  const common = {
    customer: customerId,
    dueDate: formatDateInput(new Date()),
    description: `Plano anual CaTech System - ${plan.title}`,
    externalReference: externalReference(user.id, planKey, billingMode),
  };

  const body = billingMode === "ANNUAL_PIX"
    ? {
        ...common,
        billingType: "PIX",
        value: centsToValue(pixCents),
      }
    : {
        ...common,
        billingType: "CREDIT_CARD",
        installmentCount: 12,
        totalValue: centsToValue(annualCents),
      };

  const payment = await asaasRequest("/payments", {
    method: "POST",
    body,
  });

  return {
    customerId,
    payment,
    paymentUrl: paymentUrlFrom(payment),
  };
}

async function createSingleMonthPixPayment(user, plan) {
  const planKey = String(plan?.key || "").toUpperCase();
  const value = planPriceValue(planKey);
  if (!value) {
    throw new Error(`Valor do plano ${planKey} não configurado.`);
  }

  const customerId = await ensureCustomerForUser(user);
  const payment = await asaasRequest("/payments", {
    method: "POST",
    body: {
      customer: customerId,
      billingType: "PIX",
      value,
      dueDate: formatDateInput(new Date()),
      description: `Plano mensal CaTech System - ${plan.title}`,
      externalReference: externalReference(user.id, planKey, "MONTHLY_PIX"),
    },
  });

  return {
    customerId,
    payment,
    paymentUrl: paymentUrlFrom(payment),
  };
}

function associationCycleEndDate(fromDate = new Date()) {
  const base = fromDate instanceof Date ? new Date(fromDate) : new Date(fromDate);
  const year = base.getMonth() <= 6 ? base.getFullYear() : base.getFullYear() + 1;
  return new Date(year, 6, 31, 23, 59, 59, 999);
}

function associationMonthsUntilCycleEnd(fromDate = new Date()) {
  const base = fromDate instanceof Date ? new Date(fromDate) : new Date(fromDate);
  const end = associationCycleEndDate(base);
  return Math.max(
    1,
    (end.getFullYear() - base.getFullYear()) * 12 + (end.getMonth() - base.getMonth()) + 1
  );
}

function associationPlanCents(planKey) {
  const key = String(planKey || "ASSOCIADO_A").toUpperCase();
  const association = getAsaasRuntimeConfig().association;
  if (key === "ASSOCIADO_PREMIUM") {
    return association.premiumAnnualCents || ASSOCIATION_PLAN_DEFAULT_CENTS.ASSOCIADO_PREMIUM;
  }
  return association.masterAnnualCents || ASSOCIATION_PLAN_DEFAULT_CENTS.ASSOCIADO_A;
}

function associationFeeCents() {
  return getAsaasRuntimeConfig().association.joinFeeCents || ASSOCIATION_FEE_DEFAULT_CENTS;
}

function associationPaymentCents(planKey, fromDate = new Date()) {
  const months = associationMonthsUntilCycleEnd(fromDate);
  return associationFeeCents() + Math.round((associationPlanCents(planKey) / 12) * months);
}

function formatAssociationPaymentPrice(planKey, fromDate = new Date()) {
  return (associationPaymentCents(planKey, fromDate) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

async function createAssociationPayment(user, planKey = "ASSOCIADO_A") {
  const normalizedPlan = String(planKey || "ASSOCIADO_A").toUpperCase() === "ASSOCIADO_PREMIUM"
    ? "ASSOCIADO_PREMIUM"
    : "ASSOCIADO_A";
  const customerId = await ensureCustomerForUser(user);
  const payment = await asaasRequest("/payments", {
    method: "POST",
    body: {
      customer: customerId,
      billingType: "PIX",
      value: centsToValue(associationPaymentCents(normalizedPlan)),
      dueDate: formatDateInput(new Date()),
      description: `Associação Gatarina - taxa de associação e anuidade proporcional (${normalizedPlan === "ASSOCIADO_PREMIUM" ? "Associado Premium" : "Associado Master"})`,
      externalReference: externalReference(user.id, normalizedPlan, "ASSOCIATION_INITIAL"),
    },
  });

  return {
    customerId,
    payment,
    paymentUrl: paymentUrlFrom(payment),
    cycleEnd: associationCycleEndDate(),
  };
}

async function getSubscriptionPaymentUrl(subscriptionId) {
  if (!subscriptionId) return null;
  const payments = await asaasRequest(`/subscriptions/${subscriptionId}/payments?limit=1`);
  const firstPayment = Array.isArray(payments?.data) ? payments.data[0] : null;
  return {
    firstPayment,
    paymentUrl: firstPayment?.invoiceUrl || firstPayment?.bankSlipUrl || firstPayment?.checkoutUrl || null,
  };
}

function planFromExternalReference(reference) {
  const parts = String(reference || "").split(":");
  if (parts.length < 3 || parts[0] !== "catech") return null;
  const userId = Number(parts[1]);
  const planKey = parts[2];
  const billingMode = parts[3] || "MONTHLY";
  if (!Number.isFinite(userId) || !planKey) return null;
  return { userId, planKey, billingMode };
}

function verifyWebhookToken(req) {
  const expected = String(activeApiConfig().webhookToken || "").trim();
  if (!expected) return true;
  const received = String(req.get("asaas-access-token") || "").trim();
  return received === expected;
}

module.exports = {
  ASAAS_SETTING_KEY,
  getAsaasRuntimeConfig,
  setAsaasRuntimeConfig,
  loadAsaasRuntimeConfig,
  normalizeBillingConfig,
  maskSecret,
  isAsaasConfigured,
  planPriceCents,
  formatPlanPrice,
  formatAnnualPlanPrice,
  createAnnualPlanPayment,
  createSingleMonthPixPayment,
  createAssociationPayment,
  createPlanSubscription,
  getSubscriptionPaymentUrl,
  planFromExternalReference,
  associationCycleEndDate,
  associationPaymentCents,
  formatAssociationPaymentPrice,
  verifyWebhookToken,
};
