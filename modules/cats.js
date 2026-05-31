// modules/cats.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
  notifyNewCat,
  notifyUserCatConfirmation,
} = require("../utils/adminNotifications");
const {
  getFileUploadLimit,
  validateFilesForRole,
} = require("../utils/planLimits");

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();
  router.use("/cats", requireAuth, requirePermission("cats.manage"));

  // --------- Helper para pegar dados do usuário logado (via sessão) ---------
  function getAuthInfo(req) {
    const userId = req.session?.userId || null;
    const role = req.session?.userRole || "USER";
    const isAdmin = role === "ADMIN";
    return { userId, role, isAdmin };
  }

  // --------- FUNÇÃO DE FORMATAÇÃO DO MICROCHIP ---------
  function formatMicrochip(raw) {
    if (!raw) return "-";
    const digits = raw.replace(/\D/g, "").padEnd(15, "0").slice(0, 15);
    return digits.replace(
      /(\d{3})(\d{3})(\d{3})(\d{3})(\d{3})/,
      "$1.$2.$3.$4.$5"
    );
  }

  function cleanText(value) {
    const text = String(value || "").trim();
    return text || null;
  }

  function normalizeKey(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function splitCsvLine(line) {
    const cells = [];
    let current = "";
    let insideQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"' && next === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if ((char === "," || char === ";") && !insideQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    cells.push(current.trim());
    return cells;
  }

  function parseCsv(text) {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) return [];

    const headers = splitCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
      const cells = splitCsvLine(line);
      return headers.reduce((row, header, index) => {
        row[header] = cells[index] || "";
        return row;
      }, {});
    });
  }

  function parseImportPayload(rawText) {
    const text = String(rawText || "").trim();
    if (!text) return [];

    if (text.startsWith("[") || text.startsWith("{")) {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [parsed];
    }

    return parseCsv(text);
  }

  function pick(row, aliases) {
    const normalizedRow = Object.entries(row || {}).reduce((acc, [key, value]) => {
      acc[normalizeKey(key)] = value;
      return acc;
    }, {});

    for (const alias of aliases) {
      const value = normalizedRow[normalizeKey(alias)];
      if (value !== undefined && String(value).trim() !== "") return String(value).trim();
    }

    return "";
  }

  function parseImportDate(value) {
    const text = cleanText(value);
    if (!text) return null;

    const iso = new Date(text);
    if (!Number.isNaN(iso.getTime())) return iso;

    const match = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (!match) return null;

    const [, day, month, year] = match;
    const fullYear = year.length === 2 ? `20${year}` : year;
    const parsed = new Date(Number(fullYear), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function normalizeGender(value) {
    const text = normalizeKey(value);
    if (["m", "macho", "male"].includes(text)) return "M";
    if (["f", "femea", "feminha", "female"].includes(text)) return "F";
    return null;
  }

  function normalizeBoolean(value) {
    const text = normalizeKey(value);
    return ["sim", "s", "yes", "y", "true", "1", "castrado", "neutered"].includes(text);
  }

  function normalizeImportCat(row, ownerId) {
    const microchipDigits = pick(row, ["microchip", "micro chip", "chip", "transponder"])
      .replace(/\D/g, "")
      .slice(0, 15) || null;

    return {
      ownerId,
      status: "NOVO",
      country: cleanText(pick(row, ["pais", "país", "country"])) || "BR",
      titleBeforeName: cleanText(pick(row, ["titulos antes", "títulos antes", "title before", "prefixo"])),
      titleAfterName: cleanText(pick(row, ["titulos depois", "títulos depois", "title after", "sufixo"])),
      name: cleanText(pick(row, ["nome", "nome do gato", "name", "cat name"])),
      microchip: microchipDigits,
      birthDate: parseImportDate(pick(row, ["nascimento", "data nascimento", "data de nascimento", "birthdate", "birth date", "dob"])),
      gender: normalizeGender(pick(row, ["sexo", "sex", "gender"])),
      neutered: normalizeBoolean(pick(row, ["castrado", "neutered", "altered"])),
      breed: cleanText(pick(row, ["raca", "raça", "breed"])),
      emsCode: cleanText(pick(row, ["ems", "codigo ems", "código ems", "cor", "color"])),
      fifeStatus: cleanText(pick(row, ["membro", "fife status", "status fife"])),
      pedigreeType: cleanText(pick(row, ["tipo registro", "tipo de registro", "pedigree type", "register type"])),
      pedigreeNumber: cleanText(pick(row, ["pedigree", "numero pedigree", "número pedigree", "registro", "registration"])),
      pedigreePending: normalizeBoolean(pick(row, ["registro pendente", "pedigree pendente", "pending"])),
      breederType: "OTHER",
      breederName: cleanText(pick(row, ["criador", "breeder"])),
      ownershipType: cleanText(pick(row, ["propriedade", "ownership"])) || "OWNER",
      fatherName: cleanText(pick(row, ["pai", "nome pai", "father", "sire"])),
      fatherEmsCode: cleanText(pick(row, ["ems pai", "cor pai", "father ems", "sire ems"])),
      fatherBreed: cleanText(pick(row, ["raca pai", "raça pai", "father breed", "sire breed"])),
      motherName: cleanText(pick(row, ["mae", "mãe", "nome mae", "nome mãe", "mother", "dam"])),
      motherEmsCode: cleanText(pick(row, ["ems mae", "ems mãe", "cor mae", "cor mãe", "mother ems", "dam ems"])),
      motherBreed: cleanText(pick(row, ["raca mae", "raça mãe", "mother breed", "dam breed"])),
    };
  }

// --------- CONFIGURAÇÃO DO MULTER ---------

// Produção (Render Disk): UPLOADS_DIR=/var/data  -> salva em /var/data/uploads/cats
// Dev: salva em /public/uploads/cats
// UPLOADS_DIR deve apontar para a pasta RAIZ dos uploads (ex.: /var/data/uploads)
// Em DEV, usamos /public/uploads
const DISK_ROOT =
  process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");

// Pasta final: .../cats
const uploadDir = path.join(DISK_ROOT, "cats");


if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: getFileUploadLimit("ADMIN").bytes },
  fileFilter: (req, file, cb) => {
    cb(null, true);
  },
});



