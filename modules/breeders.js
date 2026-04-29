const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const COUNTRIES = [
  "BR","AR","AT","BE","BG","BY","CA","CH","CL","CO","CY","CZ",
  "DE","DK","EE","ES","FI","FR","GB","GR","HR","HU","ID","IL",
  "IS","IT","KO","KR","LI","LT","LU","LV","MX","MY","NL","NO",
  "PL","PT","RO","RS","RU","SE","SI","SK","TR","UA","US","UY"
];

const BREEDS = [
  "ABY","SOM","ACL","ACS","BAL","SIA","BEN","BLH","BSH","BML","BOM","BUR",
  "CHA","CRX","DRX","DSP","EUR","EXO","PER","GRX","HCL","HCS","JBS","KBL",
  "KBS","KOR","LPL","LPS","LYO","MAU","MCO","NEM","NFO","OCI","OLH","OSH",
  "PEB","RAG","RUS","SBI","SIB","SNO","SOK","SPH","SRL","SRS","THA","TUA","TUV"
];

function createUploadMiddleware() {
  const diskRoot =
    process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");
  const uploadDir = path.join(diskRoot, "cats");

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

  return multer({ storage });
}

function normalizeMicrochip(microchip) {
  return microchip ? microchip.replace(/\D/g, "").slice(0, 15) : null;
}

function calculateAge(birthDate) {
  if (!birthDate) return null;

  const now = new Date();
  const birth = new Date(birthDate);

  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();

  if (now.getDate() < birth.getDate()) {
    months -= 1;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years < 0) {
    return null;
  }

  return { years, months, totalMonths: years * 12 + months };
}

function formatAge(age) {
  if (!age) return "Idade não informada";

  const yearLabel = age.years === 1 ? "ano" : "anos";
  const monthLabel = age.months === 1 ? "mês" : "meses";
  return `${age.years} ${yearLabel} e ${age.months} ${monthLabel}`;
}

function buildDisplayName(cat) {
  return [
    cat.titleBeforeName,
    cat.country ? `${cat.country}*` : null,
    cat.name,
    cat.titleAfterName,
  ]
    .filter(Boolean)
    .join(" ");
}

function classifyBreeder(cat) {
  const age = calculateAge(cat.birthDate);
  const isBreeding = cat.neutered !== true && cat.deceased !== true;

  if (cat.deceased === true || cat.neutered === true) {
    return "founders";
  }

  if (isBreeding && age && age.totalMonths < 10) {
    return "new";
  }

  if (isBreeding && cat.gender === "M") {
    return "sires";
  }

  if (isBreeding && cat.gender === "F") {
    return "dams";
  }

  return "founders";
}

function mapOwnershipType(value) {
  return value === "OTHER" ? "CO-OWNERSHIP" : "OWNER";
}

function mapOwnershipValue(value) {
  return value === "CO-OWNERSHIP" ? "OTHER" : "ME";
}

