const express = require("express");
const { dataOwnerScope, userCan } = require("../utils/access");
const { buildDisplayName, kittenFallbackDisplayName } = require("../utils/cattery-admin");
const { formatCpfCnpj, formatPhone } = require("../utils/format");

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

function parcelCancellationNote(parcel) {
  if (!parcel?.canceled) return "";
  const refundDate = parcel.refundDate ? parseDateInput(parcel.refundDate, true) : null;
  return refundDate
    ? `Pagamento cancelado. Estorno em ${formatDateOnlyLabel(refundDate)}.`
    : "Pagamento cancelado.";
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

function safeReturnPath(value, fallback) {
  const raw = String(value || "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) {
    return fallback;
  }
  return raw.slice(0, 240);
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
  const displayName = buildDisplayName(cat);
  if (displayName) return `${number} - ${displayName}`;
  const fallback = kittenFallbackDisplayName(cat);
  if (fallback) return fallback;
  return `${number} - ${cat.name || "Sem nome"}`;
}

function deriveKittenStatus(cat) {
  if (cat.deceased === true) return "DECEASED";
  if (cat.breedingProspect === true) return "BREEDER";
  if (cat.delivered === true) return "DELIVERED";
  if (cat.sold === true) return "RESERVED";
  return cat.kittenAvailabilityStatus || "AVAILABLE";
}

function clientOwnerInfo(client) {
  if (!client) return null;
  return {
    name: client.fullName || "",
    document: client.document || "",
    cep: client.cep || "",
    city: client.city || "",
    street: client.street || "",
    number: client.number || "",
    neighborhood: client.neighborhood || "",
    state: client.state || "",
    country: client.country || "",
    phone: client.phone || "",
    email: client.email || "",
  };
}

function mapRevenueForForm(revenue = null) {
  if (!revenue) {
    return {
      clientId: "",
      kittenId: "",
      revenueItem: "",
      productServiceId: "",
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
    revenueItem: revenue.productServiceId
      ? `product:${revenue.productServiceId}`
      : revenue.kittenId
        ? `cat:${revenue.kittenId}`
        : "",
    invoiceDate: formatDateInput(revenue.invoiceDate),
    catAmount: formatAmount(revenue.catAmountCents),
    transportAmount: formatAmount(revenue.transportAmountCents),
    totalAmount: formatAmount(revenue.totalAmountCents),
    parcels: safeJsonParse(revenue.parcelDataJson),
  };
}

function buildRevenueSummary(revenue) {
  if (!revenue?.id) {
    return null;
  }

  const totalCents = Number(revenue.totalAmountCents || 0);
  const parcels = safeJsonParse(revenue.parcelDataJson);
  const activeParcels = parcels.filter((parcel) => !parcel.canceled);
  const paidCents = activeParcels.reduce(
    (sum, parcel) => sum + (parcel.paid ? Number(parcel.amountCents || 0) : 0),
    0
  );
  const today = parseDateInput(todayForInput(), true);
  const openParcels = activeParcels
    .filter((parcel) => !parcel.paid)
    .map((parcel) => ({
      ...parcel,
      dueDate: parcel.date ? parseDateInput(parcel.date, true) : null,
    }))
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return Number(a.number || 0) - Number(b.number || 0);
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate - b.dueDate;
    });
  const nextParcel = openParcels[0] || null;
  const openCents = openParcels.reduce(
    (sum, parcel) => sum + Number(parcel.amountCents || 0),
    0
  );
  const overdueCount = openParcels.filter(
    (parcel) => parcel.dueDate && today && parcel.dueDate < today
  ).length;
  const paidCount = activeParcels.filter((parcel) => parcel.paid).length;
  const status = openCents <= 0
    ? "Pago"
    : overdueCount > 0
      ? "Em atraso"
      : "Em aberto";

  return {
    totalLabel: formatAmount(totalCents),
    paidLabel: formatAmount(paidCents),
    openLabel: formatAmount(openCents),
    paidCount,
    installments: revenue.installments || parcels.length || 1,
    status,
    statusClass: status === "Pago" ? "is-green" : status === "Em atraso" ? "is-red" : "is-yellow",
    nextParcel: nextParcel
      ? {
          label: `${nextParcel.number || "-"} / ${revenue.installments || parcels.length || "-"}`,
          dateLabel: nextParcel.dueDate ? formatDateOnlyLabel(nextParcel.dueDate) : "Sem vencimento",
          amountLabel: formatAmount(nextParcel.amountCents || 0),
          account: nextParcel.paymentAccount || revenue.paymentAccount || "-",
        }
      : null,
  };
}

