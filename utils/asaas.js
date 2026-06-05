const ASAAS_PRODUCTION_URL = "https://api.asaas.com/v3";
const ASAAS_SANDBOX_URL = "https://api-sandbox.asaas.com/v3";

const PLAN_ENV = {
  BASIC: "ASAAS_PLAN_BASIC_CENTS",
  MASTER: "ASAAS_PLAN_MASTER_CENTS",
  PREMIUM: "ASAAS_PLAN_PREMIUM_CENTS",
};

function cleanDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function isAsaasConfigured() {
  return Boolean(String(process.env.ASAAS_API_KEY || "").trim());
}

function asaasBaseUrl() {
  if (process.env.ASAAS_BASE_URL) return process.env.ASAAS_BASE_URL.replace(/\/$/, "");
  const key = String(process.env.ASAAS_API_KEY || "");
  return key.includes("$aact_hmlg_") ? ASAAS_SANDBOX_URL : ASAAS_PRODUCTION_URL;
}

function planPriceCents(planKey) {
  const envName = PLAN_ENV[String(planKey || "").toUpperCase()];
  if (!envName) return null;
  const value = Number(process.env[envName]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
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

function externalReference(userId, planKey) {
  return `catech:${userId}:${String(planKey || "").toUpperCase()}`;
}

async function asaasRequest(path, options = {}) {
  const apiKey = String(process.env.ASAAS_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("ASAAS_API_KEY não configurada.");
  }

  const response = await fetch(`${asaasBaseUrl()}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": process.env.ASAAS_USER_AGENT || "CaTechSystem/1.0",
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
  if (user.asaasCustomerId) return user.asaasCustomerId;

  const reference = `catech-user-${user.id}`;
  const existing = await findCustomerByExternalReference(reference);
  if (existing?.id) return existing.id;

  const payload = {
    name: user.name,
    email: user.email,
    cpfCnpj: cleanDigits(user.cpf) || undefined,
    mobilePhone: cleanDigits(user.phones) || undefined,
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
      externalReference: externalReference(user.id, planKey),
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
    paymentUrl: firstPayment?.invoiceUrl || firstPayment?.bankSlipUrl || firstPayment?.checkoutUrl || null,
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
  if (parts.length !== 3 || parts[0] !== "catech") return null;
  const userId = Number(parts[1]);
  const planKey = parts[2];
  if (!Number.isFinite(userId) || !planKey) return null;
  return { userId, planKey };
}

function verifyWebhookToken(req) {
  const expected = String(process.env.ASAAS_WEBHOOK_TOKEN || "").trim();
  if (!expected) return true;
  const received = String(req.get("asaas-access-token") || "").trim();
  return received === expected;
}

module.exports = {
  isAsaasConfigured,
  planPriceCents,
  formatPlanPrice,
  createPlanSubscription,
  getSubscriptionPaymentUrl,
  planFromExternalReference,
  verifyWebhookToken,
};