// --------- LISTAGEM DE GATOS ---------
router.get("/cats", requireAuth, async (req, res) => {
  const { userId, role, isAdmin } = getAuthInfo(req);

  // ADMIN vê todos / USER vê só os próprios
  let where = {};
  if (isAdmin) {
    const { ownerId } = req.query;
    if (ownerId) {
      where.ownerId = Number(ownerId);
    }
  } else {
    where.ownerId = userId;
  }

  try {
    // Usuário logado para o sidebar
    const userFromDb = await prisma.user.findUnique({
      where: { id: userId },
    });

    const user = userFromDb ? { ...userFromDb, role } : { id: userId, role };

    // Lista de donos para o filtro (somente ADMIN)
    let owners = [];
    if (isAdmin) {
      owners = await prisma.user.findMany({
        orderBy: { name: "asc" },
      });
    }

    const catsFromDb = await prisma.cat.findMany({
      where,
      orderBy: { id: "desc" },
    });

    const catsEmAnalise = catsFromDb.filter(c => c.status === "NOVO");
const catsAprovados = catsFromDb.filter(c => c.status === "APROVADO");
const catsNaoAprovados = catsFromDb.filter(c => c.status === "NAO_APROVADO");


    const cats = catsFromDb.map((cat) => ({
      ...cat,
      microchipFormatted: cat.microchip
        ? formatMicrochip(cat.microchip)
        : null,
    }));

    const selectedOwnerId = isAdmin ? (req.query.ownerId || "") : "";

    res.render("cats/list", {
  user,
  catsEmAnalise,
  catsAprovados,
  catsNaoAprovados,
  owners,
  selectedOwnerId,
  currentPath: req.path,
});

  } catch (err) {
    console.error("Erro ao listar gatos:", err);
    res.status(500).send("Erro ao listar gatos");
  }
});

