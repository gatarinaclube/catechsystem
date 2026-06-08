const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const { Prisma } = require("@prisma/client");
const { canViewAllData, userCan } = require("../utils/access");
const { getFileUploadLimit, validateFilesForRole } = require("../utils/planLimits");

const OPTION_TYPES = ["CATEGORY", "SUPPLIER", "PAYMENT"];
const OPTION_LABELS = {
  CATEGORY: "Categoria",
  SUPPLIER: "Fornecedor",
  PAYMENT: "Conta de Pagamento",
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function todayForInput() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

function parseAmountToCents(value) {
  const raw = String(value || "").replace(/[^\d,.-]/g, "").trim();
  if (!raw) return null;

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);

  if (decimalIndex >= 0) {
    const integerPart = raw.slice(0, decimalIndex).replace(/\D/g, "");
    const decimalPart = raw.slice(decimalIndex + 1).replace(/\D/g, "").slice(0, 2);
    const centsText = `${integerPart || "0"}${decimalPart.padEnd(2, "0")}`;
    const cents = Number.parseInt(centsText, 10);
    return Number.isFinite(cents) ? cents : null;
  }

  const cents = Number.parseInt(raw.replace(/\D/g, ""), 10) * 100;
  return Number.isFinite(cents) ? cents : null;
}

function formatAmount(cents) {
  if (cents === null || cents === undefined) return "";
  return (Number(cents) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseDateInput(value) {
  const dateText = String(value || todayForInput()).slice(0, 10);
  const [year, month, day] = dateText.split("-").map(Number);
  return year && month && day ? new Date(Date.UTC(year, month - 1, day)) : new Date();
}

function addMonthsInput(dateText, monthsToAdd) {
  const base = parseDateInput(dateText);
  const date = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthsToAdd, base.getUTCDate()));
  return date.toISOString().slice(0, 10);
}

function formatDateInput(date) {
  if (!date) return todayForInput();
  return new Date(date).toISOString().slice(0, 10);
}

function formatDateOnlyLabel(date) {
  if (!date) return "-";
  const value = new Date(date);
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const year = value.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function safeJsonParse(value) {
  try {
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function splitAmountCents(totalCents, installments) {
  const count = Math.max(1, Number.parseInt(installments || "1", 10) || 1);
  const base = Math.floor(Number(totalCents || 0) / count);
  const remainder = Number(totalCents || 0) - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
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

function createUpload() {
  const uploadsRoot =
    process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");
  const uploadDir = path.join(uploadsRoot, "quick-launch");
  ensureDir(uploadDir);

  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase();
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `despesa-${unique}${ext}`);
      },
    }),
    limits: { fileSize: getFileUploadLimit("ADMIN").bytes },
    fileFilter: (req, file, cb) => {
      const allowed = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
      ];
      cb(allowed.includes(file.mimetype) ? null : new Error("Envie uma foto, imagem ou PDF como comprovante."), allowed.includes(file.mimetype));
    },
  });
}

function buildExpenseParcels(body, amountCents, installments, competenceDateText) {
  const count = Math.max(1, Number.parseInt(installments || "1", 10) || 1);
  const defaults = splitAmountCents(amountCents, count);

  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return {
      number,
      amountCents: parseAmountToCents(body[`parcel${number}Amount`]) || defaults[index] || 0,
      date: String(body[`parcel${number}Date`] || addMonthsInput(competenceDateText, index)).slice(0, 10),
    };
  });
}

