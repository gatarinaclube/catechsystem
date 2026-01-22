// modules/cats.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

module.exports = (prisma, requireAuth) => {
  const router = express.Router();

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

 // --------- CONFIGURAÇÃO DO MULTER ---------
const UPLOADS_ROOT =
  process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");

const uploadDir = path.join(UPLOADS_ROOT, "cats");

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

  const upload = multer({ storage });

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
    { name: "breedingCertificateFile", maxCount: 1 },
    { name: "extraDocumentsFile", maxCount: 1 },
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
        sex, // no banco está como gender
        neutered,
        breed,
        colorEms,

        // Registro
        memberType,
        registerType,
        pedigreeNumber,
        registerPending,

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
          : null;

      const reproductionPath =
        files.breedingCertificateFile && files.breedingCertificateFile[0]
          ? `/uploads/cats/${files.breedingCertificateFile[0].filename}`
          : null;

      const otherDocsPath =
        files.extraDocumentsFile && files.extraDocumentsFile[0]
          ? `/uploads/cats/${files.extraDocumentsFile[0].filename}`
          : null;

      // normaliza microchip para só dígitos
      const microchipDigits = microchip ? microchip.replace(/\D/g, "") : null;
      const birthDateObj = birthDate ? new Date(birthDate) : null;
      const neuteredBool = neutered === "SIM";
      const pedigreePendingBool = registerPending === "on";

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
        fatherNameValue = fatherNameManual || null;
        fatherEmsValue = fatherColorEmsManual || null;
        fatherBreedValue = fatherBreedManual || null;
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
        motherNameValue = motherNameManual || null;
        motherEmsValue = motherColorEmsManual || null;
        motherBreedValue = motherBreedManual || null;
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
              microchip, // mantém como o usuário digitou (com pontos)
              country,
              birthDate,
              sex,
              neutered,
              breed,
              colorEms,
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
      await prisma.cat.create({
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
          gender: sex || null,
          neutered: neuteredBool,
          breed: breed || null,
          emsCode: colorEms || null,

          // Registro
          fifeStatus: memberType || null,
          pedigreeType: registerType || null,
          pedigreeNumber: pedigreeNumber || null,
          pedigreePending: pedigreePendingBool,

          // Criador
          breederType: breederType || null,
          breederName:
            breederType === "OTHER" ? breederOtherName || null : null,
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
          pedigreeFile: pedigreePath,
          reproductionFile: reproductionPath,
          otherDocsFile: otherDocsPath,
        },
      });

      res.redirect("/cats");
    } catch (err) {
      console.error("Erro ao criar gato:", err);
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
        registerPending,

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

      const microchipDigits = microchip ? microchip.replace(/\D/g, "") : null;
      const birthDateObj = birthDate ? new Date(birthDate) : null;
      const neuteredBool = neutered === "SIM";
      const pedigreePendingBool = registerPending === "on";

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