// --------- FORMULÁRIO: NOVO GATO ---------
router.get("/cats/new", requireAuth, async (req, res) => {
  const { userId, role, isAdmin } = getAuthInfo(req);

  try {
    const userFromDb = await prisma.user.findUnique({
      where: { id: userId },
    });

    const user = userFromDb ? { ...userFromDb, role } : { id: userId, role };

    // ADMIN vê todos; USER vê só seus gatos (ownerId = userId)
    const maleWhere = isAdmin
      ? { gender: "M" }
      : { gender: "M", ownerId: userId };

    const femaleWhere = isAdmin
      ? { gender: "F" }
      : { gender: "F", ownerId: userId };

    const maleCats = await prisma.cat.findMany({
      where: maleWhere,
      orderBy: { name: "asc" },
    });

    const femaleCats = await prisma.cat.findMany({
      where: femaleWhere,
      orderBy: { name: "asc" },
    });

    res.render("cats/new", {
      cat: null,
      maleCats,
      femaleCats,
      user,
      currentPath: req.path,
      microchipError: null,
    });
  } catch (err) {
    console.error("Erro ao abrir formulário de novo gato:", err);
    res.status(500).send("Erro ao abrir formulário de novo gato");
  }
});

// --------- IMPORTAÇÃO DE OUTRO SISTEMA ---------
router.get("/cats/import", requireAuth, async (req, res) => {
  const { userId, role } = getAuthInfo(req);

  try {
    const userFromDb = await prisma.user.findUnique({
      where: { id: userId },
    });
    const user = userFromDb ? { ...userFromDb, role } : { id: userId, role };

    res.render("cats/import", {
      user,
      currentPath: "/cats/import",
      result: null,
      error: null,
      rawText: "",
    });
  } catch (err) {
    console.error("Erro ao abrir importação de gatos:", err);
    res.status(500).send("Erro ao abrir importação de gatos");
  }
});

router.post("/cats/import", requireAuth, async (req, res) => {
  const { userId, role } = getAuthInfo(req);
  const rawText = req.body.importData || "";
  const userFromDb = await prisma.user.findUnique({ where: { id: userId } });
  const user = userFromDb ? { ...userFromDb, role } : { id: userId, role };

  try {
    const rows = parseImportPayload(rawText);
    const result = {
      total: rows.length,
      created: 0,
      skipped: [],
    };

    if (!rows.length) {
      throw new Error("Cole um CSV ou JSON com pelo menos um gato para importar.");
    }

    for (const [index, row] of rows.entries()) {
      const data = normalizeImportCat(row, userId);

      if (!data.name) {
        result.skipped.push({ row: index + 1, reason: "Sem nome do gato." });
        continue;
      }

      if (data.microchip) {
        const existing = await prisma.cat.findUnique({
          where: { microchip: data.microchip },
          select: { id: true, name: true },
        });

        if (existing) {
          result.skipped.push({
            row: index + 1,
            name: data.name,
            reason: `Microchip já cadastrado em ${existing.name || `gato #${existing.id}`}.`,
          });
          continue;
        }
      }

      await prisma.cat.create({ data });
      result.created += 1;
    }

    res.render("cats/import", {
      user,
      currentPath: "/cats/import",
      result,
      error: null,
      rawText,
    });
  } catch (err) {
    console.error("Erro ao importar gatos:", err);
    res.status(400).render("cats/import", {
      user,
      currentPath: "/cats/import",
      result: null,
      error: err.message || "Não foi possível importar os dados.",
      rawText,
    });
  }
});