function firstPaymentDateTime(revenue) {
  const parcels = safeJsonParse(revenue.parcelDataJson);
  const firstParcel =
    parcels.find((parcel) => Number(parcel.number) === 1 && parcel.date) ||
    parcels
      .filter((parcel) => parcel.date)
      .sort((a, b) => Number(a.number || 0) - Number(b.number || 0))[0];
  const date = firstParcel ? parseDateInput(firstParcel.date, true) : null;
  return date ? date.getTime() : 0;
}

function replaceParcelPaymentAccount(parcelDataJson, oldName, newName) {
  const parcels = safeJsonParse(parcelDataJson);
  if (!Array.isArray(parcels)) return null;

  let changed = false;
  const nextParcels = parcels.map((parcel) => {
    if (parcel && parcel.paymentAccount === oldName) {
      changed = true;
      return { ...parcel, paymentAccount: newName };
    }
    return parcel;
  });

  return changed ? JSON.stringify(nextParcels) : null;
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
        clientLabel: revenue.client?.fullName || "Cliente desconhecido",
        paymentAccount: parcel.paymentAccount || revenue.paymentAccount || "-",
        amountLabel: formatAmount(parcel.amountCents || 0),
        parcelLabel: `${parcel.number || "-"} / ${revenue.installments || "-"}`,
        note: parcelCancellationNote(parcel),
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

  router.use((req, res, next) => {
    if (!req.session?.userId) return res.redirect("/login");
    const permission = req.path.startsWith("/vendas") ? "admin.sales" : "admin.revenues";
    if (!userCan(req.session.userRole, permission)) {
      return res.status(403).send("Seu perfil não possui acesso a este módulo.");
    }
    next();
  });

  function ownerScope(req) {
    return dataOwnerScope(req);
  }

  function clientScope(req) {
    return {
      deletedAt: null,
      OR: [
        { ownerId: req.session?.userId || null },
        { ownerId: null },
      ],
    };
  }

  function normalizeDocument(value) {
    return String(value || "").replace(/[\s.\-_/]/g, "").toUpperCase();
  }

  async function ensureUniqueClientDocument(req, document) {
    const normalized = normalizeDocument(document);
    if (!normalized) return;

    const clients = await prisma.revenueClient.findMany({
      where: {
        ownerId: req.session?.userId || null,
        deletedAt: null,
      },
      select: { document: true },
    });

    if (clients.some((client) => normalizeDocument(client.document) === normalized)) {
      throw new Error("Já existe um cliente cadastrado com este CPF/RG/Passaporte.");
    }
  }

  async function loadContext(req, revenue = null) {
    const clients = await prisma.revenueClient.findMany({
      where: clientScope(req),
      orderBy: { fullName: "asc" },
    });
    const selectedRevenueKittenId = revenue?.kittenId ? Number(revenue.kittenId) : null;
    const kittens = await prisma.cat.findMany({
      where: {
        ...ownerScope(req),
        OR: [
          {
            AND: [
              { OR: [{ kittenNumber: { not: null } }, { litterKitten: { isNot: null } }] },
              { deceased: false },
              { delivered: false },
              { breedingProspect: false },
            ],
          },
          ...(selectedRevenueKittenId ? [{ id: selectedRevenueKittenId }] : []),
        ],
      },
      include: {
        litterKitten: { include: { litter: true } },
        mother: true,
        owner: { include: { settings: true } },
      },
      orderBy: [{ kittenNumber: "asc" }, { name: "asc" }],
    });
    const products = await prisma.revenueProductService.findMany({
      where: {
        ...ownerScope(req),
        OR: [
          { active: true },
          ...(revenue?.productServiceId ? [{ id: revenue.productServiceId }] : []),
        ],
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
    const accounts = await prisma.quickLaunchOption.findMany({
      where: { type: "PAYMENT", disabledAt: null },
      orderBy: { name: "asc" },
    });
    const paymentAccounts = Array.from(new Set(accounts.map((item) => item.name).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    const kittenOptions = kittens.map((cat) => ({ ...cat, label: buildKittenLabel(cat) }));
    const availableKittens = kittenOptions.filter((cat) => deriveKittenStatus(cat) === "AVAILABLE");
    const reservedKittens = kittenOptions.filter((cat) => deriveKittenStatus(cat) === "RESERVED");
    const linkedKitten = selectedRevenueKittenId
      ? kittenOptions.find((cat) => Number(cat.id) === selectedRevenueKittenId)
      : null;
    const linkedAlreadyListed = linkedKitten && [...availableKittens, ...reservedKittens]
      .some((cat) => Number(cat.id) === Number(linkedKitten.id));

    return {
      clients: clients.map((client) => ({
        ...client,
        document: formatCpfCnpj(client.document),
      })),
      kittenGroups: [
        {
          label: "Disponíveis",
          kittens: availableKittens,
        },
        {
          label: "Reservados",
          kittens: reservedKittens,
        },
        ...(linkedKitten && !linkedAlreadyListed ? [{
          label: "Vinculado à receita",
          kittens: [linkedKitten],
        }] : []),
      ],
      productServices: products.map((item) => ({
        ...item,
        label: `${item.type === "PRODUCT" ? "Produto" : "Serviço"} - ${item.name}`,
        price: item.priceCents ? formatAmount(item.priceCents) : "",
      })),
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
        canceled: body[`parcel${i}Canceled`] === "YES",
        refundDate:
          body[`parcel${i}Paid`] === "YES" && body[`parcel${i}Canceled`] === "YES"
            ? body[`parcel${i}RefundDate`] || ""
            : "",
        paymentAccount: body[`parcel${i}PaymentAccount`] || body.paymentAccount || DEFAULT_PAYMENT_ACCOUNT,
      });
    }

    const revenueItem = String(body.revenueItem || "").trim();
    const isProductService = revenueItem.startsWith("product:");
    const isCat = revenueItem.startsWith("cat:");
    const selectedKittenId = isCat
      ? Number(revenueItem.replace("cat:", ""))
      : body.kittenId
        ? Number(body.kittenId)
        : null;
    const selectedProductServiceId = isProductService
      ? Number(revenueItem.replace("product:", ""))
      : null;

    return {
      clientId: body.clientId ? Number(body.clientId) : null,
      kittenId: selectedKittenId || (isProductService ? null : existing?.kittenId || null),
      productServiceId: selectedProductServiceId || null,
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
    const backPath = safeReturnPath(extra.backPath || req.query.returnTo || req.body?.returnTo, extra.defaultBackPath || "/receitas");
    res.status(extra.status || 200).render("revenues/index", {
      ...(await loadContext(req, extra.revenue)),
      revenueSummary: buildRevenueSummary(extra.revenue),
      formAction: extra.formAction || (extra.revenue?.id ? `/receitas/${extra.revenue.id}` : "/receitas"),
      backPath,
      success: extra.success || false,
      error: extra.error || null,
      homePath: req.session?.userId ? "/dashboard" : "/login",
      currentPath: "/receitas",
  });
  }

  async function syncKittenOwnerFromSale(tx, kittenId, client) {
    if (!kittenId || !client) return;
    const existingKitten = await tx.cat.findUnique({
      where: { id: kittenId },
      select: { newOwnerInfoJson: true },
    });
    const currentOwnerInfo = safeJsonParse(existingKitten?.newOwnerInfoJson, {});
    const nextOwnerInfo = {
      ...currentOwnerInfo,
      ...clientOwnerInfo(client),
    };

    await tx.cat.update({
      where: { id: kittenId },
      data: {
        currentOwnerClientId: client.id,
        currentOwnerId: null,
        ownershipSource: "SALE",
        ownershipType: "OWNER",
        newOwnerInfoJson: JSON.stringify(nextOwnerInfo),
        sold: true,
        kittenAvailabilityStatus: "RESERVED",
      },
    });
  }

  router.get("/receitas", async (req, res) => {
    await renderForm(req, res, { success: req.query.ok === "1" });
  });

  router.post("/receitas", async (req, res) => {
    try {
      const revenueItem = String(req.body.revenueItem || "").trim();
      const kittenId = revenueItem.startsWith("cat:")
        ? Number(revenueItem.replace("cat:", ""))
        : req.body.kittenId
          ? Number(req.body.kittenId)
          : null;
      const productServiceId = revenueItem.startsWith("product:")
        ? Number(revenueItem.replace("product:", ""))
        : null;
      const client = req.body.clientId
        ? await prisma.revenueClient.findFirst({
            where: { id: Number(req.body.clientId), ...clientScope(req) },
          })
        : null;
      if (kittenId && !client) {
        throw new Error("Selecione um cliente cadastrado para registrar a venda do filhote.");
      }
      const kitten = kittenId
        ? await prisma.cat.findFirst({
            where: { id: kittenId, ...ownerScope(req) },
            include: {
              litterKitten: { include: { litter: true } },
              mother: true,
              owner: { include: { settings: true } },
            },
          })
        : null;
      if (kittenId && !kitten) {
        throw new Error("Filhote selecionado não encontrado para este usuário.");
      }
      const productService = productServiceId
        ? await prisma.revenueProductService.findFirst({
            where: { id: productServiceId, ...ownerScope(req), active: true },
          })
        : null;
      const data = buildRevenueData({
        ...req.body,
        revenueItem,
        kittenLabel: kitten
          ? buildKittenLabel(kitten)
          : productService
            ? `${productService.type === "PRODUCT" ? "Produto" : "Serviço"} - ${productService.name}`
            : req.body.kittenLabel,
      });

      await prisma.$transaction(async (tx) => {
        await tx.revenueEntry.create({
          data: {
            ownerId: req.session?.userId || null,
            ...data,
          },
        });
        await syncKittenOwnerFromSale(tx, data.kittenId, client);
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
      returnTo: `/receitas/lista?month=${encodeURIComponent(month)}&page=${encodeURIComponent(String(page))}`,
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
    });
    const sortedRevenues = revenues
      .slice()
      .sort((a, b) => {
        const dateCompare = firstPaymentDateTime(b) - firstPaymentDateTime(a);
        return dateCompare || Number(b.id) - Number(a.id);
      })
      .slice(0, 200);

    res.render("revenues/sales-list", {
      revenues: sortedRevenues,
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
      backPath: safeReturnPath(req.query.returnTo, "/vendas"),
      defaultBackPath: "/vendas",
    });
  });

  router.post("/vendas/:id", async (req, res) => {
    const existing = await prisma.revenueEntry.findFirst({
      where: { id: Number(req.params.id), ...ownerScope(req) },
    });
    if (!existing) return res.status(404).send("Venda não encontrada.");

    const revenueItem = String(req.body.revenueItem || "").trim();
    const kittenId = revenueItem.startsWith("cat:")
      ? Number(revenueItem.replace("cat:", ""))
      : req.body.kittenId
        ? Number(req.body.kittenId)
        : null;
    const productServiceId = revenueItem.startsWith("product:")
      ? Number(revenueItem.replace("product:", ""))
      : null;
    const [kitten, productService, client] = await Promise.all([
      kittenId
        ? prisma.cat.findFirst({
            where: { id: kittenId, ...ownerScope(req) },
            include: {
              litterKitten: { include: { litter: true } },
              mother: true,
              owner: { include: { settings: true } },
            },
          })
        : null,
      productServiceId
        ? prisma.revenueProductService.findFirst({
            where: { id: productServiceId, ...ownerScope(req), active: true },
          })
        : null,
      req.body.clientId
        ? prisma.revenueClient.findFirst({
            where: { id: Number(req.body.clientId), ...clientScope(req) },
          })
        : null,
    ]);

    if (kittenId && !kitten) {
      return await renderForm(req, res, {
        status: 400,
        revenue: existing,
        formAction: `/vendas/${existing.id}`,
        backPath: safeReturnPath(req.body.returnTo, "/vendas"),
        defaultBackPath: "/vendas",
        error: "Filhote selecionado não encontrado para este usuário.",
      });
    }

    if (kittenId && !client) {
      return await renderForm(req, res, {
        status: 400,
        revenue: existing,
        formAction: `/vendas/${existing.id}`,
        backPath: safeReturnPath(req.body.returnTo, "/vendas"),
        defaultBackPath: "/vendas",
        error: "Selecione um cliente cadastrado para registrar a venda do filhote.",
      });
    }

    const data = buildRevenueData({
      ...req.body,
      revenueItem,
      kittenLabel: kitten
        ? buildKittenLabel(kitten)
        : productService
          ? `${productService.type === "PRODUCT" ? "Produto" : "Serviço"} - ${productService.name}`
          : req.body.kittenLabel,
    }, existing);

    await prisma.$transaction(async (tx) => {
      await tx.revenueEntry.update({
        where: { id: existing.id },
        data,
      });
      await syncKittenOwnerFromSale(tx, data.kittenId, client);
    });
    res.redirect(safeReturnPath(req.body.returnTo, "/vendas"));
  });

  router.post("/vendas/:id/delete", async (req, res) => {
    const existing = await prisma.revenueEntry.findFirst({
      where: { id: Number(req.params.id), ...ownerScope(req) },
      select: { id: true },
    });
    if (!existing) return res.status(404).send("Venda não encontrada.");

    await prisma.revenueEntry.delete({ where: { id: existing.id } });
    res.redirect(safeReturnPath(req.body.returnTo, "/vendas"));
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
      await ensureUniqueClientDocument(req, req.body.document);
      await prisma.revenueClient.create({
        data: {
          ownerId: req.session?.userId || null,
          fullName: req.body.fullName,
          document: formatCpfCnpj(req.body.document) || null,
          cep: req.body.cep || null,
          street: req.body.street || null,
          number: req.body.number || null,
          complement: req.body.complement || null,
          neighborhood: req.body.neighborhood || null,
          city: req.body.city || null,
          state: req.body.state || null,
          country: req.body.country || null,
          email: req.body.email || null,
          phone: formatPhone(req.body.phone) || null,
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
      await prisma.$transaction(async (tx) => {
        await tx.quickLaunchOption.update({ where: { id }, data: { name } });
        await tx.quickLaunchEntry.updateMany({
          where: { paymentMethod: account.name },
          data: { paymentMethod: name },
        });
        await tx.revenueEntry.updateMany({
          where: { paymentAccount: account.name },
          data: { paymentAccount: name },
        });
        await tx.financialAccountSetting.updateMany({
          where: { accountName: account.name },
          data: { accountName: name },
        });
        await tx.financialTransfer.updateMany({
          where: { fromAccount: account.name },
          data: { fromAccount: name },
        });
        await tx.financialTransfer.updateMany({
          where: { toAccount: account.name },
          data: { toAccount: name },
        });
        await tx.accountPayable.updateMany({
          where: { paymentMethod: account.name },
          data: { paymentMethod: name },
        });

        const revenueParcels = await tx.revenueEntry.findMany({
          where: { parcelDataJson: { not: null } },
          select: { id: true, parcelDataJson: true },
        });
        for (const revenue of revenueParcels) {
          const nextParcelData = replaceParcelPaymentAccount(revenue.parcelDataJson, account.name, name);
          if (nextParcelData) {
            await tx.revenueEntry.update({
              where: { id: revenue.id },
              data: { parcelDataJson: nextParcelData },
            });
          }
        }
      });
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
    await renderForm(req, res, {
      revenue,
      backPath: safeReturnPath(req.query.returnTo, "/receitas/lista"),
      defaultBackPath: "/receitas/lista",
    });
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
    res.redirect(safeReturnPath(req.body.returnTo, "/receitas/lista"));
  });

  router.post("/receitas/:id/delete", async (req, res) => {
    const existing = await prisma.revenueEntry.findFirst({
      where: { id: Number(req.params.id), ...ownerScope(req) },
      select: { id: true },
    });
    if (!existing) return res.status(404).send("Receita não encontrada.");

    await prisma.revenueEntry.delete({ where: { id: existing.id } });
    res.redirect(safeReturnPath(req.body.returnTo, "/receitas/lista"));
  });

  return router;
};
