const express = require("express");
const { canViewAllData } = require("../utils/access");

function todayForInput() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function parseAmountToCents(value) {
  const raw = String(value || "").replace(/[^\d,.-]/g, "").trim();
  if (!raw) return 0;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);

  if (decimalIndex >= 0) {
    const integerPart = raw.slice(0, decimalIndex).replace(/\D/g, "");
    const decimalPart = raw.slice(decimalIndex + 1).replace(/\D/g, "").slice(0, 2);
    const cents = Number.parseInt(`${integerPart || "0"}${decimalPart.padEnd(2, "0")}`, 10);
    return Number.isFinite(cents) ? cents : 0;
  }

  const cents = Number.parseInt(raw.replace(/\D/g, ""), 10) * 100;
  return Number.isFinite(cents) ? cents : 0;
}

function formatAmount(cents) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseDateInput(value) {
  const text = String(value || todayForInput()).slice(0, 10);
  const [year, month, day] = text.split("-").map(Number);
  return year && month && day ? new Date(Date.UTC(year, month - 1, day)) : new Date();
}

function currentMonthRange() {
  const [year, month] = todayForInput().split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

function safeJsonParse(value) {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function parseParcels(value) {
  return safeJsonParse(value).filter((parcel) => parcel.paid && parcel.date);
}

function monthContains(date, start, end) {
  const time = date.getTime();
  return time >= start.getTime() && time < end.getTime();
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  function ownerScope(req) {
    if (canViewAllData(req.session?.userRole)) return {};
    return { ownerId: req.session?.userId || null };
  }

  function settingOwnerId(req) {
    return req.session?.userId || null;
  }

  async function loadPaymentAccounts() {
    const options = await prisma.quickLaunchOption.findMany({
      where: { type: "PAYMENT", disabledAt: null },
      orderBy: { name: "asc" },
      select: { name: true },
    });
    return Array.from(new Set(options.map((option) => option.name).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  async function upsertSetting(req, accountName) {
    const ownerId = settingOwnerId(req);
    return prisma.financialAccountSetting.upsert({
      where: { ownerId_accountName: { ownerId, accountName } },
      create: { ownerId, accountName },
      update: {},
    });
  }

  async function buildAccountRows(req) {
    const accounts = await loadPaymentAccounts();
    const { start, end } = currentMonthRange();
    const expenses = await prisma.quickLaunchEntry.findMany({
      where: ownerScope(req),
      select: { amountCents: true, paymentMethod: true, competenceDate: true },
    });
    const revenues = await prisma.revenueEntry.findMany({
      where: ownerScope(req),
      select: { paymentAccount: true, parcelDataJson: true },
    });

    const rows = [];
    for (const accountName of accounts) {
      const setting = await upsertSetting(req, accountName);
      const accountExpenses = expenses.filter((expense) => expense.paymentMethod === accountName);
      const allRevenueParcels = revenues
        .filter((revenue) => revenue.paymentAccount === accountName)
        .flatMap((revenue) => parseParcels(revenue.parcelDataJson));

      const totalIncome = allRevenueParcels.reduce((sum, parcel) => sum + Number(parcel.amountCents || 0), 0);
      const totalExpenses = accountExpenses.reduce((sum, expense) => sum + Number(expense.amountCents || 0), 0);
      const monthIncome = allRevenueParcels.reduce((sum, parcel) => {
        const paidDate = parseDateInput(parcel.date);
        return monthContains(paidDate, start, end) ? sum + Number(parcel.amountCents || 0) : sum;
      }, 0);
      const monthExpenses = accountExpenses.reduce((sum, expense) => (
        monthContains(expense.competenceDate, start, end) ? sum + Number(expense.amountCents || 0) : sum
      ), 0);

      rows.push({
        accountName,
        initialBalance: formatAmount(setting.initialBalanceCents),
        capitalSocialEnabled: setting.capitalSocialEnabled,
        capitalSocial: formatAmount(setting.capitalSocialCents),
        capitalEntries: safeJsonParse(setting.capitalEntriesJson).map((entry) => ({
          ...entry,
          amountLabel: formatAmount(entry.amountCents),
        })),
        balanceLabel: formatAmount(setting.initialBalanceCents + totalIncome - totalExpenses),
        monthIncomeLabel: formatAmount(monthIncome),
        monthExpenseLabel: formatAmount(monthExpenses),
      });
    }
    return rows;
  }

  router.get(
    "/administrativo",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      res.render("administrative/index", {
        user: req.user,
        currentPath: "/administrativo",
      });
    }
  );

  router.get(
    "/administrativo/contas",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      res.render("administrative/accounts", {
        user: req.user,
        currentPath: "/administrativo",
        accounts: await buildAccountRows(req),
        success: req.query.ok === "1",
      });
    }
  );

  router.post(
    "/administrativo/contas",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      const accountName = String(req.body.accountName || "").trim();
      if (!accountName) return res.redirect("/administrativo/contas");

      const ownerId = settingOwnerId(req);
      await prisma.financialAccountSetting.upsert({
        where: { ownerId_accountName: { ownerId, accountName } },
        create: {
          ownerId,
          accountName,
          initialBalanceCents: parseAmountToCents(req.body.initialBalance),
          capitalSocialEnabled: req.body.capitalSocialEnabled === "YES",
          capitalSocialCents: parseAmountToCents(req.body.capitalSocial),
        },
        update: {
          initialBalanceCents: parseAmountToCents(req.body.initialBalance),
          capitalSocialEnabled: req.body.capitalSocialEnabled === "YES",
          capitalSocialCents: parseAmountToCents(req.body.capitalSocial),
        },
      });

      res.redirect("/administrativo/contas?ok=1");
    }
  );

  router.post(
    "/administrativo/contas/capital",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      const accountName = String(req.body.accountName || "").trim();
      const amountCents = parseAmountToCents(req.body.capitalEntryAmount);
      if (!accountName || amountCents <= 0) return res.redirect("/administrativo/contas");

      const setting = await upsertSetting(req, accountName);
      const entries = safeJsonParse(setting.capitalEntriesJson);
      entries.push({
        date: String(req.body.capitalEntryDate || todayForInput()).slice(0, 10),
        amountCents,
      });

      await prisma.financialAccountSetting.update({
        where: { id: setting.id },
        data: {
          capitalSocialEnabled: true,
          capitalSocialCents: Number(setting.capitalSocialCents || 0) + amountCents,
          capitalEntriesJson: JSON.stringify(entries),
        },
      });

      res.redirect("/administrativo/contas?ok=1");
    }
  );

  return router;
};