// --------- DETALHES DO GATO ---------
router.get("/cats/:id", requireAuth, async (req, res) => {
  const { userId, role, isAdmin } = getAuthInfo(req);
  const id = Number(req.params.id);

  try {
    // Usuário logado
    const userFromDb = await prisma.user.findUnique({
      where: { id: userId },
    });
    const user = userFromDb ? { ...userFromDb, role } : { id: userId, role };

    // Gato base
    const cat = await prisma.cat.findUnique({
      where: { id },
    });

    if (!cat) {
      return res.status(404).send("Gato não encontrado");
    }

    // USER só pode ver se é o dono
    if (!isAdmin && cat.ownerId !== userId) {
      return res.status(403).send("Você não tem acesso a este gato.");
    }

    // Criamos um objeto copiando o gato, para poder completar os campos
    const catForView = { ...cat };

    // ---------- COMPLETAR PAI A PARTIR DO fatherId (se existir) ----------
    if (
      catForView.fatherId &&
      (!catForView.fatherName ||
        !catForView.fatherBreed ||
        !catForView.fatherEmsCode)
    ) {
      const fatherCat = await prisma.cat.findUnique({
        where: { id: catForView.fatherId },
      });

      if (fatherCat) {
        if (!catForView.fatherName) {
          catForView.fatherName = fatherCat.name || null;
        }
        if (!catForView.fatherBreed) {
          catForView.fatherBreed = fatherCat.breed || null;
        }
        if (!catForView.fatherEmsCode) {
          catForView.fatherEmsCode = fatherCat.emsCode || null;
        }
      }
    }

    // ---------- COMPLETAR MÃE A PARTIR DO motherId (se existir) ----------
    if (
      catForView.motherId &&
      (!catForView.motherName ||
        !catForView.motherBreed ||
        !catForView.motherEmsCode)
    ) {
      const motherCat = await prisma.cat.findUnique({
        where: { id: catForView.motherId },
      });

      if (motherCat) {
        if (!catForView.motherName) {
          catForView.motherName = motherCat.name || null;
        }
        if (!catForView.motherBreed) {
          catForView.motherBreed = motherCat.breed || null;
        }
        if (!catForView.motherEmsCode) {
          catForView.motherEmsCode = motherCat.emsCode || null;
        }
      }
    }

    const microchipFormatted = formatMicrochip(catForView.microchip || "");

    res.render("cats/show", {
      cat: catForView,
      user,
      isAdmin,
      microchipFormatted,
      currentPath: req.path,
    });
  } catch (err) {
    console.error("Erro ao carregar gato:", err);
    res.status(500).send("Erro ao carregar gato");
  }
});

