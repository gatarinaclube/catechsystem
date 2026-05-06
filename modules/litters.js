const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { isAdminRole, normalizeRole } = require("../utils/access");

const baseUploadsDir =
  process.env.UPLOADS_DIR
    ? path.join(process.env.UPLOADS_DIR, "uploads")
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

const upload = multer({ storage });

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

      // machos e fêmeas do próprio usuário
      const maleCats = await prisma.cat.findMany({
        where: { ownerId: userId, gender: "M" },
        orderBy: { name: "asc" },
      });

      const femaleCats = await prisma.cat.findMany({
        where: { ownerId: userId, gender: "F" },
        orderBy: { name: "asc" },
      });

      res.render("litters/new", {
        user: req.user,
        currentPath: req.path,
        maleCats,
        femaleCats,
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


      // ----- Buscar dados do macho selecionado -----
      let maleName = null;
      let maleBreed = null;
      let maleEms = null;
      let maleMicrochip = null;

      if (maleCatId) {
        const maleCat = await prisma.cat.findUnique({
          where: { id: Number(maleCatId) },
        });

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
        const femaleCat = await prisma.cat.findUnique({
          where: { id: Number(femaleCatId) },
        });

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
            ? mcRaw.replace(/\D/g, "").slice(0, 15)
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

      // 1) CRIA A NINHADA + FILHOTES
      const litter = await prisma.litter.create({
        data: {
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
externalOwnerCpf: isMaleNotOwner ? externalOwnerCpf || null : null,
externalOwnerPhone: isMaleNotOwner ? externalOwnerPhone || null : null,
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
        },
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
      await prisma.serviceRequest.create({
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
    const { userId, isAdmin } = getAuthInfo(req);
    const where = isAdmin ? {} : { ownerId: userId };

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
