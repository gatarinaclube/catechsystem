const express = require("express");
const { canViewAllData, dataOwnerScope } = require("../utils/access");
const { getCreationLimits, yearlyRange } = require("../utils/planLimits");
const { selectedBreedsFromSettings } = require("../utils/userPreferences");
const { ensureMicrochipWhenRequired } = require("../utils/microchipRules");

const DEATH_CAUSES_AT_BIRTH = [
  "Fenda Palatina",
  "Deformidade",
  "Eviceração",
  "Prematuro",
  "Indefinido",
  "Baixo Peso",
];

const DEATH_CAUSES_AFTER_BIRTH = [
  "Fenda Palatina",
  "Deformidade",
  "Eviceração",
  "Prematuro",
  "Indefinido",
  "Trauma",
  "Inapetência",
  "Baixo Peso",
];

function calculateAgeLabel(date) {
  if (!date) return "-";
  const birth = new Date(date);
  if (Number.isNaN(birth.getTime())) return "-";

  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();

  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return `${years} ${years === 1 ? "ano" : "anos"} e ${months} ${months === 1 ? "mês" : "meses"}`;
}

function normalizeMicrochip(value) {
  return value ? String(value).replace(/\D/g, "").slice(0, 15) : null;
}

function formatDateForInput(date) {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${parsed.getFullYear()}`;
}

function isCatFromLitter(cat) {
  return Boolean(cat.kittenNumber || cat.litterKitten);
}

function canAppearAsLitterParent(cat) {
  if (!isCatFromLitter(cat)) {
    return true;
  }

  return cat.breedingProspect === true;
}

function getFullCatName(cat, catteryName = "") {
  const cleanCatteryName = String(catteryName || "").trim();
  const baseName = String(cat.name || "").trim();
  const displayBaseName =
    cleanCatteryName &&
    isCatFromLitter(cat) &&
    !baseName.toLowerCase().startsWith(`${cleanCatteryName.toLowerCase()} `)
      ? `${cleanCatteryName} ${baseName}`
      : baseName;

  return [
    cat.country ? `${cat.country}*` : null,
    displayBaseName,
  ].filter(Boolean).join(" ");
}

function buildLitterLabel(litter) {
  return `${litter.litterNumber || String(litter.id).padStart(3, "0")} - ${litter.femaleName || "Fêmea"} X ${litter.maleName || "Macho"} - ${formatDateForInput(litter.litterBirthDate) || "-"}`;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseDeathCauses(body, fieldName, count, allowedCauses) {
  const selected = []
    .concat(body[fieldName] || [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, count);

  if (selected.length < count) {
    throw new Error("Informe a causa de morte para cada filhote registrado em óbito.");
  }

  return selected.map((cause, index) => {
    if (!allowedCauses.includes(cause)) {
      throw new Error(`Informe uma causa válida para o óbito ${index + 1}.`);
    }
    return cause;
  });
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  function ownerScope(req) {
    return dataOwnerScope(req);
  }

  async function ensureLitterCreationLimits(req, newKittenCount = 0) {
    if (canViewAllData(req.session?.userRole)) return;

    const limits = getCreationLimits(req.session?.userRole);
    const { start, end } = yearlyRange();

    if (limits.littersPerYear !== null) {
      const litterCount = await prisma.litter.count({
        where: {
          ownerId: req.session.userId,
          createdAt: { gte: start, lt: end },
        },
      });

      if (litterCount >= limits.littersPerYear) {
        throw new Error(`Seu perfil permite até ${limits.littersPerYear} cadastros de ninhadas por ano.`);
      }
    }

    if (limits.kittensPerYear !== null && newKittenCount > 0) {
      await ensureKittenCreationLimit(req, newKittenCount);
    }
  }

  async function ensureKittenCreationLimit(req, newKittenCount = 0) {
    if (canViewAllData(req.session?.userRole)) return;

    const limit = getCreationLimits(req.session?.userRole).kittensPerYear;
    if (limit === null || newKittenCount <= 0) return;
    const { start, end } = yearlyRange();

    const kittenCount = await prisma.cat.count({
      where: {
        ownerId: req.session.userId,
        OR: [
          { kittenNumber: { not: null } },
          { litterKitten: { isNot: null } },
        ],
        createdAt: { gte: start, lt: end },
      },
    });

    if (kittenCount + newKittenCount > limit) {
      throw new Error(`Seu perfil permite até ${limit} cadastros de filhotes por ano.`);
    }
  }

  async function ensureLitterAccess(req, litterId) {
    const litter = await prisma.litter.findFirst({
      where: { id: litterId, ...ownerScope(req) },
      select: { id: true },
    });
    return Boolean(litter);
  }

  async function ensureCatAccess(req, catId) {
    if (!catId) return true;
    const cat = await prisma.cat.findFirst({
      where: { id: catId, ...ownerScope(req) },
      select: { id: true },
    });
    return Boolean(cat);
  }

  async function getCatteryNameForUser(userId, litter = null) {
    const settingsRows = await prisma.$queryRaw`
      SELECT "catteryName"
      FROM "UserSettings"
      WHERE "userId" = ${userId}
      LIMIT 1
    `;

    return (settingsRows[0]?.catteryName || litter?.catteryName || "").trim();
  }

  function getKittenNameMaxLength(catteryName) {
    return Math.max(1, 30 - (catteryName ? catteryName.length + 1 : 0));
  }

  async function buildFormContext(req, litter = null, error = null) {
    const ownerIdForSettings = litter?.ownerId || req.session.userId;
    const catteryName = await getCatteryNameForUser(
      ownerIdForSettings,
      litter
    );
    const kittenNameMaxLength = getKittenNameMaxLength(catteryName);
    const ownerSettings = await prisma.userSettings.findUnique({
      where: { userId: ownerIdForSettings },
      select: { breedsJson: true },
    });

    const scopedOwner = ownerScope(req);
    const females = await prisma.cat.findMany({
      where: {
        ...scopedOwner,
        gender: "F",
      },
      include: {
        litterKitten: true,
      },
      orderBy: { name: "asc" },
    });

    const males = await prisma.cat.findMany({
      where: {
        ...scopedOwner,
        gender: "M",
      },
      include: {
        litterKitten: true,
      },
      orderBy: { name: "asc" },
    });

    const catOwnerIds = Array.from(
      new Set([...females, ...males].map((cat) => cat.ownerId).filter(Boolean))
    );
    const settingsRows = catOwnerIds.length
      ? await prisma.userSettings.findMany({
          where: { userId: { in: catOwnerIds } },
          select: { userId: true, catteryName: true },
        })
      : [];
    const catteryNameByUserId = new Map(
      settingsRows.map((settings) => [settings.userId, settings.catteryName || ""])
    );

    const kittens = litter?.kittens?.length
      ? litter.kittens
      : [];
    const selectedBreeds = selectedBreedsFromSettings(ownerSettings, [
      litter?.litterBreed,
      ...kittens.map((kitten) => kitten.breed),
    ]);

    return {
      user: req.user,
      currentPath: req.path,
      females: females.filter(canAppearAsLitterParent).map((cat) => ({
        ...cat,
        displayName: getFullCatName(cat, catteryNameByUserId.get(cat.ownerId) || catteryName),
      })),
      males: males.filter(canAppearAsLitterParent).map((cat) => ({
        ...cat,
        displayName: getFullCatName(cat, catteryNameByUserId.get(cat.ownerId) || catteryName),
      })),
      breeds: selectedBreeds,
      deathCausesAtBirth: DEATH_CAUSES_AT_BIRTH,
      deathCausesAfterBirth: DEATH_CAUSES_AFTER_BIRTH,
      deadAtBirthCauses: parseJsonArray(litter?.deadAtBirthCausesJson),
      deadAfterBirthCauses: parseJsonArray(litter?.deadAfterBirthCausesJson),
      litter,
      kittens,
      catteryName,
      kittenNameMaxLength,
      error,
      success: false,
    };
  }

  async function ensureUniqueMicrochips(kittens, currentLitterId = null) {
    const seen = new Set();
    for (const kitten of kittens) {
      const mc = normalizeMicrochip(kitten.microchip);
      if (!mc) continue;

      if (seen.has(mc)) {
        const error = new Error("Existe microchip repetido entre os filhotes desta ninhada.");
        error.code = "DUPLICATE_KITTEN_MICROCHIP";
        throw error;
      }
      seen.add(mc);

      const existingCat = await prisma.cat.findUnique({
        where: { microchip: mc },
      });
      if (existingCat && !kitten.kittenCatId) {
        const error = new Error(`O microchip ${mc} já está cadastrado em outro gato.`);
        error.code = "DUPLICATE_CAT_MICROCHIP";
        throw error;
      }
      if (existingCat && kitten.kittenCatId && existingCat.id !== kitten.kittenCatId) {
        const error = new Error(`O microchip ${mc} já está cadastrado em outro gato.`);
        error.code = "DUPLICATE_CAT_MICROCHIP";
        throw error;
      }
    }

    const filters = seen.size ? Array.from(seen) : [];
    if (!filters.length) return;

    const existingKittens = await prisma.litterKitten.findMany({
      where: {
        microchip: { in: filters },
        ...(currentLitterId ? { NOT: { litterId: currentLitterId } } : {}),
      },
    });

    if (existingKittens.length) {
      const error = new Error("Um dos microchips já está vinculado a outro filhote.");
      error.code = "DUPLICATE_KITTEN_MICROCHIP";
      throw error;
    }
  }

  function parseKittenRows(body, existingKittens = [], kittenNameMaxLength = 30) {
    const femaleCount = Number(body.femaleCount || 0);
    const maleCount = Number(body.maleCount || 0);
    const litterCount = femaleCount + maleCount;
    const kittens = [];

    for (let i = 0; i < litterCount; i += 1) {
      const existing = existingKittens[i] || null;
      kittens.push({
        existingId: body[`kitten_id_${i}`] ? Number(body[`kitten_id_${i}`]) : existing?.id || null,
        kittenCatId: body[`kitten_cat_id_${i}`] ? Number(body[`kitten_cat_id_${i}`]) : existing?.kittenCatId || null,
        index: i + 1,
        kittenNumber: body[`kitten_number_${i}`] || null,
        name: body[`kitten_name_${i}`]
          ? body[`kitten_name_${i}`].trim().slice(0, kittenNameMaxLength)
          : null,
        sex: body[`kitten_sex_${i}`] || null,
        breed: body[`kitten_breed_${i}`] || null,
        emsEyes: body[`kitten_ems_${i}`] || null,
        microchip: normalizeMicrochip(body[`kitten_microchip_${i}`]),
        breeding: body[`kitten_breeding_${i}`] || null,
        breedingRole: null,
        deceased: body[`kitten_deceased_${i}`] === "on",
      });
    }

    return { femaleCount, maleCount, litterCount, kittens };
  }

  function ensureKittensMicrochipRules(kittens, litterBirthDate) {
    kittens.forEach((kitten) => {
      ensureMicrochipWhenRequired({
        microchip: kitten.microchip,
        birthDate: litterBirthDate,
        deceased: kitten.deceased === true,
        label: `Filhote ${kitten.index}`,
        allowUnderFourMonths: true,
      });
    });
  }

  async function syncKittenCat(tx, litter, kitten, motherCat, fatherCat) {
    const catPayload = {
      ownerId: litter.ownerId,
      country: motherCat?.country || fatherCat?.country || null,
      titleBeforeName: null,
      titleAfterName: null,
      name: kitten.name || "",
      kittenNumber: kitten.kittenNumber || null,
      microchip: kitten.microchip,
      birthDate: litter.litterBirthDate || null,
      gender: kitten.sex || null,
      neutered: kitten.breeding === "NOT_FOR_BREEDING",
      breed: kitten.breed || litter.litterBreed || null,
      emsCode: kitten.emsEyes || null,
      pedigreeType: null,
      pedigreeNumber: null,
      breederType: "Eu Mesmo",
      breederName: null,
      ownershipType: "OWNER",
      currentOwnerId: litter.ownerId,
      delivered: false,
      fatherId: fatherCat?.id || null,
      fatherName: fatherCat?.name || litter.maleName || null,
      fatherBreed: fatherCat?.breed || litter.maleBreed || null,
      fatherEmsCode: fatherCat?.emsCode || litter.maleEms || null,
      motherId: motherCat?.id || null,
      motherName: motherCat?.name || litter.femaleName || null,
      motherBreed: motherCat?.breed || litter.femaleBreed || null,
      motherEmsCode: motherCat?.emsCode || litter.femaleEms || null,
      deceased: kitten.deceased,
      status: "APROVADO",
    };

    if (kitten.kittenCatId) {
      await tx.cat.update({
        where: { id: kitten.kittenCatId },
        data: {
          ...catPayload,
          ...(kitten.deceased ? { kittenAvailabilityStatus: "DECEASED" } : {}),
        },
      });
      return kitten.kittenCatId;
    }

    const created = await tx.cat.create({
      data: {
        ...catPayload,
        kittenAvailabilityStatus: kitten.deceased ? "DECEASED" : "UNAVAILABLE",
      },
    });
    return created.id;
  }

  async function persistLitter(tx, payload, existingLitter = null) {
    const motherCat = payload.femaleCatId
      ? await tx.cat.findUnique({ where: { id: payload.femaleCatId } })
      : null;
    const fatherCat = payload.maleCatId
      ? await tx.cat.findUnique({ where: { id: payload.maleCatId } })
      : null;

    const litterData = {
      ownerId: payload.ownerId || existingLitter?.ownerId || null,
      litterNumber: payload.litterNumber,
      femaleName: motherCat?.name || null,
      femaleBreed: motherCat?.breed || null,
      femaleEms: motherCat?.emsCode || null,
      femaleMicrochip: motherCat?.microchip || null,
      maleName: fatherCat?.name || null,
      maleBreed: fatherCat?.breed || null,
      maleEms: fatherCat?.emsCode || null,
      maleMicrochip: fatherCat?.microchip || null,
      litterBirthDate: payload.litterBirthDate,
      femaleCount: payload.femaleCount,
      maleCount: payload.maleCount,
      litterCount: payload.litterCount,
      deadCount: payload.deadCount,
      deadAtBirthCount: payload.deadAtBirthCount,
      deadAtBirthMaleCount: payload.deadAtBirthMaleCount,
      deadAtBirthFemaleCount: payload.deadAtBirthFemaleCount,
      deadAtBirthCausesJson: JSON.stringify(payload.deadAtBirthCauses || []),
      deadAfterBirthCount: payload.deadAfterBirthCount,
      deadAfterBirthMaleCount: payload.deadAfterBirthMaleCount,
      deadAfterBirthFemaleCount: payload.deadAfterBirthFemaleCount,
      deadAfterBirthCausesJson: JSON.stringify(payload.deadAfterBirthCauses || []),
      historyNotes: payload.historyNotes || null,
      litterBreed: payload.kittens[0]?.breed || existingLitter?.litterBreed || null,
      catteryName: payload.catteryName || existingLitter?.catteryName || null,
    };

    const litter = existingLitter
      ? await tx.litter.update({ where: { id: existingLitter.id }, data: litterData })
      : await tx.litter.create({ data: litterData });

    const existingIds = new Set((existingLitter?.kittens || []).map((kitten) => kitten.id));
    const keptIds = new Set();

    for (const kitten of payload.kittens) {
      const kittenCatId = await syncKittenCat(tx, litter, kitten, motherCat, fatherCat);
      const kittenData = {
        index: kitten.index,
        kittenNumber: kitten.kittenNumber,
        name: kitten.name,
        breed: kitten.breed,
        emsEyes: kitten.emsEyes,
        sex: kitten.sex,
        microchip: kitten.microchip,
        breeding: kitten.breeding,
        breedingRole: kitten.breedingRole,
        deceased: kitten.deceased,
        kittenCatId,
      };

      if (kitten.existingId) {
        keptIds.add(kitten.existingId);
        await tx.litterKitten.update({
          where: { id: kitten.existingId },
          data: kittenData,
        });
      } else {
        const created = await tx.litterKitten.create({
          data: {
            litterId: litter.id,
            ...kittenData,
          },
        });
        keptIds.add(created.id);
      }
    }

    for (const existingId of existingIds) {
      if (!keptIds.has(existingId)) {
        const kitten = existingLitter.kittens.find((item) => item.id === existingId);
        if (kitten?.kittenCatId) {
          await tx.cat.delete({ where: { id: kitten.kittenCatId } });
        }
        await tx.litterKitten.delete({ where: { id: existingId } });
      }
    }

    return litter;
  }

  router.get(
    "/admin/litters",
    requireAuth,
    requirePermission("admin.litters"),
    async (req, res) => {
      const selectedOwnerId = null;
      const users = [];
      const litters = await prisma.litter.findMany({
        where: ownerScope(req),
        orderBy: [{ litterBirthDate: "desc" }, { litterNumber: "desc" }, { id: "desc" }],
      });

      res.render("admin-litters/list", {
        user: req.user,
        currentPath: req.path,
        users,
        selectedOwnerId,
        litters: litters.map((litter) => ({
          ...litter,
          label: buildLitterLabel(litter),
        })),
      });
    }
  );

  router.get(
    "/admin/litters/new",
    requireAuth,
    requirePermission("admin.litters"),
    async (req, res) => {
      res.render("admin-litters/form", {
        ...(await buildFormContext(req, null)),
        formTitle: "Nova Ninhada",
        formAction: "/admin/litters",
        cancelPath: "/admin/litters",
      });
    }
  );

  router.post(
    "/admin/litters",
    requireAuth,
    requirePermission("admin.litters"),
    async (req, res) => {
      try {
        const catteryName = await getCatteryNameForUser(req.session.userId);
        const kittenNameMaxLength = getKittenNameMaxLength(catteryName);
        const { femaleCount, maleCount, litterCount, kittens } = parseKittenRows(
          req.body,
          [],
          kittenNameMaxLength
        );
        await ensureLitterCreationLimits(req, kittens.length);
        await ensureUniqueMicrochips(kittens);
        const deadAtBirthCount = Number(req.body.deadAtBirthCount || 0);
        const deadAfterBirthCount = Number(req.body.deadAfterBirthCount || 0);
        const deadAtBirthCauses = parseDeathCauses(
          req.body,
          "deadAtBirthCause",
          deadAtBirthCount,
          DEATH_CAUSES_AT_BIRTH
        );
        const deadAfterBirthCauses = parseDeathCauses(
          req.body,
          "deadAfterBirthCause",
          deadAfterBirthCount,
          DEATH_CAUSES_AFTER_BIRTH
        );
        const litterBirthDate = req.body.litterBirthDate ? new Date(req.body.litterBirthDate) : null;
        ensureKittensMicrochipRules(kittens, litterBirthDate);

        const payload = {
          ownerId: req.session.userId,
          catteryName,
          litterNumber: req.body.litterNumber?.trim().slice(0, 5).padStart(3, "0") || null,
          femaleCatId: req.body.femaleCatId ? Number(req.body.femaleCatId) : null,
          maleCatId: req.body.maleCatId ? Number(req.body.maleCatId) : null,
          litterBirthDate,
          femaleCount,
          maleCount,
          litterCount,
          kittens,
          deadCount: deadAtBirthCount + deadAfterBirthCount,
          deadAtBirthCount,
          deadAtBirthMaleCount: Number(req.body.deadAtBirthMaleCount || 0),
          deadAtBirthFemaleCount: Number(req.body.deadAtBirthFemaleCount || 0),
          deadAtBirthCauses,
          deadAfterBirthCount,
          deadAfterBirthMaleCount: Number(req.body.deadAfterBirthMaleCount || 0),
          deadAfterBirthFemaleCount: Number(req.body.deadAfterBirthFemaleCount || 0),
          deadAfterBirthCauses,
          historyNotes: req.body.historyNotes || null,
        };

        if (
          !(await ensureCatAccess(req, payload.femaleCatId)) ||
          !(await ensureCatAccess(req, payload.maleCatId))
        ) {
          return res.status(403).send("Você não pode usar gatos de outro cadastro.");
        }

        const litter = await prisma.$transaction(async (tx) =>
          persistLitter(tx, payload, null)
        );

        res.redirect(`/admin/litters/${litter.id}?saved=1`);
      } catch (err) {
        const litter = {
          ...req.body,
          deadAtBirthCausesJson: JSON.stringify([].concat(req.body.deadAtBirthCause || []).filter(Boolean)),
          deadAfterBirthCausesJson: JSON.stringify([].concat(req.body.deadAfterBirthCause || []).filter(Boolean)),
          kittens: parseKittenRows(req.body).kittens,
        };

        res.status(400).render("admin-litters/form", {
          ...(await buildFormContext(req, litter, err.message || "Erro ao salvar a ninhada.")),
          formTitle: "Nova Ninhada",
          formAction: "/admin/litters",
          cancelPath: "/admin/litters",
        });
      }
    }
  );

  router.get(
    "/admin/litters/:id",
    requireAuth,
    requirePermission("admin.litters"),
    async (req, res) => {
      const litter = await prisma.litter.findUnique({
        where: { id: Number(req.params.id) },
        include: {
          kittens: { orderBy: { index: "asc" } },
        },
      });

      if (!litter) {
        return res.status(404).send("Ninhada não encontrada.");
      }

      if (!(await ensureLitterAccess(req, litter.id))) {
        return res.status(403).send("Você não tem acesso a esta ninhada.");
      }

      res.render("admin-litters/form", {
        ...(await buildFormContext(req, litter)),
        formTitle: "Editar Ninhada",
        formAction: `/admin/litters/${litter.id}`,
        cancelPath: "/admin/litters",
        success: req.query.saved === "1",
      });
    }
  );

  router.post(
    "/admin/litters/:id",
    requireAuth,
    requirePermission("admin.litters"),
    async (req, res) => {
      const existingLitter = await prisma.litter.findUnique({
        where: { id: Number(req.params.id) },
        include: { kittens: { orderBy: { index: "asc" } } },
      });

      if (!existingLitter) {
        return res.status(404).send("Ninhada não encontrada.");
      }

      if (!(await ensureLitterAccess(req, existingLitter.id))) {
        return res.status(403).send("Você não pode editar esta ninhada.");
      }

      try {
        const catteryName = await getCatteryNameForUser(
          existingLitter.ownerId || req.session.userId,
          existingLitter
        );
        const kittenNameMaxLength = getKittenNameMaxLength(catteryName);
        const { femaleCount, maleCount, litterCount, kittens } = parseKittenRows(
          req.body,
          existingLitter.kittens,
          kittenNameMaxLength
        );
        await ensureKittenCreationLimit(
          req,
          Math.max(0, kittens.length - existingLitter.kittens.length)
        );
        await ensureUniqueMicrochips(kittens, existingLitter.id);
        const deadAtBirthCount = Number(req.body.deadAtBirthCount || 0);
        const deadAfterBirthCount = Number(req.body.deadAfterBirthCount || 0);
        const deadAtBirthCauses = parseDeathCauses(
          req.body,
          "deadAtBirthCause",
          deadAtBirthCount,
          DEATH_CAUSES_AT_BIRTH
        );
        const deadAfterBirthCauses = parseDeathCauses(
          req.body,
          "deadAfterBirthCause",
          deadAfterBirthCount,
          DEATH_CAUSES_AFTER_BIRTH
        );
        const litterBirthDate = req.body.litterBirthDate ? new Date(req.body.litterBirthDate) : null;
        ensureKittensMicrochipRules(kittens, litterBirthDate);

        const payload = {
          ownerId: existingLitter.ownerId || req.session.userId,
          catteryName,
          litterNumber: req.body.litterNumber?.trim().slice(0, 5).padStart(3, "0") || null,
          femaleCatId: req.body.femaleCatId ? Number(req.body.femaleCatId) : null,
          maleCatId: req.body.maleCatId ? Number(req.body.maleCatId) : null,
          litterBirthDate,
          femaleCount,
          maleCount,
          litterCount,
          kittens,
          deadCount: deadAtBirthCount + deadAfterBirthCount,
          deadAtBirthCount,
          deadAtBirthMaleCount: Number(req.body.deadAtBirthMaleCount || 0),
          deadAtBirthFemaleCount: Number(req.body.deadAtBirthFemaleCount || 0),
          deadAtBirthCauses,
          deadAfterBirthCount,
          deadAfterBirthMaleCount: Number(req.body.deadAfterBirthMaleCount || 0),
          deadAfterBirthFemaleCount: Number(req.body.deadAfterBirthFemaleCount || 0),
          deadAfterBirthCauses,
          historyNotes: req.body.historyNotes || null,
        };

        if (
          !(await ensureCatAccess(req, payload.femaleCatId)) ||
          !(await ensureCatAccess(req, payload.maleCatId))
        ) {
          return res.status(403).send("Você não pode usar gatos de outro cadastro.");
        }

        await prisma.$transaction(async (tx) =>
          persistLitter(tx, payload, existingLitter)
        );

        res.redirect(`/admin/litters/${existingLitter.id}?saved=1`);
      } catch (err) {
        const litter = {
          ...existingLitter,
          ...req.body,
          deadAtBirthCausesJson: JSON.stringify([].concat(req.body.deadAtBirthCause || []).filter(Boolean)),
          deadAfterBirthCausesJson: JSON.stringify([].concat(req.body.deadAfterBirthCause || []).filter(Boolean)),
          kittens: parseKittenRows(req.body, existingLitter.kittens).kittens,
        };
        res.status(400).render("admin-litters/form", {
          ...(await buildFormContext(req, litter, err.message || "Erro ao atualizar a ninhada.")),
          formTitle: "Editar Ninhada",
          formAction: `/admin/litters/${existingLitter.id}`,
          cancelPath: "/admin/litters",
        });
      }
    }
  );

  return router;
};
