const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");

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

function mergeOptions(defaults, rows) {
  return Array.from(
    new Set([...defaults, ...rows.map((row) => row.name).filter(Boolean)])
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
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
  if (!file && !existingReceipt) throw new Error("Anexe uma foto ou comprovante.");

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

  async function loadOptions() {
    const rows = await prisma.quickLaunchOption.findMany({ orderBy: { name: "asc" } });

    return {
      categories: mergeOptions(DEFAULT_CATEGORIES, rows.filter((row) => row.type === "CATEGORY")),
      suppliers: mergeOptions(DEFAULT_SUPPLIERS, rows.filter((row) => row.type === "SUPPLIER")),
      paymentMethods: mergeOptions(DEFAULT_PAYMENT_METHODS, rows.filter((row) => row.type === "PAYMENT")),
    };
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
    const options = await loadOptions();
    res.status(extra.status || 200).render("quick-launch/index", {
      ...options,
      expense: mapExpenseForForm(extra.expense),
      formAction: extra.expense?.id ? `/despesas/${extra.expense.id}` : "/despesas",
      success: extra.success || false,
      error: extra.error || null,
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
    res.render("quick-launch/options", {
      success: req.query.ok === "1",
      error: null,
      currentPath: "/despesas",
    });
  });

  router.post("/despesas/opcoes", async (req, res) => {
    const optionType = ["SUPPLIER", "PAYMENT"].includes(req.body.type)
      ? req.body.type
      : "CATEGORY";
    const name = String(req.body.name || "").trim();

    if (!name) {
      return res.status(400).render("quick-launch/options", {
        success: false,
        error: "Informe o nome da opção.",
        currentPath: "/despesas",
      });
    }

    await prisma.quickLaunchOption.upsert({
      where: { type_name: { type: optionType, name } },
      update: {},
      create: { type: optionType, name },
    });

    res.redirect("/despesas/opcoes?ok=1");
  });

  router.get("/despesas/:id", async (req, res) => {
    const expense = await prisma.quickLaunchEntry.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (!expense) return res.status(404).send("Despesa não encontrada.");
    await renderExpenseForm(res, req, { expense });
  });

  router.post("/despesas/:id", upload.single("receipt"), async (req, res) => {
    const existing = await prisma.quickLaunchEntry.findUnique({
      where: { id: Number(req.params.id) },
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

  return router;
};
