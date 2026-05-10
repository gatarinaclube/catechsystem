const express = require("express");
const { canViewAllData } = require("../utils/access");

const DEFAULT_PAYMENT_ACCOUNT = "";

function todayForInput() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
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
    const centsText = `${integerPart || "0"}${decimalPart.padEnd(2, "0")}`;
    const cents = Number.parseInt(centsText, 10);
    return Number.isFinite(cents) ? cents : 0;
  }

  const cents = Number.parseInt(raw.replace(/\D/g, ""), 10) * 100;
  return Number.isFinite(cents) ? cents : 0;
}

function formatAmount(cents) {
  if (cents === null || cents === undefined) return "";
  return (Number(cents) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseDateInput(value, allowBlank = false) {
  if (allowBlank && !value) return null;
  const dateText = String(value || todayForInput()).slice(0, 10);
  const [year, month, day] = dateText.split("-").map(Number);
  return year && month && day ? new Date(Date.UTC(year, month - 1, day)) : null;
}

function formatDateInput(date) {
  return date ? new Date(date).toISOString().slice(0, 10) : "";
}

function formatDateOnlyLabel(date) {
  return date
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(date))
    : "-";
}

function monthRange(monthValue) {
  const fallback = todayForInput().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(monthValue || "") ? monthValue : fallback;
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));
  return { month, start, end };
}

