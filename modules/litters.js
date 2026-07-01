const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { isAdminRole, normalizeRole } = require("../utils/access");
const {
  notifyNewService,
  notifyUserServiceConfirmation,
} = require("../utils/adminNotifications");
const { getFileUploadLimit, validateFilesForRole } = require("../utils/planLimits");
const { selectedBreedsFromSettings } = require("../utils/userPreferences");
const { buildDisplayName } = require("../utils/cattery-admin");
const { formatCpf, formatPhone } = require("../utils/format");

const baseUploadsDir =
  process.env.UPLOADS_DIR
    ? process.env.UPLOADS_DIR
    : path.join(__dirname, "..", "public", "uploads");

const uploadDir = path.join(baseUploadsDir, "litters");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique =
      Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `authorization-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: getFileUploadLimit("ADMIN").bytes },
});

function cleanText(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function hasKittenFormData(body, index) {
  return [
    `kitten${index}_nameSuffix`,
    `kitten${index}_ems`,
    `kitten${index}_sex`,
    `kitten${index}_microchip`,
    `kitten${index}_breeding`,
    `kitten${index}_breed`,
  ].some((key) => cleanText(body[key]));
}

function requiredFieldError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function isKittenFromLitter(cat) {
  return Boolean(cat?.kittenNumber || cat?.litterKitten);
}

function canAppearAsLitterParent(cat) {
  if (!isKittenFromLitter(cat)) return true;
  return cat.breedingProspect === true;
}

function formatDateForInput(date) {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function normalizeMicrochip(value) {
  return value ? String(value).replace(/\D/g, "").slice(0, 15) : null;
}

function sameUtcDay(date) {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function nextUtcDay(date) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function buildImportLabel(litter) {
  const number = litter.litterNumber || String(litter.id).padStart(3, "0");
  const date = formatDateForInput(litter.litterBirthDate).split("-").reverse().join("/");
  return `${number} - ${litter.femaleName || "Fêmea"} x ${litter.maleName || "Macho"} - ${date || "-"}`;
}

function findMatchingCat(cats, litter, type) {
  const microchip = normalizeMicrochip(type === "male" ? litter?.maleMicrochip : litter?.femaleMicrochip);
  const name = String(type === "male" ? litter?.maleName : litter?.femaleName || "").trim().toLowerCase();

  return cats.find((cat) => {
    const catMicrochip = normalizeMicrochip(cat.microchip);
    if (microchip && catMicrochip === microchip) return true;
    return name && String(cat.name || "").trim().toLowerCase() === name;
  }) || null;
}

function importedKittenAt(litter, index) {
  return (litter?.kittens || []).find((kitten) => Number(kitten.index) === index) || null;
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();


  // Helper simples para pegar dados de auth
  function getAuthInfo(req) {
    const userId = req.session.userId;
    const role = normalizeRole(req.session.userRole);
    const isAdmin = isAdminRole(role);
    return { userId, role, isAdmin };
  }

  // ---------- FORMULÁRIO: NOVA NINHADA ----------
  router.get(
    "/litters/new",
    requireAuth,
    requirePermission("service.litter"),
    async (req, res) => {
    try {
      const { userId } = getAuthInfo(req);

      // machos e fêmeas do próprio usuário; filhotes de ninhada só entram se marcados como reprodutores
      const maleCats = await prisma.cat.findMany({
        where: { ownerId: userId, gender: "M" },
        include: {
          owner: { include: { settings: true } },
          mother: true,
          litterKitten: { include: { litter: true } },
        },
        orderBy: { name: "asc" },
      });

      const femaleCats = await prisma.cat.findMany({
        where: { ownerId: userId, gender: "F" },
        include: {
          owner: { include: { settings: true } },
          mother: true,
          litterKitten: { include: { litter: true } },
        },
        orderBy: { name: "asc" },
      });
      const importableLitters = await prisma.litter.findMany({
        where: { ownerId: userId },
        include: { kittens: { orderBy: { index: "asc" } } },
        orderBy: [{ litterBirthDate: "desc" }, { id: "desc" }],
      });
      const importedLitterId = req.query.importLitterId ? Number(req.query.importLitterId) : null;
      const importedLitter = importedLitterId
        ? importableLitters.find((litter) => litter.id === importedLitterId)
        : null;
      const filteredMaleCats = maleCats.filter(canAppearAsLitterParent);
      const filteredFemaleCats = femaleCats.filter(canAppearAsLitterParent);
      const importedMaleCat = findMatchingCat(filteredMaleCats, importedLitter, "male");
      const importedFemaleCat = findMatchingCat(filteredFemaleCats, importedLitter, "female");
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { breedsJson: true },
      });
      const breeds = selectedBreedsFromSettings(settings, [
        importedLitter?.litterBreed,
        ...(importedLitter?.kittens || []).map((kitten) => kitten.breed),
      ]);

      res.render("litters/new", {
        user: req.user,
        currentPath: req.path,
        maleCats: filteredMaleCats.map((cat) => ({ ...cat, displayName: buildDisplayName(cat) })),
        femaleCats: filteredFemaleCats.map((cat) => ({ ...cat, displayName: buildDisplayName(cat) })),
        importableLitters: importableLitters.map((litter) => ({
          ...litter,
          importLabel: buildImportLabel(litter),
        })),
        importedLitter,
        importedMaleCatId: importedMaleCat?.id || "",
        importedFemaleCatId: importedFemaleCat?.id || "",
        importedKittenAt,
        formatDateForInput,
        breeds,
        userId,
      });
    } catch (err) {
      console.error("Erro ao abrir formulário de ninhada:", err);
      res.status(500).send("Erro ao abrir formulário de ninhada");
    }
    }
  );

  // ---------- SALVAR NINHADA ----------
 router.post(
  "/litters",
  requireAuth,
  requirePermission("service.litter"),
  upload.single("externalOwnerAuthorization"),
  async (req, res) => {

    const { userId } = getAuthInfo(req);

try {
  validateFilesForRole(req.file ? [req.file] : [], req.session?.userRole);
  console.log("=== DEBUG FORM DATA ===");
console.log("maleOwnership:", req.body.maleOwnership);
console.log("externalOwnerName:", req.body.externalOwnerName);
console.log("externalOwnerEmail:", req.body.externalOwnerEmail);
console.log("externalOwnerCpf:", req.body.externalOwnerCpf);
console.log("externalOwnerPhone:", req.body.externalOwnerPhone);
console.log("externalOwnerCattery:", req.body.externalOwnerCattery);
console.log("FILE:", req.file);
console.log("=======================");


  const isMaleNotOwner = req.body.maleOwnership === "NOT_OWNER";


      const authorizationFile = req.file
    ? `/uploads/litters/${req.file.filename}`
    : null;
  const importedLitterId = req.body.importedLitterId ? Number(req.body.importedLitterId) : null;
  const importedLitter = importedLitterId
    ? await prisma.litter.findFirst({
        where: { id: importedLitterId, ownerId: userId },
        include: { kittens: { orderBy: { index: "asc" } } },
      })
    : null;

  if (importedLitterId && !importedLitter) {
    throw requiredFieldError("Ninhada importada não encontrada para este usuário.");
  }

  if (importedLitter) {
    const existingService = await prisma.serviceRequest.findFirst({
      where: {
        userId,
        litterId: importedLitter.id,
        type: "Registro de Ninhada",
      },
      select: { id: true },
    });

    if (existingService) {
      throw requiredFieldError("Esta ninhada já possui um Registro de Ninhada enviado. Acompanhe ou corrija o serviço em Meus Serviços.");
    }

    const service = await prisma.serviceRequest.create({
      data: {
        userId,
        litterId: importedLitter.id,
        type: "Registro de Ninhada",
        description: `Registro de ninhada #${importedLitter.id}`,
        status: "ENVIADO_GATARINA",
        statuses: {
          create: {
            status: "ENVIADO_GATARINA",
          },
        },
      },
    });

    await notifyNewService(prisma, service);
    await notifyUserServiceConfirmation(prisma, service);

    return res.redirect("/my-services");
  }

  if (isMaleNotOwner && !req.file) {
    return res.status(400).send(
      "Autorização de reprodução é obrigatória quando o macho não é de propriedade."
    );
  }


      const {
        // seleção dos pais
        maleCatId,
        maleFfbLo,

        femaleCatId,
        femaleFfbLo,

        // Novo proprietário do macho
        externalOwnerName,
        externalOwnerEmail,
        externalOwnerCpf,
        externalOwnerPhone,
        externalOwnerCattery,


        // Ninhada
        catteryCountry,
        litterBreed,
        litterCount,
        litterBirthDate,
      } = req.body;


      const catOwnerWhere = (id, gender) => ({
        id: Number(id),
        gender,
        ownerId: userId,
      });

      // ----- Buscar dados do macho selecionado -----
      let maleName = null;
      let maleBreed = null;
      let maleEms = null;
      let maleMicrochip = null;

      if (maleCatId) {
        const maleCat = await prisma.cat.findFirst({
          where: catOwnerWhere(maleCatId, "M"),
          include: { litterKitten: true },
        });

        if (!maleCat || !canAppearAsLitterParent(maleCat)) {
          throw requiredFieldError("Macho inválido para este usuário.");
        }

        if (maleCat) {
          maleName = maleCat.name || null;
          maleBreed = maleCat.breed || null;
          maleEms = maleCat.colorEms || maleCat.emsCode || null;
          maleMicrochip = maleCat.microchip
  ? String(maleCat.microchip).replace(/\D/g, "").slice(0, 15)
  : null;
        }
      }

      // ----- Buscar dados da fêmea selecionada -----
      let femaleName = null;
      let femaleBreed = null;
      let femaleEms = null;
      let femaleMicrochip = null;

      if (femaleCatId) {
        const femaleCat = await prisma.cat.findFirst({
          where: catOwnerWhere(femaleCatId, "F"),
          include: { litterKitten: true },
        });

        if (!femaleCat || !canAppearAsLitterParent(femaleCat)) {
          throw requiredFieldError("Fêmea inválida para este usuário.");
        }

        if (femaleCat) {
          femaleName = femaleCat.name || null;
          femaleBreed = femaleCat.breed || null;
          femaleEms = femaleCat.colorEms || femaleCat.emsCode || null;
          femaleMicrochip = femaleCat.microchip
  ? String(femaleCat.microchip).replace(/\D/g, "").slice(0, 15)
  : null;
        }
      }

      // Converte dados da ninhada
      const litterCountInt =
        litterCount && litterCount !== "" ? parseInt(litterCount, 10) : null;

      if (!cleanText(req.body.catteryName)) {
        throw requiredFieldError("Informe o nome do gatil.");
      }

      if (!cleanText(litterBirthDate)) {
        throw requiredFieldError("Informe a data de nascimento da ninhada.");
      }

      if (!Number.isInteger(litterCountInt) || litterCountInt < 1 || litterCountInt > 9) {
        throw requiredFieldError("Informe um número de filhotes entre 1 e 9.");
      }

      // Normalizar a data (ex.: veio "12025-10-10" -> usamos os últimos 10 chars)
      let litterBirthDateObj = null;
