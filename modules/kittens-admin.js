const express = require("express");

const BREEDS = [
  "ABY","SOM","ACL","ACS","BAL","SIA","BEN","BLH","BSH","BML","BOM","BUR",
  "CHA","CRX","DRX","DSP","EUR","EXO","PER","GRX","HCL","HCS","JBS","KBL",
  "KBS","KOR","LPL","LPS","LYO","MAU","MCO","NEM","NFO","OCI","OLH","OSH",
  "PEB","RAG","RUS","SBI","SIB","SNO","SOK","SPH","SRL","SRS","THA","TUA","TUV"
];

function formatDateForInput(date) {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${parsed.getFullYear()}`;
}

function normalizeMicrochip(value) {
  return value ? String(value).replace(/\D/g, "").slice(0, 15) : null;
}

function formatMicrochip(value) {
  const digits = normalizeMicrochip(value);
  if (!digits) return "-";
  return (digits.match(/.{1,3}/g) || []).join(".");
}

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mergeLinkedKittenFields(cat) {
  if (!cat) return cat;
  const linkedBreeding = cat.litterKitten?.breeding || null;

  return {
    ...cat,
    kittenNumber: cat.kittenNumber || cat.litterKitten?.kittenNumber || null,
    neutered: linkedBreeding
      ? linkedBreeding === "NOT_FOR_BREEDING"
      : cat.neutered,
    newOwnerInfo: safeJsonParse(cat.newOwnerInfoJson),
  };
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  async function buildContext(req, kitten = null, error = null) {
    const females = await prisma.cat.findMany({
      where: { gender: "F" },
      orderBy: { name: "asc" },
    });
    const males = await prisma.cat.findMany({
      where: { gender: "M" },
      orderBy: { name: "asc" },
    });
    const users = await prisma.user.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phones: true,
        city: true,
        state: true,
      },
    });

    return {
      user: req.user,
      currentPath: req.path,
      females,
      males,
      users,
      breeds: BREEDS,
      kitten,
      error,
    };
  }

  async function validateMicrochip(microchip, currentCatId = null) {
    const digits = normalizeMicrochip(microchip);
    if (!digits) return null;

    const existing = await prisma.cat.findUnique({
      where: { microchip: digits },
    });

    if (existing && existing.id !== currentCatId) {
      const error = new Error("Este microchip já foi cadastrado anteriormente.");
      error.code = "DUPLICATE_MICROCHIP";
      throw error;
    }

    const linkedKitten = await prisma.litterKitten.findFirst({
      where: {
        microchip: digits,
        ...(currentCatId ? { NOT: { kittenCatId: currentCatId } } : {}),
      },
    });

    if (linkedKitten) {
      const error = new Error("Este microchip já está sendo utilizado em outro filhote.");
      error.code = "DUPLICATE_MICROCHIP";
      throw error;
    }

    return digits;
  }

  function makeListLabel(cat) {
    const linkedKittenNumber =
      cat.kittenNumber ||
      cat.litterKitten?.kittenNumber ||
      (cat.litterKitten?.index ? String(cat.litterKitten.index).padStart(4, "0") : "----");

    return `${linkedKittenNumber} - ${cat.name || "Sem nome"} - ${formatDateForInput(cat.birthDate) || "-"} - ${formatMicrochip(cat.microchip)} - Vendido: ${cat.sold ? "SIM" : "NÃO"} - Entregue: ${cat.delivered ? "SIM" : "NÃO"} - Padreador/Matriz: ${cat.breedingProspect ? "SIM" : "NÃO"}`;
  }

  function getKittenOrderValue(cat) {
    const value = cat.kittenNumber || cat.litterKitten?.kittenNumber || cat.litterKitten?.index || "";
    const numeric = Number(String(value).replace(/\D/g, ""));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : Number.MAX_SAFE_INTEGER;
  }

  function sortKittensByNumber(a, b) {
    const numberDiff = getKittenOrderValue(a) - getKittenOrderValue(b);
    if (numberDiff !== 0) return numberDiff;
    return (a.name || "").localeCompare(b.name || "", "pt-BR");
  }

  async function syncLitterKitten(tx, catId, data) {
    const linked = await tx.litterKitten.findFirst({
      where: { kittenCatId: catId },
    });

    if (!linked) return;

    await tx.litterKitten.update({
      where: { id: linked.id },
      data: {
        kittenNumber: data.kittenNumber,
        name: data.name,
        sex: data.gender,
        breed: data.breed,
        emsEyes: data.emsCode,
        microchip: data.microchip,
        breeding: data.neutered ? "NOT_FOR_BREEDING" : "FOR_BREEDING",
        breedingRole: null,
        deceased: data.deceased,
      },
    });
  }

  async function parsePayload(req, existingKitten = null) {
    const microchip = await validateMicrochip(req.body.microchip, existingKitten?.id || null);
    const currentOwnerMode = req.body.currentOwnerMode || "ME";
    const registeredOwnerMode = req.body.registeredOwnerMode || "YES";
    const currentOwnerId = currentOwnerMode === "OTHER"
      ? (registeredOwnerMode === "YES" && req.body.currentOwnerId
          ? Number(req.body.currentOwnerId)
          : null)
      : req.session.userId;
    const newOwnerInfo = currentOwnerMode === "OTHER" && registeredOwnerMode === "NO"
      ? {
          name: req.body.newOwnerName || "",
          document: req.body.newOwnerDocument || "",
          cep: req.body.newOwnerCep || "",
          city: req.body.newOwnerCity || "",
          street: req.body.newOwnerStreet || "",
          number: req.body.newOwnerNumber || "",
          neighborhood: req.body.newOwnerNeighborhood || "",
          state: req.body.newOwnerState || "",
          country: req.body.newOwnerCountry || "",
          phone: req.body.newOwnerPhone || "",
          email: req.body.newOwnerEmail || "",
        }
      : null;

    return {
      kittenNumber: req.body.kittenNumber || null,
      name: req.body.name || null,
      gender: req.body.gender || null,
      microchip,
      birthDate: req.body.birthDate ? new Date(req.body.birthDate) : null,
      motherId: req.body.motherId ? Number(req.body.motherId) : null,
      fatherId: req.body.fatherId ? Number(req.body.fatherId) : null,
      pedigreeType: req.body.pedigreeType || null,
      pedigreeNumber: req.body.pedigreeNumber || null,
      breed: req.body.breed || null,
      emsCode: req.body.emsCode || null,
      neutered: req.body.breedingStatus === "NOT_FOR_BREEDING",
      breederType: "Eu Mesmo",
      breederName: null,
      ownershipType: currentOwnerMode === "OTHER" ? "CO-OWNERSHIP" : "OWNER",
      currentOwnerId,
      newOwnerInfoJson: newOwnerInfo ? JSON.stringify(newOwnerInfo) : null,
      delivered: req.body.delivered === "YES",
      sold: req.body.sold === "YES",
      breedingProspect: req.body.breedingProspect === "YES",
      deceased: req.body.deceased === "YES",
      ownerId: existingKitten?.ownerId || req.session.userId,
      status: existingKitten?.status || "APROVADO",
      historyNotes: req.body.historyNotes || null,
    };
  }

  router.get(
    "/admin/kittens",
    requireAuth,
    requirePermission("admin.kittens"),
    async (req, res) => {
      const selectedOwnerId = req.query.ownerId ? Number(req.query.ownerId) : null;
      const users = await prisma.user.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true },
      });
      const kittens = await prisma.cat.findMany({
        where: {
          OR: [
            { kittenNumber: { not: null } },
            { litterKitten: { isNot: null } },
          ],
          ...(selectedOwnerId ? { ownerId: selectedOwnerId } : {}),
        },
        include: {
          litterKitten: true,
        },
        orderBy: [{ birthDate: "asc" }, { name: "asc" }],
      });

      const kittenRows = kittens
        .map((kitten) => ({
          ...mergeLinkedKittenFields(kitten),
          label: makeListLabel(kitten),
        }))
        .sort(sortKittensByNumber);

      res.render("admin-kittens/list", {
        user: req.user,
        currentPath: req.path,
        users,
        selectedOwnerId,
        groupedKittens: {
          available: kittenRows.filter(
            (kitten) => !kitten.sold && !kitten.delivered && !kitten.breedingProspect
          ),
          notDelivered: kittenRows.filter(
            (kitten) => kitten.sold && !kitten.delivered && !kitten.breedingProspect
          ),
          breeders: kittenRows.filter((kitten) => kitten.breedingProspect),
          deliveredSold: kittenRows.filter(
            (kitten) => kitten.sold && kitten.delivered && !kitten.breedingProspect
          ),
        },
      });
    }
  );

  router.get(
    "/admin/kittens/new",
    requireAuth,
    requirePermission("admin.kittens"),
    async (req, res) => {
      res.render("admin-kittens/form", {
        ...(await buildContext(req)),
        formTitle: "Novo Filhote",
        formAction: "/admin/kittens",
        cancelPath: "/admin/kittens",
        historyPath: null,
      });
    }
  );

  router.post(
    "/admin/kittens",
    requireAuth,
    requirePermission("admin.kittens"),
    async (req, res) => {
      try {
        const data = await parsePayload(req);
        const kitten = await prisma.cat.create({ data });
        res.redirect(`/admin/kittens/${kitten.id}`);
      } catch (err) {
        res.status(400).render("admin-kittens/form", {
          ...(await buildContext(req, req.body, err.message || "Erro ao salvar o filhote.")),
          formTitle: "Novo Filhote",
          formAction: "/admin/kittens",
          cancelPath: "/admin/kittens",
          historyPath: null,
        });
      }
    }
  );

  router.get(
    "/admin/kittens/:id",
    requireAuth,
    requirePermission("admin.kittens"),
    async (req, res) => {
      const kitten = await prisma.cat.findUnique({
        where: { id: Number(req.params.id) },
        include: {
          litterKitten: true,
        },
      });

      if (!kitten) {
        return res.status(404).send("Filhote não encontrado.");
      }

      res.render("admin-kittens/form", {
        ...(await buildContext(req, mergeLinkedKittenFields(kitten))),
        formTitle: "Editar Filhote",
        formAction: `/admin/kittens/${kitten.id}`,
        cancelPath: "/admin/kittens",
        historyPath: `/admin/history/${kitten.id}`,
      });
    }
  );

  router.post(
    "/admin/kittens/:id",
    requireAuth,
    requirePermission("admin.kittens"),
    async (req, res) => {
      const existingKitten = await prisma.cat.findUnique({
        where: { id: Number(req.params.id) },
        include: {
          litterKitten: true,
        },
      });

      if (!existingKitten) {
        return res.status(404).send("Filhote não encontrado.");
      }

      try {
        const data = await parsePayload(req, existingKitten);
        await prisma.$transaction(async (tx) => {
          await tx.cat.update({
            where: { id: existingKitten.id },
            data,
          });
          await syncLitterKitten(tx, existingKitten.id, data);
        });
        res.redirect(`/admin/kittens/${existingKitten.id}`);
      } catch (err) {
        res.status(400).render("admin-kittens/form", {
          ...(await buildContext(
            req,
            mergeLinkedKittenFields({ ...existingKitten, ...req.body }),
            err.message || "Erro ao atualizar o filhote."
          )),
          formTitle: "Editar Filhote",
          formAction: `/admin/kittens/${existingKitten.id}`,
          cancelPath: "/admin/kittens",
          historyPath: `/admin/history/${existingKitten.id}`,
        });
      }
    }
  );

  return router;
};
