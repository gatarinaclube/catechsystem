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

const PAYMENT_METHODS = [
  "PIX - SICOOB Conta",
  "Crédito - SICOOB",
  "Dinheiro",
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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

function parseDateInput(value) {
  const dateText = String(value || todayForInput()).slice(0, 10);
  const [year, month, day] = dateText.split("-").map(Number);

  if (!year || !month || !day) {
    return new Date();
  }

  return new Date(Date.UTC(year, month - 1, day));
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
        cb(null, `lancamento-${unique}${ext}`);
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

      if (allowed.includes(file.mimetype)) {
        return cb(null, true);
      }

      cb(new Error("Envie uma foto, imagem ou PDF como comprovante."));
    },
  });
}

module.exports = (prisma) => {
  const router = express.Router();
  const upload = createUpload();

  async function loadOptions() {
    const rows = await prisma.quickLaunchOption.findMany({
      orderBy: { name: "asc" },
    });

    return {
      categories: mergeOptions(
        DEFAULT_CATEGORIES,
        rows.filter((row) => row.type === "CATEGORY")
      ),
      suppliers: mergeOptions(
        DEFAULT_SUPPLIERS,
        rows.filter((row) => row.type === "SUPPLIER")
      ),
    };
  }

  router.get("/lancamento", async (req, res) => {
    const options = await loadOptions();

    res.render("quick-launch/index", {
      ...options,
      paymentMethods: PAYMENT_METHODS,
      today: todayForInput(),
      success: req.query.ok === "1",
      error: null,
      currentPath: "/lancamento",
    });
  });

  router.post("/lancamento", upload.single("receipt"), async (req, res) => {
    const options = await loadOptions();

    try {
      const amountCents = parseAmountToCents(req.body.amount);
      const category = String(req.body.category || "").trim();
      const paymentMethod = String(req.body.paymentMethod || "").trim();
      const supplier = String(req.body.supplier || "").trim();

      if (!amountCents || amountCents <= 0) {
        throw new Error("Informe um valor válido.");
      }

      if (!category || !paymentMethod || !supplier) {
        throw new Error("Preencha categoria, forma de pagamento e fornecedor.");
      }

      if (!req.file) {
        throw new Error("Anexe uma foto ou comprovante.");
      }

      await prisma.quickLaunchEntry.create({
        data: {
          ownerId: req.session?.userId || null,
          amountCents,
          category,
          paymentMethod,
          supplier,
          receiptPath: `/uploads/quick-launch/${req.file.filename}`,
          note: req.body.note || null,
          competenceDate: parseDateInput(req.body.competenceDate),
        },
      });

      res.redirect("/lancamento?ok=1");
    } catch (err) {
      res.status(400).render("quick-launch/index", {
        ...options,
        paymentMethods: PAYMENT_METHODS,
        today: req.body.competenceDate || todayForInput(),
        success: false,
        error: err.message || "Erro ao salvar lançamento.",
        currentPath: "/lancamento",
      });
    }
  });

  router.get("/lancamento/opcoes", async (req, res) => {
    res.render("quick-launch/options", {
      success: req.query.ok === "1",
      error: null,
      currentPath: "/lancamento",
    });
  });

  router.post("/lancamento/opcoes", async (req, res) => {
    const optionType =
      req.body.type === "SUPPLIER" ? "SUPPLIER" : "CATEGORY";
    const name = String(req.body.name || "").trim();

    if (!name) {
      return res.status(400).render("quick-launch/options", {
        success: false,
        error: "Informe o nome da opção.",
        currentPath: "/lancamento",
      });
    }

    await prisma.quickLaunchOption.upsert({
      where: {
        type_name: {
          type: optionType,
          name,
        },
      },
      update: {},
      create: {
        type: optionType,
        name,
      },
    });

    res.redirect("/lancamento/opcoes?ok=1");
  });

  return router;
};