if (litterBirthDate && litterBirthDate.trim() !== "") {
  let normalized = litterBirthDate.trim();
  if (normalized.length > 10) {
    normalized = normalized.slice(-10); // "YYYY-MM-DD"
  }

  const parts = normalized.split("-"); // [YYYY, MM, DD]
  litterBirthDateObj = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

      // Monta array de filhotes
      // Observação: pelos logs, os campos vêm como:
      // kitten1_nameSuffix, kitten1_fullName, kitten1_ems, kitten1_sex,
      // kitten1_microchip, kitten1_breeding, ...
      const kittensData = [];
      for (let i = 1; i <= 9; i++) {
        const nameSuffix = req.body[`kitten${i}_nameSuffix`]; // Nome sem o gatil
        const ems = req.body[`kitten${i}_ems`];
        const sex = req.body[`kitten${i}_sex`];
        const mcRaw = req.body[`kitten${i}_microchip`];
        const breeding = req.body[`kitten${i}_breeding`];
        const breed = req.body[`kitten${i}_breed`];
        // fullName existe, mas para o banco vamos guardar só o sufixo
        // const fullName = req.body[`kitten${i}_fullName`];

        const hasAnyValue =
          (nameSuffix && nameSuffix.trim() !== "") ||
          (breed && breed.trim() !== "") ||
          (ems && ems.trim() !== "") ||
          (sex && sex.trim() !== "") ||
          (mcRaw && mcRaw.trim() !== "") ||
          (breeding && breeding.trim() !== "");

        if (i <= litterCountInt) {
          if (!cleanText(breed)) {
            throw requiredFieldError(`Informe a raça do filhote ${i}.`);
          }

          if (!cleanText(ems)) {
            throw requiredFieldError(`Informe a cor/EMS do filhote ${i}.`);
          }

          if (!cleanText(sex)) {
            throw requiredFieldError(`Informe o sexo do filhote ${i}.`);
          }
        }

        if (i > litterCountInt && hasKittenFormData(req.body, i)) {
          throw requiredFieldError(
            `Apague todas as informações do filhote ${i} antes de diminuir o número total de filhotes.`
          );
        }

        if (hasAnyValue) {
          const microchipDigits = mcRaw
            ? normalizeMicrochip(mcRaw)
            : null;

          kittensData.push({
            index: i,
            name: nameSuffix || null, // Nome (sem o gatil)
            breed: breed || null,
            emsEyes: ems || null,
            sex: sex || null,
            microchip: microchipDigits,
            breeding: breeding || null,
            obs: null, // por enquanto não usamos obs individual
          });
        }
      }

      console.log("DEBUG LITTER POST - kittensData:", kittensData);

      if (!importedLitter) {
        const birthDay = sameUtcDay(litterBirthDateObj);
        if (birthDay) {
          const motherFilters = [
            ...(femaleMicrochip ? [{ femaleMicrochip }] : []),
            ...(femaleName ? [{ femaleName }] : []),
          ];
          const duplicateByMother = motherFilters.length
            ? await prisma.litter.findFirst({
                where: {
                  ownerId: userId,
                  litterBirthDate: { gte: birthDay, lt: nextUtcDay(birthDay) },
                  OR: motherFilters,
                },
                select: { id: true },
              })
            : null;

          if (duplicateByMother) {
            throw requiredFieldError("Esta ninhada já foi registrada em Ninhadas. Use o botão Importar Ninhada para enviar o Registro de Ninhada.");
          }
        }

        const kittenMicrochips = kittensData.map((kitten) => kitten.microchip).filter(Boolean);
        if (kittenMicrochips.length) {
          const duplicatedKittenMicrochip = await prisma.litterKitten.findFirst({
            where: { microchip: { in: kittenMicrochips } },
            select: { microchip: true },
          });
          const duplicatedCatMicrochip = await prisma.cat.findFirst({
            where: { microchip: { in: kittenMicrochips } },
            select: { microchip: true },
          });

          if (duplicatedKittenMicrochip || duplicatedCatMicrochip) {
            throw requiredFieldError("Um dos microchips dos filhotes já foi registrado. Use o botão Importar Ninhada para enviar a ninhada cadastrada anteriormente.");
          }
        }
      }

      const litterData = {
          owner: {
  connect: { id: userId },
},

maleOwnership: isMaleNotOwner ? "NOT_OWNER" : "OWNER",

          externalOwnerAuthorization: isMaleNotOwner
  ? authorizationFile
  : null,

          // Macho
          maleName,
          maleFfbLo: maleFfbLo || null,
          maleBreed,
          maleEms,
          maleMicrochip,

          // Fêmea 
          femaleName,
          femaleFfbLo: femaleFfbLo || null,
          femaleBreed,
          femaleEms,
          femaleMicrochip,

          // Novo proprietário do macho (apenas se marcado)
         externalOwnerName: isMaleNotOwner ? externalOwnerName || null : null,
externalOwnerEmail: isMaleNotOwner ? externalOwnerEmail || null : null,
externalOwnerCpf: isMaleNotOwner ? formatCpf(externalOwnerCpf) || null : null,
externalOwnerPhone: isMaleNotOwner ? formatPhone(externalOwnerPhone) || null : null,
externalOwnerCattery: isMaleNotOwner ? externalOwnerCattery || null : null,

          // Ninhada
          catteryName: req.body.catteryName || null,
          catteryCountry: catteryCountry || null,
          litterBreed: litterBreed || null,
          litterCount: litterCountInt,
          litterBirthDate: litterBirthDateObj,

          // Recebimento/assinaturas – por enquanto não usados
          receivedDate: null,
          sireSignature: null,
          damSignature: null,

          // Filhotes
          kittens: {
            create: kittensData,
          },
        };

      // 1) CRIA A NINHADA + FILHOTES
      const litter = await prisma.litter.create({
        data: litterData,
        include: {
          kittens: true,
        },
      });

      console.log("DEBUG LITTER CREATED:", litter);

      console.log("DEBUG MALE OWNERSHIP:", req.body.maleOwnership);
console.log("DEBUG EXTERNAL OWNER DATA:", {
  externalOwnerName,
  externalOwnerEmail,
  externalOwnerCpf,
  externalOwnerPhone,
  externalOwnerCattery,
});
console.log("DEBUG AUTH FILE:", authorizationFile);


      // 2) CRIA O SERVICE REQUEST VINCULADO A ESSA NINHADA
      const service = await prisma.serviceRequest.create({
        data: {
          userId,
          litterId: litter.id,
          type: "Registro de Ninhada",
          description: `Registro de ninhada #${litter.id}`,
          status: "ENVIADO_GATARINA",
          statuses: {
            create: {
              status: "ENVIADO_GATARINA",
            },
          },
        },
      });

      await notifyNewService(prisma, service);
      await notifyUserServiceConfirmation(prisma, service);

      res.redirect("/my-services");
    } catch (err) {
      console.error("ERRO COMPLETO AO SALVAR NINHADA:");
      console.error(err);

      if (err.code) {
        console.error("PRISMA ERROR CODE:", err.code);
      }

      if (err.meta) {
        console.error("PRISMA META:", err.meta);
      }

      res
        .status(err.status || 500)
        .send(err.status ? err.message : "Erro ao salvar registro de ninhada");
    }


  });

  // ---------- LISTAGEM DE NINHADAS (JSON) ----------
  router.get("/litters", requireAuth, async (req, res) => {
    const { userId } = getAuthInfo(req);
    const where = { ownerId: userId };

    try {
      const litters = await prisma.litter.findMany({
        where,
        orderBy: { id: "desc" },
        include: {
          kittens: { orderBy: { index: "asc" } },
        },
      });

      res.json(litters);
    } catch (err) {
      console.error("Erro ao listar ninhadas:", err);
      res.status(500).send("Erro ao listar ninhadas");
    }
  });

  return router;
};