function paginationData(query) {
  const page = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const pageSize = 20;
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function safeJsonParse(value, fallback = []) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function buildKittenLabel(cat) {
  const number = cat.kittenNumber || cat.litterKitten?.kittenNumber || cat.litterKitten?.index || "-";
  return `${number} - ${cat.name || "Sem nome"}`;
}

function deriveKittenStatus(cat) {
  if (cat.deceased === true) return "DECEASED";
  if (cat.breedingProspect === true) return "BREEDER";
  if (cat.delivered === true) return "DELIVERED";
  if (cat.sold === true) return "RESERVED";
  return cat.kittenAvailabilityStatus || "AVAILABLE";
}

function mapRevenueForForm(revenue = null) {
  if (!revenue) {
    return {
      clientId: "",
      kittenId: "",
      invoiceNumber: "",
      invoiceDate: "",
      catAmount: "",
      transportAmount: "",
      totalAmount: "",
      installments: "1",
      paymentAccount: DEFAULT_PAYMENT_ACCOUNT,
      note: "",
      parcels: [],
    };
  }

  return {
    ...revenue,
    invoiceDate: formatDateInput(revenue.invoiceDate),
    catAmount: formatAmount(revenue.catAmountCents),
    transportAmount: formatAmount(revenue.transportAmountCents),
    totalAmount: formatAmount(revenue.totalAmountCents),
    parcels: safeJsonParse(revenue.parcelDataJson),
  };
}

function mapPaidRevenueRows(revenues, start, end) {
  const startTime = start.getTime();
  const endTime = end.getTime();
  const rows = [];

  revenues.forEach((revenue) => {
    safeJsonParse(revenue.parcelDataJson).forEach((parcel) => {
      if (!parcel.paid || !parcel.date) return;
      const paidDate = parseDateInput(parcel.date, true);
      if (!paidDate) return;
      const paidTime = paidDate.getTime();
      if (paidTime < startTime || paidTime >= endTime) return;

      rows.push({
        id: revenue.id,
        paidDateTime: paidTime,
        dateLabel: formatDateOnlyLabel(paidDate),
        kittenLabel: revenue.kittenLabel || "-",
        clientLabel: revenue.client?.fullName || "-",
        paymentAccount: parcel.paymentAccount || revenue.paymentAccount || "-",
        amountLabel: formatAmount(parcel.amountCents || 0),
        parcelLabel: `${parcel.number || "-"} / ${revenue.installments || "-"}`,
      });
    });
  });

  return rows.sort((a, b) => {
    const dateCompare = b.paidDateTime - a.paidDateTime;
    return dateCompare || Number(b.id) - Number(a.id);
  });
}

module.exports = (prisma) => {
  const router = express.Router();

  function ownerScope(req) {
    if (canViewAllData(req.session?.userRole)) return {};
    return { ownerId: req.session?.userId || null };
  }

  function clientScope(req) {
    if (canViewAllData(req.session?.userRole)) return {};
    return {
      OR: [
        { ownerId: req.session?.userId || null },
        { ownerId: null },
      ],
    };
  }

  async function loadContext(req, revenue = null) {
    const clients = await prisma.revenueClient.findMany({
      where: clientScope(req),
      orderBy: { fullName: "asc" },
    });
    const kittens = await prisma.cat.findMany({
      where: {
        ...ownerScope(req),
        OR: [{ kittenNumber: { not: null } }, { litterKitten: { isNot: null } }],
        deceased: false,
        delivered: false,
        breedingProspect: false,
      },
      include: { litterKitten: true },
      orderBy: [{ kittenNumber: "asc" }, { name: "asc" }],
    });
    const accounts = await prisma.quickLaunchOption.findMany({
      where: { type: "PAYMENT", disabledAt: null },
      orderBy: { name: "asc" },
    });
    const paymentAccounts = Array.from(new Set(accounts.map((item) => item.name).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "pt-BR"));

    return {
      clients,
      kittenGroups: [
        {
          label: "Disponíveis",
          kittens: kittens
            .filter((cat) => deriveKittenStatus(cat) === "AVAILABLE")
            .map((cat) => ({ ...cat, label: buildKittenLabel(cat) })),
        },
        {
          label: "Reservados",
          kittens: kittens
            .filter((cat) => deriveKittenStatus(cat) === "RESERVED")
            .map((cat) => ({ ...cat, label: buildKittenLabel(cat) })),
        },
      ],
      paymentAccounts,
      revenue: mapRevenueForForm(revenue),
    };
  }

  function buildRevenueData(body, existing = null) {
    const catAmountCents = parseAmountToCents(body.catAmount);
    const transportAmountCents = parseAmountToCents(body.transportAmount);
    const totalAmountCents = catAmountCents + transportAmountCents;
    const installments = Math.min(10, Math.max(1, Number.parseInt(body.installments || "1", 10)));
    const parcels = [];

    for (let i = 1; i <= installments; i += 1) {
      parcels.push({
        number: i,
        amountCents: parseAmountToCents(body[`parcel${i}Amount`]),
        date: body[`parcel${i}Date`] || "",
        paid: body[`parcel${i}Paid`] === "YES",
        paymentAccount: body[`parcel${i}PaymentAccount`] || body.paymentAccount || DEFAULT_PAYMENT_ACCOUNT,
      });
    }

    return {
      clientId: body.clientId ? Number(body.clientId) : null,
      kittenId: body.kittenId ? Number(body.kittenId) : existing?.kittenId || null,
      kittenLabel: body.kittenLabel || existing?.kittenLabel || null,
      invoiceNumber: body.invoiceNumber || null,
      invoiceDate: parseDateInput(body.invoiceDate, true),
      catAmountCents,
      transportAmountCents,
      totalAmountCents,
      installments,
      paymentAccount: DEFAULT_PAYMENT_ACCOUNT,
      note: body.note || null,
      parcelDataJson: JSON.stringify(parcels),
    };
  }

  async function renderForm(req, res, extra = {}) {
    res.status(extra.status || 200).render("revenues/index", {
      ...(await loadContext(req, extra.revenue)),
      formAction: extra.formAction || (extra.revenue?.id ? `/receitas/${extra.revenue.id}` : "/receitas"),
      backPath: extra.backPath || "/receitas",
      success: extra.success || false,
      error: extra.error || null,
      homePath: req.session?.userId ? "/dashboard" : "/login",
      currentPath: "/receitas",
    });
  }

  router.get("/receitas", async (req, res) => {
    await renderForm(req, res, { success: req.query.ok === "1" });
  });

  router.post("/receitas", async (req, res) => {
    try {
      const kitten = req.body.kittenId
        ? await prisma.cat.findFirst({
            where: { id: Number(req.body.kittenId), ...ownerScope(req) },
            include: { litterKitten: true },
          })
        : null;
      const data = buildRevenueData({
        ...req.body,
        kittenLabel: kitten ? buildKittenLabel(kitten) : req.body.kittenLabel,
      });

      await prisma.revenueEntry.create({
        data: {
          ownerId: req.session?.userId || null,
          ...data,
        },
      });
      res.redirect("/receitas?ok=1");
    } catch (err) {
      await renderForm(req, res, {
        status: 400,
        error: err.message || "Erro ao salvar receita.",
      });
    }
  });

  router.get("/receitas/lista", async (req, res) => {
    const { month, start, end } = monthRange(req.query.month);
    const { page, pageSize, skip } = paginationData(req.query);
    const revenues = await prisma.revenueEntry.findMany({
      where: ownerScope(req),
      include: { client: true },
      orderBy: { createdAt: "desc" },
    });
    const rows = mapPaidRevenueRows(revenues, start, end);
    const totalCount = rows.length;
    const pageRows = rows.slice(skip, skip + pageSize);

    res.render("revenues/list", {
      revenues: pageRows,
      month,
      page,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
      hasPreviousPage: page > 1,
      hasNextPage: page * pageSize < totalCount,
      currentPath: "/receitas",
    });
  });

  router.get("/vendas", async (req, res) => {
    const revenues = await prisma.revenueEntry.findMany({
      where: ownerScope(req),
      include: { client: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    res.render("revenues/sales-list", {
      revenues,
      currentPath: "/vendas",
    });
  });

  router.get("/vendas/:id", async (req, res) => {
    const revenue = await prisma.revenueEntry.findFirst({
      where: { id: Number(req.params.id), ...ownerScope(req) },
    });
    if (!revenue) return res.status(404).send("Venda não encontrada.");
    await renderForm(req, res, {
      revenue,
      formAction: `/vendas/${revenue.id}`,
      backPath: "/vendas",
    });
  });

  router.post("/vendas/:id", async (req, res) => {
    const existing = await prisma.revenueEntry.findFirst({
      where: { id: Number(req.params.id), ...ownerScope(req) },
    });
    if (!existing) return res.status(404).send("Venda não encontrada.");

    await prisma.revenueEntry.update({
      where: { id: existing.id },
      data: buildRevenueData(req.body, existing),
    });
    res.redirect("/vendas");
  });

  router.get("/receitas/clientes/novo", async (req, res) => {
    res.render("revenues/client-form", {
      title: "Novo Cliente",
      formAction: "/receitas/clientes/novo",
      backPath: "/receitas",
      client: null,
      error: null,
      currentPath: "/receitas",
    });
  });

  router.post("/receitas/clientes/novo", async (req, res) => {
    try {
      await prisma.revenueClient.create({
        data: {
          ownerId: req.session?.userId || null,
          fullName: req.body.fullName,
          document: req.body.document || null,
          cep: req.body.cep || null,
          street: req.body.street || null,
          number: req.body.number || null,
          complement: req.body.complement || null,
          neighborhood: req.body.neighborhood || null,
          city: req.body.city || null,
          state: req.body.state || null,
          country: req.body.country || null,
          email: req.body.email || null,
          phone: req.body.phone || null,
        },
      });
      res.redirect("/receitas");
    } catch (err) {
      res.status(400).render("revenues/client-form", {
        title: "Novo Cliente",
        formAction: "/receitas/clientes/novo",
        backPath: "/receitas",
        client: req.body,
        error: err.message || "Erro ao salvar cliente.",
        currentPath: "/receitas",
      });
    }
  });

  async function renderAccountOptions(req, res, extra = {}) {
    const accounts = await prisma.quickLaunchOption.findMany({
      where: { type: "PAYMENT", disabledAt: null },
      orderBy: { name: "asc" },
    });

    res.status(extra.status || 200).render("revenues/account-options", {
      accounts,
      success: extra.success || false,
      error: extra.error || null,
      currentPath: "/receitas",
    });
  }

  router.get("/receitas/contas", async (req, res) => {
    await renderAccountOptions(req, res, { success: req.query.ok === "1" });
  });

  router.post("/receitas/contas", async (req, res) => {
    const name = String(req.body.name || "").trim();
    if (name) {
      const ownerId = req.session?.userId || null;
      const existing = await prisma.quickLaunchOption.findFirst({
        where: { type: "PAYMENT", ownerId, name },
        select: { id: true },
      });
      if (!existing) {
        await prisma.quickLaunchOption.create({
          data: { type: "PAYMENT", ownerId, name },
        });
      }
    }
    res.redirect("/receitas/contas?ok=1");
  });

  router.post("/receitas/contas/:id/update", async (req, res) => {
    const id = Number(req.params.id);
    const account = await prisma.quickLaunchOption.findFirst({
      where: { id, ...ownerScope(req) },
    });
    const name = String(req.body.name || "").trim();

    if (!account || account.type !== "PAYMENT") {
      return res.status(404).send("Conta não encontrada.");
    }

    if (name) {
      await prisma.quickLaunchOption.update({ where: { id }, data: { name } });
    }

    res.redirect("/receitas/contas?ok=1");
  });

  router.post("/receitas/contas/:id/delete", async (req, res) => {
    const id = Number(req.params.id);
    const account = await prisma.quickLaunchOption.findFirst({
      where: { id, ...ownerScope(req) },
    });

    if (!account || account.type !== "PAYMENT") {
      return res.status(404).send("Conta não encontrada.");
    }

    await prisma.quickLaunchOption.delete({ where: { id } });
    res.redirect("/receitas/contas?ok=1");
  });

  router.get("/receitas/:id", async (req, res) => {
    const revenue = await prisma.revenueEntry.findFirst({
      where: { id: Number(req.params.id), ...ownerScope(req) },
    });
    if (!revenue) return res.status(404).send("Receita não encontrada.");
    await renderForm(req, res, { revenue });
  });

  router.post("/receitas/:id", async (req, res) => {
    const existing = await prisma.revenueEntry.findFirst({
      where: { id: Number(req.params.id), ...ownerScope(req) },
    });
    if (!existing) return res.status(404).send("Receita não encontrada.");

    await prisma.revenueEntry.update({
      where: { id: existing.id },
      data: buildRevenueData(req.body, existing),
    });
    res.redirect("/receitas/lista");
  });

  return router;
};
