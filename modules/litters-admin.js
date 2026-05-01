const express = require("express");

const BREEDS = [
  "ABY","SOM","ACL","ACS","BAL","SIA","BEN","BLH","BSH","BML","BOM","BUR",
  "CHA","CRX","DRX","DSP","EUR","EXO","PER","GRX","HCL","HCS","JBS","KBL",
  "KBS","KOR","LPL","LPS","LYO","MAU","MCO","NEM","NFO","OCI","OLH","OSH",
  "PEB","RAG","RUS","SBI","SIB","SNO","SOK","SPH","SRL","SRS","THA","TUA","TUV"
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

function getFullCatName(cat) {
  return [
    cat.titleBeforeName,
    cat.country ? `${cat.country}*` : null,
    cat.name,
    cat.titleAfterName,
  ].filter(Boolean).join(" ");
}

function buildLitterLabel(litter) {
  return `${litter.litterNumber || String(litter.id).padStart(3, "0")} - ${litter.femaleName || "Fêmea"} X ${litter.maleName || "Macho"} - ${formatDateForInput(litter.litterBirthDate) || "-"}`;
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  async function buildFormContext(req, litter = null, error = null) {
    const females = await prisma.cat.findMany({
      where: {
        gender: "F",
        neutered: false,
        OR: [{ deceased: false }, { deceased: null }],
      },
      orderBy: { name: "asc" },
    });

    const males = await prisma.cat.findMany({
      where: {
        gender: "M",
        neutered: false,
        OR: [{ deceased: false }, { deceased: null }],
      },
      orderBy: { name: "asc" },
    });

    const kittens = litter?.kittens?.length
      ? litter.kittens
      : [];

    return {
      user: req.user,
      currentPath: req.path,
      females,
      males,
      breeds: BREEDS,
      litter,
      kittens,
      error,
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

  function parseKittenRows(body, existingKittens = []) {
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
        name: body[`kitten_name_${i}`] || null,
        sex: body[`kitten_sex_${i}`] || null,
        breed: body[`kitten_breed_${i}`] || null,
        emsEyes: body[`kitten_ems_${i}`] || null,
        microchip: normalizeMicrochip(body[`kitten_microchip_${i}`]),
        breeding: body[`kitten_breeding_${i}`] || null,
        breedingRole: body[`kitten_breeding_role_${i}`] || null,
        deceased: body[`kitten_deceased_${i}`] === "on",
      });
    }

    return { femaleCount, maleCount, litterCount, kittens };
  }

  async function syncKittenCat(tx, litter, kitten, motherCat, fatherCat) {
    const catPayload = {
      ownerId: litter.ownerId,
      country: motherCat?.country || fatherCat?.country || null,
      titleBeforeName: null,
      titleAfterName: null,
      name: kitten.name || `Filhote ${kitten.index}`,
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
        data: catPayload,
      });
      return kitten.kittenCatId;
    }

    const created = await tx.cat.create({
      data: catPayload,
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
      deadAfterBirthCount: payload.deadAfterBirthCount,
      deadAfterBirthMaleCount: payload.deadAfterBirthMaleCount,
      deadAfterBirthFemaleCount: payload.deadAfterBirthFemaleCount,
      historyNotes: payload.historyNotes || null,
      litterBreed: payload.kittens[0]?.breed || existingLitter?.litterBreed || null,
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
      const selectedOwnerId = req.query.ownerId ? Number(req.query.ownerId) : null;
      const users = await prisma.user.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true },
      });
      const litters = await prisma.litter.findMany({
        where: selectedOwnerId ? { ownerId: selectedOwnerId } : {},
        orderBy: [{ litterNumber: "asc" }, { id: "asc" }],
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
        const { femaleCount, maleCount, litterCount, kittens } = parseKittenRows(req.body);
        await ensureUniqueMicrochips(kittens);

        const payload = {
          ownerId: req.session.userId,
          litterNumber: req.body.litterNumber?.padStart(3, "0") || null,
          femaleCatId: req.body.femaleCatId ? Number(req.body.femaleCatId) : null,
          maleCatId: req.body.maleCatId ? Number(req.body.maleCatId) : null,
          litterBirthDate: req.body.litterBirthDate ? new Date(req.body.litterBirthDate) : null,
          femaleCount,
          maleCount,
          litterCount,
          kittens,
          deadCount: Number(req.body.deadCount || 0),
          deadAtBirthCount: Number(req.body.deadAtBirthCount || 0),
          deadAtBirthMaleCount: Number(req.body.deadAtBirthMaleCount || 0),
          deadAtBirthFemaleCount: Number(req.body.deadAtBirthFemaleCount || 0),
          deadAfterBirthCount: Number(req.body.deadAfterBirthCount || 0),
          deadAfterBirthMaleCount: Number(req.body.deadAfterBirthMaleCount || 0),
          deadAfterBirthFemaleCount: Number(req.body.deadAfterBirthFemaleCount || 0),
          historyNotes: req.body.historyNotes || null,
        };

        const litter = await prisma.$transaction(async (tx) =>
          persistLitter(tx, payload, null)
        );

        res.redirect(`/admin/litters/${litter.id}`);
      } catch (err) {
        const litter = {
          ...req.body,
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

      res.render("admin-litters/form", {
        ...(await buildFormContext(req, litter)),
        formTitle: "Editar Ninhada",
        formAction: `/admin/litters/${litter.id}`,
        cancelPath: "/admin/litters",
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

      try {
        const { femaleCount, maleCount, litterCount, kittens } = parseKittenRows(
          req.body,
          existingLitter.kittens
        );
        await ensureUniqueMicrochips(kittens, existingLitter.id);

        const payload = {
          ownerId: existingLitter.ownerId || req.session.userId,
          litterNumber: req.body.litterNumber?.padStart(3, "0") || null,
          femaleCatId: req.body.femaleCatId ? Number(req.body.femaleCatId) : null,
          maleCatId: req.body.maleCatId ? Number(req.body.maleCatId) : null,
          litterBirthDate: req.body.litterBirthDate ? new Date(req.body.litterBirthDate) : null,
          femaleCount,
          maleCount,
          litterCount,
          kittens,
          deadCount: Number(req.body.deadCount || 0),
          deadAtBirthCount: Number(req.body.deadAtBirthCount || 0),
          deadAtBirthMaleCount: Number(req.body.deadAtBirthMaleCount || 0),
          deadAtBirthFemaleCount: Number(req.body.deadAtBirthFemaleCount || 0),
          deadAfterBirthCount: Number(req.body.deadAfterBirthCount || 0),
          deadAfterBirthMaleCount: Number(req.body.deadAfterBirthMaleCount || 0),
          deadAfterBirthFemaleCount: Number(req.body.deadAfterBirthFemaleCount || 0),
          historyNotes: req.body.historyNotes || null,
        };

        await prisma.$transaction(async (tx) =>
          persistLitter(tx, payload, existingLitter)
        );

        res.redirect(`/admin/litters/${existingLitter.id}`);
      } catch (err) {
        const litter = {
          ...existingLitter,
          ...req.body,
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