function buildExpenseFormData(body, file, existingReceipt = null, creditCardNames = new Set()) {
  const amountCents = parseAmountToCents(body.amount);
  const category = String(body.category || "").trim();
  const paymentMethod = String(body.paymentMethod || "").trim();
  const supplier = String(body.supplier || "").trim();
  const isCreditCard = creditCardNames.has(paymentMethod);
  const paymentMode = isCreditCard
    ? String(body.paymentMode || "").trim()
    : null;
  const installments =
    paymentMode === "Parcelado"
      ? Math.min(12, Math.max(1, Number.parseInt(body.installments || "1", 10)))
      : null;
  const competenceDateText = String(body.competenceDate || todayForInput()).slice(0, 10);
  const parcelDataJson = isCreditCard
    ? JSON.stringify(buildExpenseParcels(body, amountCents, installments || 1, competenceDateText))
    : null;

  if (!amountCents || amountCents <= 0) throw new Error("Informe um valor válido.");
  if (!category || !paymentMethod || !supplier) {
    throw new Error("Preencha categoria, conta de pagamento e fornecedor.");
  }
  if (isCreditCard && !paymentMode) {
    throw new Error("Informe se o crédito é à vista ou parcelado.");
  }
  return {
    amountCents,
    category,
    paymentMethod,
    paymentMode,
    installments,
    parcelDataJson,
    supplier,
    receiptPath: file ? `/uploads/quick-launch/${file.filename}` : existingReceipt,
    note: body.note || null,
    competenceDate: parseDateInput(body.competenceDate),
  };
}

