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

function formatDateInput(date) {
  return date ? new Date(date).toISOString().slice(0, 10) : todayForInput();
}

function formatDateLabel(date) {
  if (!date) return "-";
  const value = new Date(date);
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const year = value.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function parseDateInput(value) {
  const text = String(value || todayForInput()).slice(0, 10);
  const [year, month, day] = text.split("-").map(Number);
  return year && month && day ? new Date(Date.UTC(year, month - 1, day)) : new Date();
}

function addMonths(date, amount) {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, date.getUTCDate()));
  if (next.getUTCDate() !== date.getUTCDate()) {
    next.setUTCDate(0);
  }
  return next;
}

function cleanText(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || "";
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
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

  function supplierScope(req) {
    if (canViewAllData(req.session?.userRole)) return {};
    return { ownerId: req.session?.userId || null };
  }

  function supplierData(req) {
    const commercialName = cleanText(req.body.commercialName);
    if (!commercialName) {
      throw new Error("Informe o Nome Comercial do fornecedor.");
    }

    return {
      ownerId: req.session?.userId || null,
      commercialName,
      defaultCategory: cleanText(req.body.defaultCategory) || null,
      tradeName: cleanText(req.body.tradeName) || null,
      cnpj: onlyDigits(req.body.cnpj) || null,
      cep: onlyDigits(req.body.cep) || null,
      street: cleanText(req.body.street) || null,
      number: cleanText(req.body.number) || null,
      complement: cleanText(req.body.complement) || null,
      neighborhood: cleanText(req.body.neighborhood) || null,
      city: cleanText(req.body.city) || null,
      state: cleanText(req.body.state).toUpperCase() || null,
      email: cleanText(req.body.email).toLowerCase() || null,
      phone: cleanText(req.body.phone) || null,
      contactName: cleanText(req.body.contactName) || null,
      contactPhone: cleanText(req.body.contactPhone) || null,
    };
  }

  async function syncSupplierOption(name) {
    const supplierName = cleanText(name);
    if (!supplierName) return;

    const existing = await prisma.quickLaunchOption.findFirst({
      where: {
        type: "SUPPLIER",
        ownerId: null,
        name: supplierName,
      },
      select: { id: true },
    });
    if (existing) return;

    await prisma.quickLaunchOption.create({
      data: {
        type: "SUPPLIER",
        ownerId: null,
        name: supplierName,
      },
    });
  }

  async function renameSupplierOption(req, oldName, newName) {
    const previous = cleanText(oldName);
    const next = cleanText(newName);
    if (!previous || !next || previous === next) {
      await syncSupplierOption(next);
      return;
    }

    const duplicate = await prisma.quickLaunchOption.findFirst({
      where: { type: "SUPPLIER", ownerId: null, name: next },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      if (!duplicate) {
        await tx.quickLaunchOption.updateMany({
          where: { type: "SUPPLIER", ownerId: null, name: previous },
          data: { name: next },
        });
      }

      await tx.quickLaunchEntry.updateMany({
        where: {
          supplier: previous,
          ...(canViewAllData(req.session?.userRole) ? {} : { ownerId: req.session?.userId || null }),
        },
        data: { supplier: next },
      });
    });
    await syncSupplierOption(next);

    if (duplicate) {
      const remainingWithPreviousName = await prisma.expenseSupplier.count({
        where: { commercialName: previous },
      });
      const previousUsageCount = await prisma.quickLaunchEntry.count({
        where: { supplier: previous },
      });
      if (!remainingWithPreviousName && !previousUsageCount) {
        await prisma.quickLaunchOption.deleteMany({
          where: { type: "SUPPLIER", ownerId: null, name: previous },
        });
      }
    }
  }

  async function loadSupplierRows(req) {
    return prisma.expenseSupplier.findMany({
      where: supplierScope(req),
      orderBy: [{ commercialName: "asc" }],
    });
  }

  async function loadExpenseOptionNames(type) {
    const options = await prisma.quickLaunchOption.findMany({
      where: { type, disabledAt: null },
      orderBy: { name: "asc" },
      select: { name: true },
    });
    return Array.from(new Set(options.map((option) => option.name).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function payableData(req) {
    const amountCents = parseAmountToCents(req.body.amount);
    const supplier = cleanText(req.body.supplier);
    const category = cleanText(req.body.category);
    if (!supplier || !category || amountCents <= 0) {
      throw new Error("Informe fornecedor, categoria e valor.");
    }

    return {
      ownerId: req.session?.userId || null,
      supplier,
      category,
      description: cleanText(req.body.description) || null,
      amountCents,
      dueDate: parseDateInput(req.body.dueDate),
      paymentMethod: cleanText(req.body.paymentMethod) || null,
      note: cleanText(req.body.note) || null,
      isFixed: req.body.isFixed === "YES",
    };
  }

  function mapPayable(row) {
    return {
      ...row,
      amount: formatAmount(row.amountCents),
      amountLabel: formatAmount(row.amountCents),
      dueDateInput: formatDateInput(row.dueDate),
      dueDateLabel: formatDateLabel(row.dueDate),
      paidAtLabel: row.paidAt ? formatDateLabel(row.paidAt) : "",
    };
  }

  function clientData(req) {
    return {
      fullName: cleanText(req.body.fullName),
      document: cleanText(req.body.document) || null,
      cep: cleanText(req.body.cep) || null,
      street: cleanText(req.body.street) || null,
      number: cleanText(req.body.number) || null,
      complement: cleanText(req.body.complement) || null,
      neighborhood: cleanText(req.body.neighborhood) || null,
      city: cleanText(req.body.city) || null,
      state: cleanText(req.body.state) || null,
      country: cleanText(req.body.country) || null,
      email: cleanText(req.body.email) || null,
      phone: cleanText(req.body.phone) || null,
    };
  }

  function normalizeDocument(value) {
    return String(value || "").replace(/[\s.\-_/]/g, "").toUpperCase();
  }

  async function ensureUniqueClientDocument(req, document, excludeId = null) {
    const normalized = normalizeDocument(document);
    if (!normalized) return;
    const clients = await prisma.revenueClient.findMany({
      where: { ...supplierScope(req), deletedAt: null },
      select: { id: true, document: true },
    });
    if (clients.some((client) => client.id !== excludeId && normalizeDocument(client.document) === normalized)) {
      throw new Error("Já existe um cliente cadastrado com este CPF/RG/Passaporte.");
    }
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
    const existing = await prisma.financialAccountSetting.findFirst({
      where: { ownerId, accountName },
    });
    if (existing) return existing;
    return prisma.financialAccountSetting.create({ data: { ownerId, accountName } });
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
    const transfers = await prisma.financialTransfer.findMany({
      where: { ...ownerScope(req), deletedAt: null },
      select: { fromAccount: true, toAccount: true, amountCents: true, transferDate: true },
    });

    const rows = [];
    for (const accountName of accounts) {
      const setting = await upsertSetting(req, accountName);
      const accountExpenses = expenses.filter((expense) => expense.paymentMethod === accountName);
      const allRevenueParcels = revenues
        .flatMap((revenue) => parseParcels(revenue.parcelDataJson).map((parcel) => ({
          ...parcel,
          paymentAccount: parcel.paymentAccount || revenue.paymentAccount || "",
        })))
        .filter((parcel) => parcel.paymentAccount === accountName);
      const accountTransfersOut = transfers.filter((transfer) => transfer.fromAccount === accountName);
      const accountTransfersIn = transfers.filter((transfer) => transfer.toAccount === accountName);

      const totalIncome = allRevenueParcels.reduce((sum, parcel) => sum + Number(parcel.amountCents || 0), 0);
      const totalExpenses = accountExpenses.reduce((sum, expense) => sum + Number(expense.amountCents || 0), 0);
      const totalTransfersIn = accountTransfersIn.reduce((sum, transfer) => sum + Number(transfer.amountCents || 0), 0);
      const totalTransfersOut = accountTransfersOut.reduce((sum, transfer) => sum + Number(transfer.amountCents || 0), 0);
      const monthIncome = allRevenueParcels.reduce((sum, parcel) => {
        const paidDate = parseDateInput(parcel.date);
        return monthContains(paidDate, start, end) ? sum + Number(parcel.amountCents || 0) : sum;
      }, 0);
      const monthExpenses = accountExpenses.reduce((sum, expense) => (
        monthContains(expense.competenceDate, start, end) ? sum + Number(expense.amountCents || 0) : sum
      ), 0);
      const monthTransfersIn = accountTransfersIn.reduce((sum, transfer) => (
        monthContains(transfer.transferDate, start, end) ? sum + Number(transfer.amountCents || 0) : sum
      ), 0);
      const monthTransfersOut = accountTransfersOut.reduce((sum, transfer) => (
        monthContains(transfer.transferDate, start, end) ? sum + Number(transfer.amountCents || 0) : sum
      ), 0);

      rows.push({
        accountName,
        initialBalance: formatAmount(setting.initialBalanceCents),
        capitalSocialEnabled: setting.capitalSocialEnabled,
        capitalSocial: formatAmount(setting.capitalSocialCents),
        capitalSocialLabel: formatAmount(setting.capitalSocialCents),
        balanceLabel: formatAmount(setting.initialBalanceCents + totalIncome + totalTransfersIn - totalExpenses - totalTransfersOut),
        monthIncomeLabel: formatAmount(monthIncome + monthTransfersIn),
        monthExpenseLabel: formatAmount(monthExpenses + monthTransfersOut),
      });
    }
    return rows;
  }

  async function loadTransferRows(req) {
    const transfers = await prisma.financialTransfer.findMany({
      where: { ...ownerScope(req), deletedAt: null },
      orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }],
    });

    return transfers.map((transfer) => ({
      ...transfer,
      amount: formatAmount(transfer.amountCents),
      amountLabel: formatAmount(transfer.amountCents),
      transferDateInput: formatDateInput(transfer.transferDate),
      transferDateLabel: formatDateLabel(transfer.transferDate),
    }));
  }

  async function findTransfer(req, id) {
    return prisma.financialTransfer.findFirst({
      where: { id, ...ownerScope(req), deletedAt: null },
    });
  }

  function transferHistory(transfer, action) {
    const history = safeJsonParse(transfer.historyJson);
    history.push({
      action,
      at: new Date().toISOString(),
      previous: {
        fromAccount: transfer.fromAccount,
        toAccount: transfer.toAccount,
        amountCents: transfer.amountCents,
        transferDate: formatDateInput(transfer.transferDate),
        note: transfer.note || null,
      },
    });
    return JSON.stringify(history);
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
    "/administrativo/fornecedores",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      res.render("administrative/suppliers", {
        user: req.user,
        currentPath: "/administrativo",
        suppliers: await loadSupplierRows(req),
        categories: await loadExpenseOptionNames("CATEGORY"),
        form: {},
        success: req.query.ok === "1",
        error: req.query.error || "",
      });
    }
  );

  router.post(
    "/administrativo/fornecedores",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      try {
        const data = supplierData(req);
        await prisma.expenseSupplier.create({ data });
        await syncSupplierOption(data.commercialName);
        res.redirect("/administrativo/fornecedores?ok=1");
      } catch (err) {
        const message = err.code === "P2002"
          ? "Já existe um fornecedor com este Nome Comercial."
          : err.message || "Erro ao salvar fornecedor.";
        res.status(400).render("administrative/suppliers", {
          user: req.user,
          currentPath: "/administrativo",
          suppliers: await loadSupplierRows(req),
          categories: await loadExpenseOptionNames("CATEGORY"),
          form: req.body,
          success: false,
          error: message,
        });
      }
    }
  );

  router.post(
    "/administrativo/fornecedores/:id/update",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      const id = Number(req.params.id);
      const supplier = await prisma.expenseSupplier.findFirst({
        where: { id, ...supplierScope(req) },
      });
      if (!supplier) return res.status(404).send("Fornecedor não encontrado.");

      try {
        const data = supplierData(req);
        await prisma.expenseSupplier.update({
          where: { id: supplier.id },
          data: {
            ...data,
            ownerId: supplier.ownerId,
          },
        });
        await renameSupplierOption(req, supplier.commercialName, data.commercialName);
        res.redirect("/administrativo/fornecedores?ok=1");
      } catch (err) {
        const message = err.code === "P2002"
          ? "Já existe um fornecedor com este Nome Comercial."
          : err.message || "Erro ao atualizar fornecedor.";
        res.redirect(`/administrativo/fornecedores?error=${encodeURIComponent(message)}`);
      }
    }
  );

  router.post(
    "/administrativo/fornecedores/:id/delete",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      const id = Number(req.params.id);
      const supplier = await prisma.expenseSupplier.findFirst({
        where: { id, ...supplierScope(req) },
        select: { id: true, commercialName: true },
      });
      if (!supplier) return res.status(404).send("Fornecedor não encontrado.");

      const usageCount = await prisma.quickLaunchEntry.count({
        where: {
          supplier: supplier.commercialName,
          ...(canViewAllData(req.session?.userRole) ? {} : { ownerId: req.session?.userId || null }),
        },
      });
      if (usageCount > 0) {
        return res.redirect(`/administrativo/fornecedores?error=${encodeURIComponent("Este fornecedor já está sendo usado em despesas e não pode ser excluído.")}`);
      }

      await prisma.expenseSupplier.delete({ where: { id: supplier.id } });
      const remainingWithName = await prisma.expenseSupplier.count({
        where: { commercialName: supplier.commercialName },
      });
      if (!remainingWithName) {
        await prisma.quickLaunchOption.deleteMany({
          where: {
            type: "SUPPLIER",
            ownerId: null,
            name: supplier.commercialName,
          },
        });
      }
      res.redirect("/administrativo/fornecedores?ok=1");
    }
  );

  router.get(
    "/administrativo/despesas",
    requireAuth,
    requirePermission("admin.administrative"),
    (req, res) => res.redirect("/despesas")
  );

  router.get(
    "/administrativo/receitas-vendas",
    requireAuth,
    requirePermission("admin.administrative"),
    (req, res) => res.redirect("/vendas")
  );

  router.get(
    "/administrativo/clientes",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      const clients = await prisma.revenueClient.findMany({
        where: { ...supplierScope(req), deletedAt: null },
        orderBy: { fullName: "asc" },
        include: { _count: { select: { revenues: true } } },
      });
      res.render("administrative/clients", {
        user: req.user,
        currentPath: "/administrativo",
        clients,
        success: req.query.ok === "1",
        error: req.query.error || "",
      });
    }
  );

  router.get(
    "/administrativo/clientes/novo",
    requireAuth,
    requirePermission("admin.administrative"),
    (req, res) => {
      res.render("revenues/client-form", {
        title: "Novo Cliente",
        formAction: "/administrativo/clientes/novo",
        backPath: "/administrativo/clientes",
        client: null,
        deleteAction: null,
        error: null,
        currentPath: "/administrativo",
      });
    }
  );

  router.post(
    "/administrativo/clientes/novo",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      try {
        await ensureUniqueClientDocument(req, req.body.document);
        await prisma.revenueClient.create({
          data: {
            ownerId: req.session?.userId || null,
            ...clientData(req),
          },
        });
        res.redirect("/administrativo/clientes?ok=1");
      } catch (err) {
        res.status(400).render("revenues/client-form", {
          title: "Novo Cliente",
          formAction: "/administrativo/clientes/novo",
          backPath: "/administrativo/clientes",
          client: req.body,
          deleteAction: null,
          error: err.message || "Erro ao salvar cliente.",
          currentPath: "/administrativo",
        });
      }
    }
  );

  router.get(
    "/administrativo/clientes/:id",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      const client = await prisma.revenueClient.findFirst({
        where: { id: Number(req.params.id), ...supplierScope(req), deletedAt: null },
      });
      if (!client) return res.status(404).send("Cliente não encontrado.");
      res.render("revenues/client-form", {
        title: "Editar Cliente",
        formAction: `/administrativo/clientes/${client.id}`,
        backPath: "/administrativo/clientes",
        client,
        deleteAction: `/administrativo/clientes/${client.id}/excluir`,
        error: null,
        currentPath: "/administrativo",
      });
    }
  );

  router.post(
    "/administrativo/clientes/:id",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      const client = await prisma.revenueClient.findFirst({
        where: { id: Number(req.params.id), ...supplierScope(req), deletedAt: null },
      });
      if (!client) return res.status(404).send("Cliente não encontrado.");

      try {
        await ensureUniqueClientDocument(req, req.body.document, client.id);
        await prisma.revenueClient.update({
          where: { id: client.id },
          data: clientData(req),
        });
        res.redirect("/administrativo/clientes?ok=1");
      } catch (err) {
        res.status(400).render("revenues/client-form", {
          title: "Editar Cliente",
          formAction: `/administrativo/clientes/${client.id}`,
          backPath: "/administrativo/clientes",
          client: { ...client, ...req.body },
          deleteAction: `/administrativo/clientes/${client.id}/excluir`,
          error: err.message || "Erro ao salvar cliente.",
          currentPath: "/administrativo",
        });
      }
    }
  );

  router.post(
    "/administrativo/clientes/:id/excluir",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      const client = await prisma.revenueClient.findFirst({
        where: { id: Number(req.params.id), ...supplierScope(req), deletedAt: null },
      });
      if (!client) return res.status(404).send("Cliente não encontrado.");
      await prisma.revenueClient.update({
        where: { id: client.id },
        data: { deletedAt: new Date() },
      });
      res.redirect("/administrativo/clientes?ok=1");
    }
  );

  router.get(
    "/administrativo/contas-a-pagar",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      const [payables, suppliers, categories, paymentMethods] = await Promise.all([
        prisma.accountPayable.findMany({
          where: supplierScope(req),
          orderBy: [{ status: "asc" }, { dueDate: "asc" }],
          take: 300,
        }),
        loadSupplierRows(req),
        loadExpenseOptionNames("CATEGORY"),
        loadExpenseOptionNames("PAYMENT"),
      ]);
      res.render("administrative/payables", {
        user: req.user,
        currentPath: "/administrativo",
        payables: payables.map(mapPayable),
        suppliers,
        categories,
        paymentMethods,
        form: {},
        success: req.query.ok === "1",
        error: req.query.error || "",
      });
    }
  );

  router.post(
    "/administrativo/contas-a-pagar",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      try {
        const data = payableData(req);
        await prisma.accountPayable.create({
          data: {
            ...data,
            recurringGroupId: data.isFixed ? `${Date.now()}-${Math.round(Math.random() * 1e9)}` : null,
          },
        });
        res.redirect("/administrativo/contas-a-pagar?ok=1");
      } catch (err) {
        res.redirect(`/administrativo/contas-a-pagar?error=${encodeURIComponent(err.message || "Erro ao salvar conta a pagar.")}`);
      }
    }
  );

  router.post(
    "/administrativo/contas-a-pagar/:id/update",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      const payable = await prisma.accountPayable.findFirst({
        where: { id: Number(req.params.id), ...supplierScope(req) },
      });
      if (!payable || payable.status === "PAID") return res.status(404).send("Conta a pagar não encontrada.");

      try {
        const data = payableData(req);
        await prisma.accountPayable.update({
          where: { id: payable.id },
          data: {
            ...data,
            ownerId: payable.ownerId,
            recurringGroupId: data.isFixed ? payable.recurringGroupId || `${Date.now()}-${Math.round(Math.random() * 1e9)}` : null,
          },
        });

        if (payable.recurringGroupId && req.body.applyFuture === "YES") {
          await prisma.accountPayable.updateMany({
            where: {
              ownerId: payable.ownerId,
              recurringGroupId: payable.recurringGroupId,
              status: "PENDING",
              dueDate: { gt: payable.dueDate },
            },
            data: {
              supplier: data.supplier,
              category: data.category,
              description: data.description,
              amountCents: data.amountCents,
              paymentMethod: data.paymentMethod,
              note: data.note,
              isFixed: data.isFixed,
            },
          });
        }

        res.redirect("/administrativo/contas-a-pagar?ok=1");
      } catch (err) {
        res.redirect(`/administrativo/contas-a-pagar?error=${encodeURIComponent(err.message || "Erro ao atualizar conta a pagar.")}`);
      }
    }
  );

  router.post(
    "/administrativo/contas-a-pagar/:id/pagar",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      const payable = await prisma.accountPayable.findFirst({
        where: { id: Number(req.params.id), ...supplierScope(req), status: "PENDING" },
      });
      if (!payable) return res.status(404).send("Conta a pagar não encontrada.");

      const paidAt = parseDateInput(req.body.paidAt);
      const paymentMethod = cleanText(req.body.paymentMethod) || payable.paymentMethod || "";
      if (!paymentMethod) {
        return res.redirect(`/administrativo/contas-a-pagar?error=${encodeURIComponent("Informe a conta de pagamento antes de efetivar.")}`);
      }

      const expense = await prisma.quickLaunchEntry.create({
        data: {
          ownerId: payable.ownerId,
          amountCents: payable.amountCents,
          category: payable.category,
          paymentMethod,
          supplier: payable.supplier,
          receiptPath: null,
          note: payable.note || payable.description,
          competenceDate: paidAt,
        },
      });

      await prisma.accountPayable.update({
        where: { id: payable.id },
        data: {
          status: "PAID",
          paidAt,
          paymentMethod,
          expenseEntryId: expense.id,
        },
      });

      if (payable.isFixed) {
        await prisma.accountPayable.create({
          data: {
            ownerId: payable.ownerId,
            supplier: payable.supplier,
            category: payable.category,
            description: payable.description,
            amountCents: payable.amountCents,
            dueDate: addMonths(payable.dueDate, 1),
            paymentMethod: payable.paymentMethod,
            note: payable.note,
            isFixed: true,
            recurringGroupId: payable.recurringGroupId || `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
          },
        });
      }

      res.redirect("/administrativo/contas-a-pagar?ok=1");
    }
  );

  router.post(
    "/administrativo/contas-a-pagar/:id/delete",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      const payable = await prisma.accountPayable.findFirst({
        where: { id: Number(req.params.id), ...supplierScope(req), status: "PENDING" },
      });
      if (!payable) return res.status(404).send("Conta a pagar não encontrada.");
      await prisma.accountPayable.delete({ where: { id: payable.id } });
      res.redirect("/administrativo/contas-a-pagar?ok=1");
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
        transfers: await loadTransferRows(req),
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
      const existing = await prisma.financialAccountSetting.findFirst({
        where: { ownerId, accountName },
        select: { id: true },
      });
      const data = {
        initialBalanceCents: parseAmountToCents(req.body.initialBalance),
        capitalSocialEnabled: req.body.capitalSocialEnabled === "YES",
        capitalSocialCents: parseAmountToCents(req.body.capitalSocial),
      };
      if (existing) {
        await prisma.financialAccountSetting.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await prisma.financialAccountSetting.create({
          data: {
            ...data,
            ownerId,
            accountName,
          },
        });
      }

      res.redirect("/administrativo/contas?ok=1");
    }
  );

  router.post(
    "/administrativo/contas/transferencias",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      const fromAccount = String(req.body.fromAccount || "").trim();
      const toAccount = String(req.body.toAccount || "").trim();
      const amountCents = parseAmountToCents(req.body.transferAmount);

      if (!fromAccount || !toAccount || fromAccount === toAccount || amountCents <= 0) {
        return res.redirect("/administrativo/contas");
      }

      await prisma.financialTransfer.create({
        data: {
          ownerId: req.session?.userId || null,
          fromAccount,
          toAccount,
          amountCents,
          transferDate: parseDateInput(req.body.transferDate),
          note: req.body.transferNote || null,
        },
      });

      res.redirect("/administrativo/contas?ok=1");
    }
  );

  router.post(
    "/administrativo/contas/transferencias/:id/update",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      const id = Number(req.params.id);
      const transfer = await findTransfer(req, id);
      if (!transfer) return res.status(404).send("Transferência não encontrada.");

      const fromAccount = String(req.body.fromAccount || "").trim();
      const toAccount = String(req.body.toAccount || "").trim();
      const amountCents = parseAmountToCents(req.body.transferAmount);
      if (!fromAccount || !toAccount || fromAccount === toAccount || amountCents <= 0) {
        return res.redirect("/administrativo/contas");
      }

      await prisma.financialTransfer.update({
        where: { id },
        data: {
          fromAccount,
          toAccount,
          amountCents,
          transferDate: parseDateInput(req.body.transferDate),
          note: req.body.transferNote || null,
          historyJson: transferHistory(transfer, "UPDATE"),
        },
      });

      res.redirect("/administrativo/contas?ok=1");
    }
  );

  router.post(
    "/administrativo/contas/transferencias/:id/delete",
    requireAuth,
    requirePermission("admin.administrative"),
    async (req, res) => {
      const id = Number(req.params.id);
      const transfer = await findTransfer(req, id);
      if (!transfer) return res.status(404).send("Transferência não encontrada.");

      await prisma.financialTransfer.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          historyJson: transferHistory(transfer, "DELETE"),
        },
      });

      res.redirect("/administrativo/contas?ok=1");
    }
  );

  return router;
};