// --------- SALVAR NOVO GATO ---------
router.post(
  "/cats",
  requireAuth,
  upload.fields([
  { name: "pedigreeFile", maxCount: 1 },
  { name: "reproductionFile", maxCount: 1 },
  { name: "otherDocsFile", maxCount: 1 },
  { name: "photo", maxCount: 1 },
]),
  async (req, res) => {
    const { userId, role } = getAuthInfo(req); // pegamos também o role

    try {
      const {
  // Informações
  country,
  titleBeforeName,
  titleAfterName,
  name,
  microchip,
  birthDate,
  gender,
  neutered,
  breed,
  emsCode,

  // Registro
  fifeStatus,
  pedigreeType,
  pedigreeNumber,
  pedigreePending,

  // Criador / Proprietário
  breederType,
  breederName,
  ownershipType,
  fatherSource,
  fatherId,
  fatherName,
  fatherEmsCode,
  fatherBreed,

  motherSource,
  motherId,
  motherName,
  motherEmsCode,
  motherBreed,
} = req.body;

      const files = req.files || {};
      validateFilesForRole(Object.values(files).flat(), req.session?.userRole);

      const pedigreePath =
  files.pedigreeFile && files.pedigreeFile[0]
    ? `/uploads/cats/${files.pedigreeFile[0].filename}`
    : null;

const reproductionPath =
  files.reproductionFile && files.reproductionFile[0]
    ? `/uploads/cats/${files.reproductionFile[0].filename}`
    : null;

const otherDocsPath =
  files.otherDocsFile && files.otherDocsFile[0]
    ? `/uploads/cats/${files.otherDocsFile[0].filename}`
    : null;

          const photoPath =
  files.photo && files.photo[0]
    ? `/uploads/cats/${files.photo[0].filename}`
    : null;




      // normaliza microchip para só dígitos
      const microchipDigits = microchip ? microchip.replace(/\D/g, "") : null;
      const birthDateObj = birthDate ? new Date(birthDate) : null;
      const neuteredBool = neutered === "SIM";
      const pedigreePendingBool = pedigreePending === "on";

      // --------- PAI ---------
      let fatherIdValue = null;
      let fatherNameValue = null;
      let fatherEmsValue = null;
      let fatherBreedValue = null;

      if (fatherSource === "existing" && fatherId) {
        const fatherCat = await prisma.cat.findUnique({
          where: { id: Number(fatherId) },
        });

        if (fatherCat) {
          fatherIdValue = fatherCat.id;
          fatherNameValue = fatherCat.name || null;
          fatherEmsValue = fatherCat.emsCode || null;
          fatherBreedValue = fatherCat.breed || null;
        }
      } else if (fatherSource === "manual") {
  fatherNameValue = fatherName || null;
  fatherEmsValue = fatherEmsCode || null;
  fatherBreedValue = fatherBreed || null;
}

      // --------- MÃE ---------
      let motherIdValue = null;
      let motherNameValue = null;
      let motherEmsValue = null;
      let motherBreedValue = null;

      if (motherSource === "existing" && motherId) {
        const motherCat = await prisma.cat.findUnique({
          where: { id: Number(motherId) },
        });

        if (motherCat) {
          motherIdValue = motherCat.id;
          motherNameValue = motherCat.name || null;
          motherEmsValue = motherCat.emsCode || null;
          motherBreedValue = motherCat.breed || null;
        }
      } else if (motherSource === "manual") {
  motherNameValue = motherName || null;
  motherEmsValue = motherEmsCode || null;
  motherBreedValue = motherBreed || null;
}

      // --------- CHECAGEM DE MICROCHIP DUPLICADO ---------
      if (microchipDigits) {
        const existingCat = await prisma.cat.findUnique({
          where: { microchip: microchipDigits },
        });

        if (existingCat) {
          // usuário logado para o sidebar
          const userFromDb = await prisma.user.findUnique({
            where: { id: userId },
          });
          const user = userFromDb
            ? { ...userFromDb, role }
            : { id: userId, role };

          // listas de machos e fêmeas para repopular o formulário
          const maleCats = await prisma.cat.findMany({
            where: { gender: "M" },
            orderBy: { name: "asc" },
          });

          const femaleCats = await prisma.cat.findMany({
            where: { gender: "F" },
            orderBy: { name: "asc" },
          });

          // re-renderiza o formulário com a mensagem de erro
          return res.render("cats/new", {
            cat: {
  name,
  microchip,
  country,
  birthDate,
  gender,
  neutered,
  breed,
  emsCode,
},
            maleCats,
            femaleCats,
            user,
            currentPath: "/cats/new",
            microchipError: "Já existe um gato cadastrado com este microchip.",
          });
        }
      }

      // --------- CRIA O GATO SE NÃO HOUVER DUPLICIDADE ---------
      const createdCat = await prisma.cat.create({
  data: {
    ownerId: userId,
    status: "NOVO",

    // Informações básicas
    country: country || null,
    titleBeforeName: titleBeforeName || null,
    titleAfterName: titleAfterName || null,
    name,
    microchip: microchipDigits,
    birthDate: birthDateObj,
    gender: gender || null,
    neutered: neuteredBool,
    breed: breed || null,
    emsCode: emsCode || null,

    // Registro
    fifeStatus: fifeStatus || null,
    pedigreeType: pedigreeType || null,
    pedigreeNumber: pedigreeNumber || null,
    pedigreePending: pedigreePending === "on",

    // Criador
    breederType: breederType || null,
    breederName:
      breederType === "Outro" || breederType === "OTHER"
        ? breederName || null
        : null,
    ownershipType: ownershipType || null,

    // Pais
    fatherId: fatherIdValue,
    fatherName: fatherNameValue,
    fatherEmsCode: fatherEmsValue,
    fatherBreed: fatherBreedValue,

    motherId: motherIdValue,
    motherName: motherNameValue,
    motherEmsCode: motherEmsValue,
    motherBreed: motherBreedValue,

    // Documentos
    photo: photoPath,
    pedigreeFile: pedigreePath,
    reproductionFile: reproductionPath,
    otherDocsFile: otherDocsPath,
  },
});

      await notifyNewCat(prisma, createdCat, req.user);
      await notifyUserCatConfirmation(createdCat, req.user);

      res.redirect("/cats");
    } catch (err) {
      console.error("Erro ao criar gato:", err);
      if (err.code === "UPLOAD_LIMIT" || err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).send(err.message || "Arquivo acima do limite permitido para seu perfil.");
      }
      res.status(500).send("Erro ao criar gato");
    }
  }
);

