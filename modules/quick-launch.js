const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const { Prisma } = require("@prisma/client");
const { canViewAllData } = require("../utils/access");

const OPTION_TYPES = ["CATEGORY", "SUPPLIER", "PAYMENT"];
const OPTION_LABELS = {
  CATEGORY: "Categoria",
  SUPPLIER: "Fornecedor",
  PAYMENT: "Forma de Pagamento",
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
  const normalized = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : null;
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
    limits: { fileSize: 10 * 1024 * 1024 },
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

function buildExpenseFormData(body, file, existingReceipt = null) {
  const amountCents = parseAmountToCents(body.amount);
  const category = String(body.category || "").trim();
  const paymentMethod = String(body.paymentMethod || "").trim();
  const supplier = String(body.supplier || "").trim();
  const paymentMode = paymentMethod.toLowerCase().includes("crédito")
    ? String(body.paymentMode || "").trim()
    : null;
  const installments =
    paymentMode === "Parcelado"
      ? Math.min(12, Math.max(1, Number.parseInt(body.installments || "1", 10)))
      : null;

  if (!amountCents || amountCents <= 0) throw new Error("Informe um valor válido.");
  if (!category || !paymentMethod || !supplier) {
    throw new Error("Preencha categoria, forma de pagamento e fornecedor.");
  }
  if (paymentMethod.toLowerCase().includes("crédito") && !paymentMode) {
    throw new Error("Informe se o crédito é à vista ou parcelado.");
  }
  return {
    amountCents,
    category,
    paymentMethod,
    paymentMode,
    installments,
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

  function ownerScope(req) {
    if (canViewAllData(req.session?.userRole)) return {};
    return { ownerId: req.session?.userId || null };
  }

  function optionOwnerId(req) {
    return null;
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
    return Array.from(
      new Set(rows.map((row) => row.name).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
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
      ? Prisma.sql`AND "ownerId" = ${ownerId}`
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

    return {
      categories: optionNames(rows.filter((row) => row.type === "CATEGORY")),
      suppliers: optionNames(rows.filter((row) => row.type === "SUPPLIER")),
      paymentMethods: optionNames(rows.filter((row) => row.type === "PAYMENT")),
    };
  }

  async function loadManagedOptions(req, selectedType) {
    const options = await rawListOptions(req, selectedType);
    const optionsWithUsage = [];

    for (const option of options) {
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
      currentPath: "/despesas",
    };

    return new Promise((resolve, reject) => {
      res.render("quick-launch/options", data, (err, html) => {
        if (err) return reject(err);
        res.status(extra.status || 200).send(html);
        resolve();
      });
    });
  }

  function mapExpenseForForm(expense = null) {
    if (!expense) {
      return {
        amount: "",
        category: "",
        paymentMethod: "",
        paymentMode: "",
        installments: "1",
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
    };
  }

  async function renderExpenseForm(res, req, extra = {}) {
    const options = await loadOptions(req);
    res.status(extra.status || 200).render("quick-launch/index", {
      ...options,
      expense: mapExpenseForForm(extra.expense),
      formAction: extra.expense?.id ? `/despesas/${extra.expense.id}` : "/despesas",
      success: extra.success || false,
      error: extra.error || null,
      homePath: req.session?.userId ? "/dashboard" : "/login",
      currentPath: "/despesas",
    });
  }

  router.get("/lancamento", (req, res) => res.redirect("/despesas"));
  router.get("/lancamento/opcoes", (req, res) => res.redirect("/despesas/opcoes"));

  router.get("/despesas", async (req, res) => {
    await renderExpenseForm(res, req, { success: req.query.ok === "1" });
  });

  router.post("/despesas", upload.single("receipt"), async (req, res) => {
    try {
      const data = buildExpenseFormData(req.body, req.file);
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
    const expenses = await prisma.quickLaunchEntry.findMany({
      where: ownerScope(req),
      orderBy: [{ competenceDate: "desc" }, { createdAt: "desc" }],
      take: 200,
    });

    res.render("quick-launch/list", {
      expenses: expenses.map((expense) => ({
        ...expense,
        amountLabel: formatAmount(expense.amountCents),
        dateLabel: formatDateOnlyLabel(expense.competenceDate),
      })),
      currentPath: "/despesas",
    });
  });

  router.get("/despesas/opcoes", async (req, res) => {
    try {
      await renderOptionsPage(req, res);
    } catch (err) {
      console.error("Erro ao carregar opções de despesas:", err);
      res.status(500).send("Erro ao carregar opções de despesas.");
    }
  });

  router.post("/despesas/opcoes", async (req, res) => {
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

    res.redirect(`/despesas/opcoes?type=${optionType}&ok=1`);
  });

  router.post("/despesas/opcoes/:id/update", async (req, res) => {
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

      const entryOwnerWhere = await rawEntryOwnerWhere(req);
      const field = Prisma.raw(`"${optionFieldForType(option.type)}"`);

      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE "QuickLaunchOption"
          SET "name" = ${name}
          WHERE "id" = ${id}
        `;

        await tx.$executeRaw`
          UPDATE "QuickLaunchEntry"
          SET ${field} = ${name}
          WHERE ${field} = ${option.name}
            ${entryOwnerWhere}
        `;
      });
    }

    res.redirect(`/despesas/opcoes?type=${option.type}&ok=1`);
  });

  router.post("/despesas/opcoes/:id/delete", async (req, res) => {
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
    res.redirect(`/despesas/opcoes?type=${option.type}&ok=1`);
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
      const data = buildExpenseFormData(req.body, req.file, existing.receiptPath);
      await prisma.quickLaunchEntry.update({
        where: { id: existing.id },
        data,
      });
      res.redirect("/despesas/lista");
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