module.exports = (prisma) => {
  const router = express.Router();
  const upload = createUpload();
  const columnCache = new Map();

  router.use((req, res, next) => {
    if (req.path.startsWith("/despesas/u/")) return next();
    if (!req.session?.userId) return res.redirect("/login");
    if (req.path.startsWith("/administrativo/opcoes-financeiras") && userCan(req.session.userRole, "admin.administrative")) {
      return next();
    }
    if (!userCan(req.session.userRole, "admin.quickLaunch")) {
      return res.status(403).send("Seu perfil não possui acesso a este módulo.");
    }
    next();
  });

  function ownerScope(req) {
    if (canViewAllData(req.session?.userRole)) return {};
    return { ownerId: currentOwnerId(req) };
  }

  function currentOwnerId(req) {
    return req.session?.userId || req.publicExpenseUser?.id || null;
  }

  function optionOwnerId(req) {
    return currentOwnerId(req);
  }

  async function hasColumn(tableName, columnName) {
    const cacheKey = `${tableName}.${columnName}`;
    if (columnCache.has(cacheKey)) return columnCache.get(cacheKey);

    const rows = await prisma.$queryRaw`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
      LIMIT 1
    `;
    const exists = rows.length > 0;
    columnCache.set(cacheKey, exists);
    return exists;
  }

  function normalizeOptionType(value) {
    return OPTION_TYPES.includes(value) ? value : "CATEGORY";
  }

  function optionNames(rows) {
    const names = new Map();
    rows.forEach((row) => {
      const name = String(row.name || "").trim();
      const key = name.toLocaleLowerCase("pt-BR");
      if (name && !names.has(key)) names.set(key, name);
    });
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function optionFieldForType(type) {
    return {
      CATEGORY: "category",
      SUPPLIER: "supplier",
      PAYMENT: "paymentMethod",
    }[type] || "category";
  }

  async function rawOptionOwnerWhere(req, tableName) {
    if (!(await hasColumn(tableName, "ownerId"))) return Prisma.empty;
    const ownerId = optionOwnerId(req);
    return ownerId
      ? Prisma.sql`AND ("ownerId" = ${ownerId} OR "ownerId" IS NULL)`
      : Prisma.sql`AND "ownerId" IS NULL`;
  }

  async function rawEntryOwnerWhere(req) {
    if (!(await hasColumn("QuickLaunchEntry", "ownerId"))) return Prisma.empty;
    const ownerId = optionOwnerId(req);
    return ownerId
      ? Prisma.sql`AND "ownerId" = ${ownerId}`
      : Prisma.sql`AND "ownerId" IS NULL`;
  }

  async function rawListOptions(req, type = null) {
    const ownerWhere = await rawOptionOwnerWhere(req, "QuickLaunchOption");
    const typeWhere = type ? Prisma.sql`AND "type" = ${type}` : Prisma.empty;
    const hasOptionOwner = await hasColumn("QuickLaunchOption", "ownerId");

    if (hasOptionOwner) {
      return prisma.$queryRaw`
        SELECT "id", "type", "name", "ownerId"
        FROM "QuickLaunchOption"
        WHERE 1 = 1 ${ownerWhere} ${typeWhere}
        ORDER BY "name" ASC
      `;
    }

    return prisma.$queryRaw`
      SELECT "id", "type", "name", NULL::integer AS "ownerId"
      FROM "QuickLaunchOption"
      WHERE 1 = 1 ${typeWhere}
      ORDER BY "name" ASC
    `;
  }

  async function rawFindOptionByName(req, type, name, excludeId = null) {
    const ownerWhere = await rawOptionOwnerWhere(req, "QuickLaunchOption");
    const excludeWhere = excludeId ? Prisma.sql`AND "id" <> ${excludeId}` : Prisma.empty;
    const rows = await prisma.$queryRaw`
      SELECT "id", "type", "name"
      FROM "QuickLaunchOption"
      WHERE "type" = ${type}
        AND "name" = ${name}
        ${ownerWhere}
        ${excludeWhere}
      LIMIT 1
    `;
    return rows[0] || null;
  }

  async function rawFindOptionById(req, id) {
    const ownerWhere = await rawOptionOwnerWhere(req, "QuickLaunchOption");
    const rows = await prisma.$queryRaw`
      SELECT "id", "type", "name"
      FROM "QuickLaunchOption"
      WHERE "id" = ${id}
        ${ownerWhere}
      LIMIT 1
    `;
    return rows[0] || null;
  }

  async function getOptionUsage(req, option) {
    const entryOwnerWhere = await rawEntryOwnerWhere(req);
    const field = Prisma.raw(`"${optionFieldForType(option.type)}"`);
    const rows = await prisma.$queryRaw`
      SELECT COUNT(*)::integer AS "count"
      FROM "QuickLaunchEntry"
      WHERE ${field} = ${option.name}
        ${entryOwnerWhere}
    `;
    return Number(rows[0]?.count || 0);
  }

  async function loadOptions(req) {
    const rows = await rawListOptions(req);
    let registeredSuppliers = [];
    let supplierDefaults = [];
    let creditCardNames = new Set();

    try {
      const supplierRows = await prisma.expenseSupplier.findMany({
        where: canViewAllData(req.session?.userRole)
          ? {}
          : { ownerId: currentOwnerId(req) },
        select: { commercialName: true, tradeName: true, cnpj: true, defaultCategory: true },
        orderBy: { commercialName: "asc" },
      });
      registeredSuppliers = supplierRows.map((supplier) => supplier.commercialName);
      supplierDefaults = supplierRows.map((supplier) => ({
        name: supplier.commercialName,
        label: [supplier.tradeName, supplier.cnpj ? `CNPJ ${supplier.cnpj}` : ""].filter(Boolean).join(" · "),
        defaultCategory: supplier.defaultCategory || "",
      }));
    } catch {
      registeredSuppliers = [];
    }

    try {
      const accountRows = await prisma.financialAccountSetting.findMany({
        where: canViewAllData(req.session?.userRole)
          ? {}
          : { ownerId: currentOwnerId(req) },
        select: { accountName: true, isCreditCard: true },
      });
      creditCardNames = new Set(accountRows.filter((row) => row.isCreditCard).map((row) => row.accountName));
    } catch {
      creditCardNames = new Set();
    }

    const paymentMethods = optionNames(rows.filter((row) => row.type === "PAYMENT"));

    return {
      categories: optionNames(rows.filter((row) => row.type === "CATEGORY")),
      suppliers: optionNames([
        ...rows.filter((row) => row.type === "SUPPLIER"),
        ...registeredSuppliers.map((name) => ({ name })),
      ]),
      supplierChoices: optionNames([
        ...rows.filter((row) => row.type === "SUPPLIER"),
        ...registeredSuppliers.map((name) => ({ name })),
      ]).map((name) => {
        const registered = supplierDefaults.find((supplier) => supplier.name === name);
        return {
          name,
          label: registered?.label || "",
          defaultCategory: registered?.defaultCategory || "",
        };
      }),
      supplierDefaults,
      paymentMethods,
      paymentMethodChoices: paymentMethods.map((name) => ({
        name,
        isCreditCard: creditCardNames.has(name),
      })),
    };
  }

  async function loadExpenseCreditCardNames(req, fallbackOwnerId = null) {
    const ownerId = currentOwnerId(req) || fallbackOwnerId;
    const rows = await prisma.financialAccountSetting.findMany({
      where: canViewAllData(req.session?.userRole)
        ? { isCreditCard: true }
        : { ownerId: ownerId || null, isCreditCard: true },
      select: { accountName: true },
    });
    return new Set(rows.map((row) => row.accountName).filter(Boolean));
  }

  async function loadManagedOptions(req, selectedType) {
    const options = await rawListOptions(req, selectedType);
    const uniqueOptions = new Map();
    const currentOwner = currentOwnerId(req);

    for (const option of options) {
      const key = String(option.name || "").trim().toLocaleLowerCase("pt-BR");
      const previous = uniqueOptions.get(key);
      if (!key || (previous && previous.ownerId === currentOwner)) continue;
      if (!previous || option.ownerId === currentOwner) {
        uniqueOptions.set(key, option);
      }
    }

    const optionsWithUsage = [];
    for (const option of uniqueOptions.values()) {
      optionsWithUsage.push({
        ...option,
        typeLabel: OPTION_LABELS[option.type] || option.type,
        usageCount: await getOptionUsage(req, option),
      });
    }

    return optionsWithUsage;
  }

  async function renderOptionsPage(req, res, extra = {}) {
    const selectedType = normalizeOptionType(req.query.type || req.body?.type);
    const options = await loadManagedOptions(req, selectedType);
    const isAdministrativePath = req.path.startsWith("/administrativo/");
    const basePath = isAdministrativePath ? "/administrativo/opcoes-financeiras" : "/despesas/opcoes";

    const data = {
      success: extra.success ?? req.query.ok === "1",
      error: extra.error || null,
      options,
      selectedType,
      typeLabel: OPTION_LABELS[selectedType],
      typeOptions: OPTION_TYPES.map((value) => ({
        value,
        label: OPTION_LABELS[value],
      })),
      basePath,
      backPath: isAdministrativePath ? "/administrativo" : "/despesas",
      currentPath: isAdministrativePath ? "/administrativo" : "/despesas",
    };

    return new Promise((resolve, reject) => {
      res.render("quick-launch/options", data, (err, html) => {
        if (err) return reject(err);
        res.status(extra.status || 200).send(html);
        resolve();
      });
    });
  }

  function replaceParcelPaymentAccount(parcelDataJson, oldName, newName) {
    const parcels = (() => {
      try {
        return parcelDataJson ? JSON.parse(parcelDataJson) : [];
      } catch {
        return [];
      }
    })();
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

  async function propagateOptionRename(tx, type, oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;

    if (type === "CATEGORY") {
      await tx.quickLaunchEntry.updateMany({
        where: { category: oldName },
        data: { category: newName },
      });
      await tx.accountPayable.updateMany({
        where: { category: oldName },
        data: { category: newName },
      });
      await tx.expenseSupplier.updateMany({
        where: { defaultCategory: oldName },
        data: { defaultCategory: newName },
      });
    }

    if (type === "SUPPLIER") {
      await tx.quickLaunchEntry.updateMany({
        where: { supplier: oldName },
        data: { supplier: newName },
      });
      await tx.accountPayable.updateMany({
        where: { supplier: oldName },
        data: { supplier: newName },
      });
      await tx.expenseSupplier.updateMany({
        where: { commercialName: oldName },
        data: { commercialName: newName },
      });
    }

    if (type === "PAYMENT") {
      await tx.quickLaunchEntry.updateMany({
        where: { paymentMethod: oldName },
        data: { paymentMethod: newName },
      });
      await tx.revenueEntry.updateMany({
        where: { paymentAccount: oldName },
        data: { paymentAccount: newName },
      });
      await tx.financialAccountSetting.updateMany({
        where: { accountName: oldName },
        data: { accountName: newName },
      });
      await tx.financialTransfer.updateMany({
        where: { fromAccount: oldName },
        data: { fromAccount: newName },
      });
      await tx.financialTransfer.updateMany({
        where: { toAccount: oldName },
        data: { toAccount: newName },
      });
      await tx.accountPayable.updateMany({
        where: { paymentMethod: oldName },
        data: { paymentMethod: newName },
      });

      const revenueParcels = await tx.revenueEntry.findMany({
        where: { parcelDataJson: { not: null } },
        select: { id: true, parcelDataJson: true },
      });
      for (const revenue of revenueParcels) {
        const nextParcelData = replaceParcelPaymentAccount(revenue.parcelDataJson, oldName, newName);
        if (nextParcelData) {
          await tx.revenueEntry.update({
            where: { id: revenue.id },
            data: { parcelDataJson: nextParcelData },
          });
        }
      }
    }
  }

  function mapExpenseForForm(expense = null) {
    if (!expense) {
      return {
        amount: "",
        category: "",
        paymentMethod: "",
        paymentMode: "",
        installments: "1",
        parcels: [],
        supplier: "",
        receiptPath: "",
        note: "",
        competenceDate: todayForInput(),
      };
    }

    return {
      ...expense,
      amount: formatAmount(expense.amountCents),
      competenceDate: formatDateInput(expense.competenceDate),
      installments: expense.installments || "1",
      parcels: safeJsonParse(expense.parcelDataJson).map((parcel) => ({
        ...parcel,
        amount: formatAmount(parcel.amountCents),
      })),
    };
  }

  async function renderExpenseForm(res, req, extra = {}) {
    const options = await loadOptions(req);
    res.status(extra.status || 200).render("quick-launch/index", {
      ...options,
      expense: mapExpenseForForm(extra.expense),
      formAction: extra.formAction || (extra.expense?.id ? `/despesas/${extra.expense.id}` : "/despesas"),
      success: extra.success || false,
      error: extra.error || null,
      homePath: req.session?.userId ? "/dashboard" : "/login",
      canManageSuppliers: req.session?.userId && userCan(req.session.userRole, "admin.administrative"),
      isPublicExpenseLink: Boolean(req.publicExpenseUser),
      publicExpenseToken: req.params?.token || "",
      currentPath: "/despesas",
    });
  }

  async function renderExpenseList(req, res) {
    const { month, start, end } = monthRange(req.query.month);
    const { page, pageSize, skip } = paginationData(req.query);
    const where = {
      ...ownerScope(req),
      competenceDate: {
        gte: start,
        lt: end,
      },
    };
    const totalCount = await prisma.quickLaunchEntry.count({ where });
    const expenses = await prisma.quickLaunchEntry.findMany({
      where,
      orderBy: [{ competenceDate: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
    });

    res.render("quick-launch/list", {
      user: req.user,
      expenses: expenses.map((expense) => ({
        ...expense,
        amountLabel: formatAmount(expense.amountCents),
        dateLabel: formatDateOnlyLabel(expense.competenceDate),
      })),
      month,
      page,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
      hasPreviousPage: page > 1,
      hasNextPage: page * pageSize < totalCount,
      success: req.query.ok === "1",
      currentPath: "/despesas",
    });
  }

  async function findPublicExpenseUser(token) {
    const cleanToken = String(token || "").trim();
    if (!/^[a-f0-9]{48}$/i.test(cleanToken)) return null;

    return prisma.user.findFirst({
      where: {
        expensePublicToken: cleanToken,
        approvalStatus: { not: "RESTRICOES" },
      },
      select: { id: true, role: true },
    });
  }

  async function renderPublicExpenseForm(req, res, user, extra = {}) {
    req.publicExpenseUser = user;
    await renderExpenseForm(res, req, {
      ...extra,
      formAction: `/despesas/u/${req.params.token}`,
    });
  }

  router.get("/lancamento", (req, res) => res.redirect("/despesas"));
  router.get("/lancamento/opcoes", (req, res) => res.redirect("/despesas/opcoes"));

  router.get("/despesas/u/:token/manifest.webmanifest", async (req, res) => {
    const user = await findPublicExpenseUser(req.params.token);
    if (!user) return res.status(404).send("Link de lançamento não encontrado.");

    res.type("application/manifest+json").send({
      name: "Lançar Despesas - CaTech",
      short_name: "Despesas",
      description: "Lançamento rápido de despesas do gatil.",
      start_url: `/despesas/u/${req.params.token}`,
      scope: `/despesas/u/${req.params.token}`,
      display: "standalone",
      background_color: "#fafafa",
      theme_color: "#f39c12",
      icons: [
        {
          src: "/logos/catech-icon.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any maskable",
        },
        {
          src: "/logos/catech-icon.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable",
        },
      ],
    });
  });

  router.get("/despesas/u/:token", async (req, res) => {
    const user = await findPublicExpenseUser(req.params.token);
    if (!user) return res.status(404).send("Link de lançamento não encontrado.");

    await renderPublicExpenseForm(req, res, user, { success: req.query.ok === "1" });
  });

  router.post("/despesas/u/:token", upload.single("receipt"), async (req, res) => {
    const user = await findPublicExpenseUser(req.params.token);
    if (!user) return res.status(404).send("Link de lançamento não encontrado.");
    req.publicExpenseUser = user;

    try {
      validateFilesForRole(req.file ? [req.file] : [], user.role);
      const data = buildExpenseFormData(
        req.body,
        req.file,
        null,
        await loadExpenseCreditCardNames(req, user.id)
      );
      await prisma.quickLaunchEntry.create({
        data: {
          ownerId: user.id,
          ...data,
        },
      });
      res.redirect(`/despesas/u/${req.params.token}?ok=1`);
    } catch (err) {
      await renderPublicExpenseForm(req, res, user, {
        status: 400,
        error: err.message || "Erro ao salvar despesa.",
        expense: { ...req.body, amountCents: parseAmountToCents(req.body.amount) },
      });
    }
  });

  router.get("/despesas/novo", async (req, res) => {
    await renderExpenseForm(res, req, { success: req.query.ok === "1" });
  });

  router.get("/despesas", async (req, res) => {
    await renderExpenseList(req, res);
  });

  router.post("/despesas", upload.single("receipt"), async (req, res) => {
    try {
      validateFilesForRole(req.file ? [req.file] : [], req.session?.userRole);
      const data = buildExpenseFormData(
        req.body,
        req.file,
        null,
        await loadExpenseCreditCardNames(req)
      );
      await prisma.quickLaunchEntry.create({
        data: {
          ownerId: req.session?.userId || null,
          ...data,
        },
      });
      res.redirect("/despesas?ok=1");
    } catch (err) {
      await renderExpenseForm(res, req, {
        status: 400,
        error: err.message || "Erro ao salvar despesa.",
        expense: { ...req.body, amountCents: parseAmountToCents(req.body.amount) },
      });
    }
  });

  router.get("/despesas/lista", async (req, res) => {
    const query = new URLSearchParams(req.query).toString();
    res.redirect(`/despesas${query ? `?${query}` : ""}`);
  });

  router.get("/despesas/opcoes", async (req, res) => {
    res.redirect(`/administrativo/opcoes-financeiras${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`);
  });

  router.get("/administrativo/opcoes-financeiras", async (req, res) => {
    try {
      await renderOptionsPage(req, res);
    } catch (err) {
      console.error("Erro ao carregar opções de despesas:", err);
      res.status(500).send("Erro ao carregar opções de despesas.");
    }
  });

  router.post("/despesas/opcoes", async (req, res) => {
    res.redirect(307, "/administrativo/opcoes-financeiras");
  });

  router.post("/administrativo/opcoes-financeiras", async (req, res) => {
    const optionType = normalizeOptionType(req.body.type);
    const name = String(req.body.name || "").trim();

    if (!name) {
      return renderOptionsPage(req, res, {
        status: 400,
        error: "Informe o nome da opção.",
      });
    }

    const ownerId = req.session?.userId || null;
    const existing = await rawFindOptionByName(req, optionType, name);

    if (existing) {
      return renderOptionsPage(req, res, {
        status: 400,
        error: "Esta opção já existe para o tipo selecionado.",
      });
    }

    if (await hasColumn("QuickLaunchOption", "ownerId")) {
      await prisma.$executeRaw`
        INSERT INTO "QuickLaunchOption" ("type", "ownerId", "name")
        VALUES (${optionType}, ${ownerId}, ${name})
      `;
    } else {
      await prisma.$executeRaw`
        INSERT INTO "QuickLaunchOption" ("type", "name")
        VALUES (${optionType}, ${name})
      `;
    }

    res.redirect(`/administrativo/opcoes-financeiras?type=${optionType}&ok=1`);
  });

  router.post("/despesas/opcoes/:id/update", async (req, res) => {
    res.redirect(307, `/administrativo/opcoes-financeiras/${req.params.id}/update`);
  });

  router.post("/administrativo/opcoes-financeiras/:id/update", async (req, res) => {
    const id = Number(req.params.id);
    const option = await rawFindOptionById(req, id);
    const name = String(req.body.name || "").trim();

    if (!option || !OPTION_TYPES.includes(option.type)) {
      return res.status(404).send("Opção não encontrada.");
    }

    if (name) {
      const duplicate = await rawFindOptionByName(req, option.type, name, id);

      if (duplicate) {
        return renderOptionsPage(req, res, {
          status: 400,
          error: "Já existe uma opção com este nome.",
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE "QuickLaunchOption"
          SET "name" = ${name}
          WHERE "id" = ${id}
        `;
        await propagateOptionRename(tx, option.type, option.name, name);
      });
    }

    res.redirect(`/administrativo/opcoes-financeiras?type=${option.type}&ok=1`);
  });

  router.post("/despesas/opcoes/:id/delete", async (req, res) => {
    res.redirect(307, `/administrativo/opcoes-financeiras/${req.params.id}/delete`);
  });

  router.post("/administrativo/opcoes-financeiras/:id/delete", async (req, res) => {
    const id = Number(req.params.id);
    const option = await rawFindOptionById(req, id);

    if (!option || !OPTION_TYPES.includes(option.type)) {
      return res.status(404).send("Opção não encontrada.");
    }

    const usageCount = await getOptionUsage(req, option);
    if (usageCount > 0) {
      return renderOptionsPage(req, res, {
        status: 400,
        error: "Esta opção já está sendo usada em despesas cadastradas e não pode ser excluída.",
      });
    }

    await prisma.$executeRaw`
      DELETE FROM "QuickLaunchOption"
      WHERE "id" = ${id}
    `;
    res.redirect(`/administrativo/opcoes-financeiras?type=${option.type}&ok=1`);
  });

  router.get("/despesas/:id", async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return next();

    const expense = await prisma.quickLaunchEntry.findFirst({
      where: { id, ...ownerScope(req) },
    });
    if (!expense) return res.status(404).send("Despesa não encontrada.");
    await renderExpenseForm(res, req, { expense });
  });

  router.post("/despesas/:id", upload.single("receipt"), async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return next();

    const existing = await prisma.quickLaunchEntry.findFirst({
      where: { id, ...ownerScope(req) },
    });
    if (!existing) return res.status(404).send("Despesa não encontrada.");

    try {
      validateFilesForRole(req.file ? [req.file] : [], req.session?.userRole);
      const data = buildExpenseFormData(
        req.body,
        req.file,
        existing.receiptPath,
        await loadExpenseCreditCardNames(req)
      );
      await prisma.quickLaunchEntry.update({
        where: { id: existing.id },
        data,
      });
      res.redirect("/despesas");
    } catch (err) {
      await renderExpenseForm(res, req, {
        status: 400,
        error: err.message || "Erro ao atualizar despesa.",
        expense: { ...existing, ...req.body },
      });
    }
  });

  router.post("/despesas/:id/delete", async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return next();

    const existing = await prisma.quickLaunchEntry.findFirst({
      where: { id, ...ownerScope(req) },
      select: { id: true },
    });

    if (!existing) return res.status(404).send("Despesa não encontrada.");

    await prisma.quickLaunchEntry.delete({ where: { id } });
    res.redirect("/despesas/lista");
  });

  return router;
};