// --------- ALTERAR STATUS DO GATO (ADMIN) ---------
router.post("/cats/:id/status", requireAuth, async (req, res) => {
  const { userId, isAdmin } = getAuthInfo(req);
  const catId = Number(req.params.id);
  const { status } = req.body;

  // Somente ADMIN pode mudar status
  if (!isAdmin) {
    return res.status(403).send("Acesso negado.");
  }

  await prisma.cat.update({
    where: { id: catId },
    data: { status },
  });

  res.redirect(`/cats/${catId}`);
});


  // --------- FORMULÁRIO: EDITAR GATO ---------
  router.get("/cats/:id/edit", requireAuth, async (req, res) => {
    const { userId, role, isAdmin } = getAuthInfo(req);
    const id = Number(req.params.id);

    try {
      const userFromDb = await prisma.user.findUnique({
        where: { id: userId },
      });

      const user = userFromDb ? { ...userFromDb, role } : { id: userId, role };

      const cat = await prisma.cat.findUnique({
        where: { id },
      });

      if (!cat) {
        return res.status(404).send("Gato não encontrado");
      }

      if (!isAdmin && cat.ownerId !== userId) {
        return res.status(403).send("Você não pode editar este gato.");
      }

      res.render("cats/edit", {
        cat,
        user,
        isAdmin,
        currentPath: req.path,
      });
    } catch (err) {
      console.error("Erro ao carregar edição:", err);
      res.status(500).send("Erro ao carregar edição");
    }
  });

