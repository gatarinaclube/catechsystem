const express = require("express");
const { PLAN_KEY_TO_ROLE, buildProfileRuleRows, saveProfileRulesConfig } = require("../utils/profileRules");
const { setPlanLimitOverrides } = require("../utils/planLimits");

function parseNullableInteger(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.floor(number);
}

function rulesFromBody(body) {
  const rows = buildProfileRuleRows();
  const limits = {};
  rows.limitRows.forEach((row) => {
    limits[row.key] = {};
    rows.planKeys.forEach((planKey) => {
      limits[row.key][planKey] = parseNullableInteger(body[`limit_${row.key}_${planKey}`]);
    });
  });

  const features = {};
  rows.featureRows.forEach((row) => {
    features[row.key] = {};
    rows.planKeys.forEach((planKey) => {
      features[row.key][planKey] = body[`feature_${row.key}_${planKey}`] === "on";
    });
  });

  return { limits, features };
}

function rolePlanLimitRows(rules) {
  return Object.entries(PLAN_KEY_TO_ROLE).map(([planKey, role]) => ({
    role,
    uploadLimitKb: rules.limits.uploadLimitKb?.[planKey] ?? null,
    littersPerYear: rules.limits.littersPerYear?.[planKey] ?? null,
    kittensPerYear: rules.limits.kittensPerYear?.[planKey] ?? null,
  }));
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  router.get("/admin/perfis-limites", requireAuth, requirePermission("admin.profileRules"), async (req, res) => {
    res.render("admin-profile-rules/index", {
      user: req.user,
      currentPath: "/admin/perfis-limites",
      rules: buildProfileRuleRows(),
      success: req.query.saved === "1",
      error: null,
    });
  });

  router.post("/admin/perfis-limites", requireAuth, requirePermission("admin.profileRules"), async (req, res) => {
    try {
      const rules = rulesFromBody(req.body);
      const saved = await saveProfileRulesConfig(prisma, rules);
      const legacyRows = rolePlanLimitRows(saved);

      for (const row of legacyRows) {
        await prisma.rolePlanLimit.upsert({
          where: { role: row.role },
          update: {
            uploadLimitKb: row.uploadLimitKb,
            littersPerYear: row.littersPerYear,
            kittensPerYear: row.kittensPerYear,
          },
          create: row,
        });
      }
      setPlanLimitOverrides(await prisma.rolePlanLimit.findMany());

      res.redirect("/admin/perfis-limites?saved=1");
    } catch (err) {
      console.error("Erro ao salvar regras de perfis:", err);
      res.status(500).render("admin-profile-rules/index", {
        user: req.user,
        currentPath: "/admin/perfis-limites",
        rules: buildProfileRuleRows(),
        success: false,
        error: "Erro ao salvar regras dos perfis.",
      });
    }
  });

  return router;
};
