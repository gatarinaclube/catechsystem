const express = require("express");
const {
  ASAAS_SETTING_KEY,
  getAsaasRuntimeConfig,
  loadAsaasRuntimeConfig,
  maskSecret,
  normalizeBillingConfig,
  setAsaasRuntimeConfig,
} = require("../utils/asaas");

const PLAN_ROWS = [
  { key: "BASIC", label: "Básico" },
  { key: "MASTER", label: "Master" },
  { key: "PREMIUM", label: "Premium" },
];

function centsToMoney(cents) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function moneyToCents(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
}

function secretFromForm(value, currentValue) {
  const next = String(value || "").trim();
  return next || currentValue || "";
}

function moneyFromForm(value, fallback) {
  const cents = moneyToCents(value);
  return cents === null ? fallback : cents;
}

function configForView(config) {
  return {
    ...config,
    production: {
      ...config.production,
      apiKeyMask: maskSecret(config.production.apiKey),
      webhookTokenMask: maskSecret(config.production.webhookToken),
    },
    sandbox: {
      ...config.sandbox,
      apiKeyMask: maskSecret(config.sandbox.apiKey),
      webhookTokenMask: maskSecret(config.sandbox.webhookToken),
    },
    commercialInputs: PLAN_ROWS.reduce((acc, plan) => {
      const values = config.commercial[plan.key] || {};
      acc[plan.key] = {
        monthly: centsToMoney(values.monthlyCents),
        annualCard: centsToMoney(values.annualCardCents),
        annualPix: centsToMoney(values.annualPixCents),
      };
      return acc;
    }, {}),
    associationInputs: {
      joinFee: centsToMoney(config.association.joinFeeCents),
      masterAnnual: centsToMoney(config.association.masterAnnualCents),
      premiumAnnual: centsToMoney(config.association.premiumAnnualCents),
    },
  };
}

module.exports = function billingFinanceRouterFactory(prisma, requireAuth, requirePermission) {
  const router = express.Router();
  const guard = [requireAuth, requirePermission("admin.financeSettings")];

  router.get("/admin/financeiro", guard, async (req, res) => {
    const config = await loadAsaasRuntimeConfig(prisma);
    res.render("admin-finance/index", {
      user: req.session.user,
      access: req.access,
      currentPath: req.path,
      config: configForView(config),
      plans: PLAN_ROWS,
      success: req.query.saved === "1",
      error: req.query.error || "",
    });
  });

  router.post("/admin/financeiro", guard, async (req, res) => {
    if (!prisma?.systemSetting) {
      return res.redirect("/admin/financeiro?error=Execute%20a%20migration%20antes%20de%20salvar%20estas%20configuracoes.");
    }

    try {
      const current = getAsaasRuntimeConfig();
      const commercial = {};

      for (const plan of PLAN_ROWS) {
        const currentPlan = current.commercial[plan.key] || {};
        commercial[plan.key] = {
          monthlyCents: moneyFromForm(req.body[`${plan.key}_monthly`], currentPlan.monthlyCents),
          annualCardCents: moneyFromForm(req.body[`${plan.key}_annualCard`], currentPlan.annualCardCents),
          annualPixCents: moneyFromForm(req.body[`${plan.key}_annualPix`], currentPlan.annualPixCents),
        };
      }

      const nextConfig = normalizeBillingConfig({
        apiMode: req.body.apiMode,
        userAgent: req.body.userAgent,
        production: {
          baseUrl: req.body.productionBaseUrl,
          apiKey: secretFromForm(req.body.productionApiKey, current.production.apiKey),
          webhookToken: secretFromForm(req.body.productionWebhookToken, current.production.webhookToken),
        },
        sandbox: {
          baseUrl: req.body.sandboxBaseUrl,
          apiKey: secretFromForm(req.body.sandboxApiKey, current.sandbox.apiKey),
          webhookToken: secretFromForm(req.body.sandboxWebhookToken, current.sandbox.webhookToken),
        },
        commercial,
        association: {
          joinFeeCents: moneyFromForm(req.body.associationJoinFee, current.association.joinFeeCents),
          masterAnnualCents: moneyFromForm(req.body.associationMasterAnnual, current.association.masterAnnualCents),
          premiumAnnualCents: moneyFromForm(req.body.associationPremiumAnnual, current.association.premiumAnnualCents),
        },
      });

      await prisma.systemSetting.upsert({
        where: { key: ASAAS_SETTING_KEY },
        update: { value: JSON.stringify(nextConfig) },
        create: { key: ASAAS_SETTING_KEY, value: JSON.stringify(nextConfig) },
      });

      setAsaasRuntimeConfig(nextConfig);
      res.redirect("/admin/financeiro?saved=1");
    } catch (err) {
      console.error("Erro ao salvar configurações financeiras:", err);
      res.redirect(`/admin/financeiro?error=${encodeURIComponent("Erro ao salvar configurações financeiras.")}`);
    }
  });

  return router;
};
