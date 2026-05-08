const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const { canViewAllData } = require("../utils/access");

const DEFAULT_CATEGORIES = [
  "Alimentação",
  "Combustível",
  "Hotelaria",
  "Veterinário",
  "Exposição/Competição",
  "Publicidade",
  "Equipamentos",
  "Manutenção",
  "Reparo/Conserto em Geral",
  "Reparo/Conserto em Estrutura Física",
  "Construção",
  "Veículo",
  "Material de Expediente",
  "Insumos em Geral",
  "Transporte",
  "Taxas",
  "Impostos",
  "Contabilidade",
  "Serviços",
  "Aquisição de Padreadores/Matrizes",
  "Outros",
];

const DEFAULT_SUPPLIERS = [
  "Cobasi",
  "Petlove",
  "Farmácia Reino Animal",
  "Clínica Unidade Animal",
];

const DEFAULT_PAYMENT_METHODS = [
  "PIX - SICOOB Conta",
  "Crédito - SICOOB",
  "Dinheiro",
];

const OPTION_TYPES = ["CATEGORY", "SUPPLIER", "PAYMENT"];
const OPTION_LABELS = {
  CATEGORY: "Categoria",
  SUPPLIER: "Fornecedor",
  PAYMENT: "Forma de Pagamento",
};
const DEFAULT_OPTION_SETS = {
  CATEGORY: DEFAULT_CATEGORIES,
  SUPPLIER: DEFAULT_SUPPLIERS,
  PAYMENT: DEFAULT_PAYMENT_METHODS,
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

  function ownerScope(req) {
    if (canViewAllData(req.session?.userRole)) return {};
    return { ownerId: req.session?.userId || null };
  }

  function optionOwnerId(req) {
    return req.session?.userId || null;
  }

  function normalizeOptionType(value) {
    return OPTION_TYPES.includes(value) ? value : "CATEGORY";
  }

  async function ensureDefaultOptions(req) {
    const ownerId = optionOwnerId(req);

    for (const [type, names] of Object.entries(DEFAULT_OPTION_SETS)) {
      for (const name of names) {
        const sameName = await prisma.quickLaunchOption.findFirst({
          where: { type, ownerId, name },
          select: { id: true },
        });

        if (!sameName) {
          await prisma.quickLaunchOption.create({
            data: { type, ownerId, name },
          });
        }
      }
    }
  }

  function mergeOptionNames(defaults, rows) {
    return Array.from(
      new Set([...defaults, ...rows.map((row) => row.name).filter(Boolean)])
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function selectedOwnerScope(req) {
    return { ownerId: optionOwnerId(req) };
  }

  function optionUsageWhere(req, option) {
    const fieldByType = {
      CATEGORY: "category",
      SUPPLIER: "supplier",
      PAYMENT: "paymentMethod",
    };

    return {
      ...selectedOwnerScope(req),
      [fieldByType[option.type]]: option.name,
    };
  }

  async function getOptionUsage(req, option) {
    return prisma.quickLaunchEntry.count({
      where: optionUsageWhere(req, option),
    });
  }

  function updateExpenseFieldForType(type, name) {
    if (type === "SUPPLIER") return { supplier: name };
    if (type === "PAYMENT") return { paymentMethod: name };
    return { category: name };
  }

  async function loadOptions(req) {
    const rows = await prisma.quickLaunchOption.findMany({
      where: selectedOwnerScope(req),
      select: { id: true, type: true, name: true, ownerId: true },
      orderBy: { name: "asc" },
    });

    return {
      categories: mergeOptionNames(
        DEFAULT_CATEGORIES,
        rows.filter((row) => row.type === "CATEGORY")
      ),
      suppliers: mergeOptionNames(
        DEFAULT_SUPPLIERS,
        rows.filter((row) => row.type === "SUPPLIER")
      ),
      paymentMethods: mergeOptionNames(
        DEFAULT_PAYMENT_METHODS,
        rows.filter((row) => row.type === "PAYMENT")
      ),
    };
  }

  async function loadManagedOptions(req, selectedType) {
    const options = await prisma.quickLaunchOption.findMany({
      where: {
        ...selectedOwnerScope(req),
        type: selectedType,
      },
      select: { id: true, type: true, name: true, ownerId: true },
      orderBy: { name: "asc" },
    });
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
    const selectedType = normalizeOptionType(req.query.type || req.body.type);
    const options = await loadManagedOptions(req, selectedType);

    res.status(extra.status || 200).render("quick-launch/options", {
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
        dateLabel: new Date(expense.competenceDate).toLocaleDateString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        }),
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
    const existing = await prisma.quickLaunchOption.findFirst({
      where: { type: optionType, ownerId, name },
      select: { id: true },
    });

    if (existing) {
      return renderOptionsPage(req, res, {
        status: 400,
        error: "Esta opção já existe para o tipo selecionado.",
      });
    }

    await prisma.quickLaunchOption.create({
      data: { type: optionType, ownerId, name },
    });

    res.redirect(`/despesas/opcoes?type=${optionType}&ok=1`);
  });

  router.post("/despesas/opcoes/:id/update", async (req, res) => {
    const id = Number(req.params.id);
    const option = await prisma.quickLaunchOption.findFirst({
      where: { id, ...selectedOwnerScope(req) },
    });
    const name = String(req.body.name || "").trim();

    if (!option || !OPTION_TYPES.includes(option.type)) {
      return res.status(404).send("Opção não encontrada.");
    }

    if (name) {
      const duplicate = await prisma.quickLaunchOption.findFirst({
        where: {
          ...selectedOwnerScope(req),
          type: option.type,
          name,
          NOT: { id },
        },
        select: { id: true },
      });

      if (duplicate) {
        return renderOptionsPage(req, res, {
          status: 400,
          error: "Já existe uma opção com este nome.",
        });
      }

      await prisma.$transaction([
        prisma.quickLaunchOption.update({ where: { id }, data: { name } }),
        prisma.quickLaunchEntry.updateMany({
          where: optionUsageWhere(req, option),
          data: updateExpenseFieldForType(option.type, name),
        }),
      ]);
    }

    res.redirect(`/despesas/opcoes?type=${option.type}&ok=1`);
  });

  router.post("/despesas/opcoes/:id/delete", async (req, res) => {
    const id = Number(req.params.id);
    const option = await prisma.quickLaunchOption.findFirst({
      where: { id, ...selectedOwnerScope(req) },
    });

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

    await prisma.quickLaunchOption.delete({ where: { id } });
    res.redirect(`/despesas/opcoes?type=${option.type}&ok=1`);
  });

  router.get("/despesas/:id", async (req, res) => {
    const expense = await prisma.quickLaunchEntry.findFirst({
      where: { id: Number(req.params.id), ...ownerScope(req) },
    });
    if (!expense) return res.status(404).send("Despesa não encontrada.");
    await renderExpenseForm(res, req, { expense });
  });

  router.post("/despesas/:id", upload.single("receipt"), async (req, res) => {
    const existing = await prisma.quickLaunchEntry.findFirst({
      where: { id: Number(req.params.id), ...ownerScope(req) },
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

  router.post("/despesas/:id/delete", async (req, res) => {
    const id = Number(req.params.id);
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
