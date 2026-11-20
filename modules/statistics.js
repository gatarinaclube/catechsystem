const express = require("express");
const { buildStatistics, parseHistoryInput, formatMoney } = require("../utils/statistics");

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();
  const gate = [requireAuth, requirePermission("admin.reports"), requirePermission("admin.reportsAdvanced")];
  const url = "/reports/statistics";

  async function render(req, res, error = null, status = 200) {
    const ownerId = req.session.userId;
    const [litters, standaloneKittens, revenues, expenses, history] = await Promise.all([
      prisma.litter.findMany({ where: { ownerId }, select: {
        litterBirthDate: true, litterCount: true, maleCount: true, femaleCount: true,
        deadCount: true, deadAtBirthCount: true, deadAfterBirthCount: true,
        deadAtBirthMaleCount: true, deadAfterBirthMaleCount: true,
        deadAtBirthFemaleCount: true, deadAfterBirthFemaleCount: true,
        kittens: { select: { sex: true, kittenCat: { select: { gender: true } } } },
      } }),
      prisma.cat.findMany({ where: { ownerId, kittenNumber: { not: null }, litterKitten: { is: null } },
        select: { birthDate: true, gender: true, deceased: true } }),
      prisma.revenueEntry.findMany({ where: { ownerId }, select: { parcelDataJson: true } }),
      prisma.quickLaunchEntry.findMany({ where: { ownerId }, select: { competenceDate: true, amountCents: true } }),
      prisma.statisticsHistory.findMany({ where: { ownerId }, orderBy: { year: "desc" } }),
    ]);
    const stats = buildStatistics({ litters, standaloneKittens, revenues, expenses, history });
    const selectedYear = /^\d{4}$/.test(req.query.year || "") ? Number(req.query.year) : null;
    const rows = selectedYear ? stats.rows.filter((row) => row.year === selectedYear) : stats.rows;
    res.set("Cache-Control", "no-store");
    return res.status(status).render("reports/statistics", {
      user: req.user, currentPath: url, stats, rows, selectedYear, history,
      error, saved: req.query.saved === "1", removed: req.query.removed === "1",
      historyForm: error ? req.body : {}, formatMoney,
      number: (value) => value === null ? "Sem dados" : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
    });
  }

  router.get(url, ...gate, async (req, res) => {
    try { return await render(req, res); }
    catch (err) {
      console.error("Erro ao carregar estatísticas:", err);
      return res.status(500).send("Não foi possível carregar as estatísticas.");
    }
  });

  router.post(`${url}/history`, ...gate, async (req, res) => {
    let data;
    try { data = parseHistoryInput(req.body); }
    catch (err) { return render(req, res, err.message, 400); }
    const ownerId = req.session.userId;
    try {
      await prisma.statisticsHistory.upsert({
        where: { ownerId_year: { ownerId, year: data.year } },
        create: { ownerId, ...data }, update: data,
      });
      return res.redirect(`${url}?saved=1#history`);
    } catch (err) {
      console.error("Erro ao salvar histórico estatístico:", err);
      return render(req, res, "Não foi possível salvar o histórico. Tente novamente.", 500);
    }
  });

  router.post(`${url}/history/:id/delete`, ...gate, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).send("Registro inválido.");
    try {
      await prisma.statisticsHistory.deleteMany({ where: { id, ownerId: req.session.userId } });
      return res.redirect(`${url}?removed=1#history`);
    } catch (err) {
      console.error("Erro ao remover histórico estatístico:", err);
      return res.status(500).send("Não foi possível remover o histórico.");
    }
  });
  return router;
};