function mapBreedingValue(cat) {
  return cat.neutered === true ? "NOT_FOR_BREEDING" : "FOR_BREEDING";
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();
  const upload = createUploadMiddleware();

  async function buildFormContext(req, cat = null) {
    const maleCats = await prisma.cat.findMany({
      where: {
        gender: "M",
        neutered: false,
        OR: [{ deceased: false }, { deceased: null }],
      },
      orderBy: { name: "asc" },
    });

    const femaleCats = await prisma.cat.findMany({
      where: {
        gender: "F",
        neutered: false,
        OR: [{ deceased: false }, { deceased: null }],
      },
      orderBy: { name: "asc" },
    });

    const breedingValue = cat
      ? cat.breedingStatus || mapBreedingValue(cat)
      : "FOR_BREEDING";
    const ownershipValue = cat
      ? cat.ownershipMode || mapOwnershipValue(cat.ownershipType)
      : "ME";
    const deceasedValue = cat
      ? cat.deceased === true || cat.deceased === "YES"
        ? "YES"
        : "NO"
      : "NO";

    return {
      user: req.user,
      currentPath: req.path,
      countries: COUNTRIES,
      breeds: BREEDS,
      maleCats,
      femaleCats,
      cat,
      breedingValue,
      ownershipValue,
      deceasedValue,
      ageLabel: cat ? formatAge(calculateAge(cat.birthDate)) : "",
    };
  }

  async function parseBreederPayload(req, existingCat = null) {
    const {
      titleBeforeName,
      titleAfterName,
      country,
      name,
      birthDate,
      gender,
      microchip,
      pedigreeType,
      pedigreeNumber,
      breed,
      emsCode,
      breederType,
      breederName,
      fatherMode,
      fatherId,
      fatherName,
      fatherBreed,
      fatherEmsCode,
      motherMode,
      motherId,
      motherName,
      motherBreed,
      motherEmsCode,
      breedingStatus,
      deceased,
      ownershipMode,
    } = req.body;

    const microchipDigits = normalizeMicrochip(microchip);
    const currentId = existingCat ? existingCat.id : null;

    if (microchipDigits) {
      const duplicate = await prisma.cat.findUnique({
        where: { microchip: microchipDigits },
      });

      if (duplicate && duplicate.id !== currentId) {
        const error = new Error("Já existe um gato cadastrado com este microchip.");
        error.code = "DUPLICATE_MICROCHIP";
        throw error;
      }
    }

    let fatherIdValue = null;
    let fatherNameValue = null;
    let fatherBreedValue = null;
    let fatherEmsCodeValue = null;

    if (fatherMode === "existing" && fatherId) {
      const fatherCat = await prisma.cat.findUnique({
        where: { id: Number(fatherId) },
      });

      if (fatherCat) {
        fatherIdValue = fatherCat.id;
        fatherNameValue = fatherCat.name || null;
        fatherBreedValue = fatherCat.breed || null;
        fatherEmsCodeValue = fatherCat.emsCode || null;
      }
    } else if (fatherMode === "manual") {
      fatherNameValue = fatherName || null;
      fatherBreedValue = fatherBreed || null;
      fatherEmsCodeValue = fatherEmsCode || null;
    }

    let motherIdValue = null;
    let motherNameValue = null;
    let motherBreedValue = null;
    let motherEmsCodeValue = null;

    if (motherMode === "existing" && motherId) {
      const motherCat = await prisma.cat.findUnique({
        where: { id: Number(motherId) },
      });

      if (motherCat) {
        motherIdValue = motherCat.id;
        motherNameValue = motherCat.name || null;
        motherBreedValue = motherCat.breed || null;
        motherEmsCodeValue = motherCat.emsCode || null;
      }
    } else if (motherMode === "manual") {
      motherNameValue = motherName || null;
      motherBreedValue = motherBreed || null;
      motherEmsCodeValue = motherEmsCode || null;
    }

    return {
      ownerId: existingCat ? existingCat.ownerId : req.session.userId,
      titleBeforeName: titleBeforeName || null,
      titleAfterName: titleAfterName || null,
      country: country || null,
      name,
      birthDate: birthDate ? new Date(birthDate) : null,
      gender: gender || null,
      microchip: microchipDigits,
      pedigreeType: pedigreeType || null,
      pedigreeNumber: pedigreeNumber || null,
      breed: breed || null,
      emsCode: emsCode || null,
      breederType: breederType || "Eu Mesmo",
      breederName: breederType === "Outro" ? breederName || null : null,
      fatherId: fatherIdValue,
      fatherName: fatherNameValue,
      fatherBreed: fatherBreedValue,
      fatherEmsCode: fatherEmsCodeValue,
      motherId: motherIdValue,
      motherName: motherNameValue,
      motherBreed: motherBreedValue,
      motherEmsCode: motherEmsCodeValue,
      neutered: breedingStatus === "NOT_FOR_BREEDING",
      deceased: deceased === "YES",
      ownershipType: mapOwnershipType(ownershipMode),
      status: existingCat ? existingCat.status : "NOVO",
    };
  }

  router.get(
    "/breeders",
    requireAuth,
    requirePermission("admin.breeders"),
    async (req, res) => {
      const selectedOwnerId = req.query.ownerId ? Number(req.query.ownerId) : null;
      const users = await prisma.user.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true },
      });
      const cats = await prisma.cat.findMany({
        where: selectedOwnerId ? { ownerId: selectedOwnerId } : {},
        orderBy: { name: "asc" },
      });

      const groups = {
        sires: [],
        dams: [],
        founders: [],
        new: [],
      };

      cats.forEach((cat) => {
        const age = calculateAge(cat.birthDate);
        const enrichedCat = {
          ...cat,
          displayName: buildDisplayName(cat),
          ageLabel: formatAge(age),
        };

        groups[classifyBreeder(cat)].push(enrichedCat);
      });

      res.render("breeders/list", {
        user: req.user,
        currentPath: req.path,
        groups,
        users,
        selectedOwnerId,
      });
    }
  );

  router.get(
    "/breeders/new",
    requireAuth,
    requirePermission("admin.breeders"),
    async (req, res) => {
      res.render("breeders/form", {
        ...(await buildFormContext(req, null)),
        formTitle: "Novo Padreador/Matriz",
        submitLabel: "Salvar",
        formAction: "/breeders",
        historyPath: null,
        cancelPath: "/breeders",
        error: null,
      });
    }
  );

  router.post(
    "/breeders",
    requireAuth,
    requirePermission("admin.breeders"),
    upload.none(),
    async (req, res) => {
      try {
        const data = await parseBreederPayload(req);
        const breeder = await prisma.cat.create({ data });
        res.redirect(`/breeders/${breeder.id}`);
      } catch (err) {
        const cat = { ...req.body };
        res.status(err.code === "DUPLICATE_MICROCHIP" ? 400 : 500).render(
          "breeders/form",
          {
            ...(await buildFormContext(req, cat)),
            formTitle: "Novo Padreador/Matriz",
            submitLabel: "Salvar",
            formAction: "/breeders",
            historyPath: null,
            cancelPath: "/breeders",
            error:
              err.code === "DUPLICATE_MICROCHIP"
                ? err.message
                : "Erro ao salvar o reprodutor.",
          }
        );
      }
    }
  );

  router.get(
    "/breeders/:id",
    requireAuth,
    requirePermission("admin.breeders"),
    async (req, res) => {
      const cat = await prisma.cat.findUnique({
        where: { id: Number(req.params.id) },
      });

      if (!cat) {
        return res.status(404).send("Reprodutor não encontrado.");
      }

      res.render("breeders/form", {
        ...(await buildFormContext(req, cat)),
        formTitle: "Editar Padreador/Matriz",
        submitLabel: "Salvar",
        formAction: `/breeders/${cat.id}`,
        historyPath: `/breeders/${cat.id}/history`,
        cancelPath: "/breeders",
        error: null,
      });
    }
  );

  router.post(
    "/breeders/:id",
    requireAuth,
    requirePermission("admin.breeders"),
    upload.none(),
    async (req, res) => {
      const existingCat = await prisma.cat.findUnique({
        where: { id: Number(req.params.id) },
      });

      if (!existingCat) {
        return res.status(404).send("Reprodutor não encontrado.");
      }

      try {
        const data = await parseBreederPayload(req, existingCat);
        await prisma.cat.update({
          where: { id: existingCat.id },
          data,
        });
        res.redirect(`/breeders/${existingCat.id}`);
      } catch (err) {
        const cat = { ...existingCat, ...req.body, id: existingCat.id };
        res.status(err.code === "DUPLICATE_MICROCHIP" ? 400 : 500).render(
          "breeders/form",
          {
            ...(await buildFormContext(req, cat)),
            formTitle: "Editar Padreador/Matriz",
            submitLabel: "Salvar",
            formAction: `/breeders/${existingCat.id}`,
            historyPath: `/breeders/${existingCat.id}/history`,
            cancelPath: "/breeders",
            error:
              err.code === "DUPLICATE_MICROCHIP"
                ? err.message
                : "Erro ao atualizar o reprodutor.",
          }
        );
      }
    }
  );

  router.get(
    "/breeders/:id/history",
    requireAuth,
    requirePermission("admin.breeders"),
    async (req, res) => {
      const cat = await prisma.cat.findUnique({
        where: { id: Number(req.params.id) },
      });

      if (!cat) {
        return res.status(404).send("Reprodutor não encontrado.");
      }

      const age = calculateAge(cat.birthDate);

      const timeline = [
        {
          label: "Cadastro criado em",
          value: cat.createdAt
            ? new Date(cat.createdAt).toLocaleString("pt-BR")
            : "-",
        },
        {
          label: "Classificação atual",
          value:
            classifyBreeder(cat) === "sires"
              ? "Padreador"
              : classifyBreeder(cat) === "dams"
                ? "Matriz"
                : classifyBreeder(cat) === "new"
                  ? "Novo"
                  : "Fundador",
        },
        {
          label: "Status reprodutivo",
          value: mapBreedingValue(cat) === "FOR_BREEDING"
            ? "For Breeding"
            : "Not For Breeding",
        },
        {
          label: "Óbito",
          value: cat.deceased ? "Sim" : "Não",
        },
        {
          label: "Idade atual",
          value: formatAge(age),
        },
        {
          label: "Status de cadastro",
          value: cat.status || "-",
        },
      ];

      res.render("breeders/history", {
        user: req.user,
        currentPath: "/breeders",
        cat: {
          ...cat,
          displayName: buildDisplayName(cat),
        },
        timeline,
      });
    }
  );

  return router;
};