// --------- ATUALIZAR GATO ---------
router.post(
  "/cats/:id",
  requireAuth,
  upload.fields([
    { name: "pedigreeFile", maxCount: 1 },
    { name: "breedingCertificateFile", maxCount: 1 },
    { name: "extraDocumentsFile", maxCount: 1 },
    { name: "photo", maxCount: 1 },
  
  ]),
  async (req, res) => {
    const { id } = req.params;
    const { userId, isAdmin } = getAuthInfo(req);

    try {
      const existingCat = await prisma.cat.findUnique({
        where: { id: Number(id) },
      });

      if (!existingCat) {
        return res.status(404).send("Gato não encontrado");
      }

      if (!isAdmin && existingCat.ownerId !== userId) {
        return res.status(403).send("Você não pode editar este gato.");
      }

      const {
        // Informações
        country,
        titleBeforeName, 
        titleAfterName,  
        name,
        microchip,
        birthDate,
        sex,
        neutered,
        breed,
        colorEms,

        // Registro
        memberType,
        registerType,
        pedigreeNumber,
        pedigreePending,

        // Criador / Proprietário
        breederType,
        breederOtherName,
        ownershipType,

        // Pais
        fatherSource,
        fatherId,
        fatherNameManual,
        fatherColorEmsManual,
        fatherBreedManual,

        motherSource,
        motherId,
        motherNameManual,
        motherColorEmsManual,
        motherBreedManual,
      } = req.body;

      const files = req.files || {};

      const pedigreePath =
        files.pedigreeFile && files.pedigreeFile[0]
          ? `/uploads/cats/${files.pedigreeFile[0].filename}`
          : existingCat.pedigreeFile;

      const reproductionPath =
        files.breedingCertificateFile && files.breedingCertificateFile[0]
          ? `/uploads/cats/${files.breedingCertificateFile[0].filename}`
          : existingCat.reproductionFile;

      const otherDocsPath =
        files.extraDocumentsFile && files.extraDocumentsFile[0]
          ? `/uploads/cats/${files.extraDocumentsFile[0].filename}`
          : existingCat.otherDocsFile;

          const photoPath =
  files.photo && files.photo[0]
    ? `/uploads/cats/${files.photo[0].filename}`
    : null;



      const microchipDigits = microchip ? microchip.replace(/\D/g, "") : null;
      const birthDateObj = birthDate ? new Date(birthDate) : null;
      const neuteredBool = neutered === "SIM";
      const pedigreePendingBool = pedigreePending === "on";

      // --------- PAI ---------
      let fatherIdValue = existingCat.fatherId || null;
      let fatherNameValue = existingCat.fatherName || null;
      let fatherEmsValue = existingCat.fatherEmsCode || null;
      let fatherBreedValue = existingCat.fatherBreed || null;

      if (isAdmin) {
        // Só ADMIN pode alterar esses campos
        fatherIdValue = null;
        fatherNameValue = null;
        fatherEmsValue = null;
        fatherBreedValue = null;

        if (fatherSource === "existing" && fatherId) {
          const fatherCat = await prisma.cat.findUnique({
            where: { id: Number(fatherId) },
          });

          if (fatherCat) {
            fatherIdValue = fatherCat.id;
            fatherNameValue = fatherCat.name || null;
            fatherEmsValue = fatherCat.emsCode || null;
            fatherBreedValue = fatherCat.breed || null;
          }
        } else if (fatherSource === "manual") {
          fatherNameValue = fatherNameManual || null;
          fatherEmsValue = fatherColorEmsManual || null;
          fatherBreedValue = fatherBreedManual || null;
        }
      }

      // --------- MÃE ---------
      let motherIdValue = existingCat.motherId || null;
      let motherNameValue = existingCat.motherName || null;
      let motherEmsValue = existingCat.motherEmsCode || null;
      let motherBreedValue = existingCat.motherBreed || null;

      if (isAdmin) {
        // Só ADMIN pode alterar esses campos
        motherIdValue = null;
        motherNameValue = null;
        motherEmsValue = null;
        motherBreedValue = null;

        if (motherSource === "existing" && motherId) {
          const motherCat = await prisma.cat.findUnique({
            where: { id: Number(motherId) },
          });

          if (motherCat) {
            motherIdValue = motherCat.id;
            motherNameValue = motherCat.name || null;
            motherEmsValue = motherCat.emsCode || null;
            motherBreedValue = motherCat.breed || null;
          }
        } else if (motherSource === "manual") {
          motherNameValue = motherNameManual || null;
          motherEmsValue = motherColorEmsManual || null;
          motherBreedValue = motherBreedManual || null;
        }
      }

      // CAMPOS SEMPRE EDITÁVEIS (USER e ADMIN)
      const data = {
        name,
        titleBeforeName: titleBeforeName || null, 
        titleAfterName: titleAfterName || null,  
        neutered: neuteredBool,
        pedigreeFile: pedigreePath,
        reproductionFile: reproductionPath,
        otherDocsFile: otherDocsPath,
        photo: photoPath,
        ownershipType: ownershipType || existingCat.ownershipType || null,
      };

      // CAMPOS EXTRAS – APENAS ADMIN
      if (isAdmin) {
        Object.assign(data, {
          country: country || null,
          microchip: microchipDigits,
          birthDate: birthDateObj,
          gender: sex || null,
          breed: breed || null,
          emsCode: colorEms || null,

          fifeStatus: memberType || null,
          pedigreeType: registerType || null,
          pedigreeNumber: pedigreeNumber || null,
          pedigreePending: pedigreePendingBool,

          breederType: breederType || null,
          breederName:
            breederType === "Outro" || breederType === "OTHER"
              ? breederOtherName || null
              : null,

          fatherId: fatherIdValue,
          fatherName: fatherNameValue,
          fatherEmsCode: fatherEmsValue,
          fatherBreed: fatherBreedValue,

          motherId: motherIdValue,
          motherName: motherNameValue,
          motherEmsCode: motherEmsValue,
          motherBreed: motherBreedValue,
        });
      }

      // --------------------------------------------------
// REGRA: SE USER EDITAR, VOLTA STATUS PARA "NOVO"
// --------------------------------------------------
if (!isAdmin) {
  data.status = "NOVO";
}

      await prisma.cat.update({
        where: { id: Number(id) },
        data,
      });

      res.redirect("/cats");
    } catch (err) {
      console.error("Erro ao atualizar gato:", err);
      res.status(500).send("Erro ao atualizar gato");
    }
  }
);

  // --------- DELETAR GATO ---------
  router.post("/cats/:id/delete", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { userId, isAdmin } = getAuthInfo(req);

    try {
      const cat = await prisma.cat.findUnique({
        where: { id: Number(id) },
      });

      if (!cat) {
        return res.status(404).send("Gato não encontrado");
      }

      if (!isAdmin && cat.ownerId !== userId) {
        return res
          .status(403)
          .send("Você não tem permissão para excluir este gato");
      }

      await prisma.cat.delete({
        where: { id: Number(id) },
      });

      res.redirect("/cats");
    } catch (err) {
      console.error("Erro ao deletar gato:", err);
      res.status(500).send("Erro ao deletar gato");
    }
  });

  return router;
};
