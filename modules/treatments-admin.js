const express = require("express");
const { canViewAllData } = require("../utils/access");
const {
  buildDisplayName,
  classifyOperationalCat,
  formatDate,
  formatDateInput,
} = require("../utils/cattery-admin");

const HISTORY_SECTION_TREATMENT = "TREATMENT";
const ADMINISTRATION_ROUTES = [
  "Oral",
  "Injetável",
  "Subcutânea",
  "Intramuscular",
  "Intravenosa",
  "Tópica",
  "Oftálmica",
  "Otológica",
  "Outra",
];

function todayForInput() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

function reqArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "undefined") return [];
  return [value];
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDateInput(value, fallback = null) {
  const text = String(value || fallback || "").slice(0, 10);
  const [year, month, day] = text.split("-").map(Number);
  return year && month && day ? new Date(Date.UTC(year, month - 1, day)) : null;
}

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function ownerScope(req) {
  return canViewAllData(req.session?.userRole) ? {} : { ownerId: req.session.userId };
}

function treatmentPayload(treatment) {
  return {
    treatmentId: treatment.id,
    type: "Tratamento",
    startDate: formatDateInput(treatment.startDate),
    endDate: formatDateInput(treatment.endDate),
    dischargeDate: "",
    dosageSchedule: treatment.administrationTime || "",
    medication: treatment.medicationName || "",
    dosage: treatment.dosage || "",
    duration: treatment.duration || "",
    administrationTime: treatment.administrationTime || "",
    administrationRoute: treatment.administrationRoute || "",
    notes: treatment.notes || "",
    source: "treatments-module",
  };
}

async function syncHistoryEntry(prisma, treatment) {
  const entries = await prisma.catHistoryEntry.findMany({
    where: { catId: treatment.catId, section: HISTORY_SECTION_TREATMENT },
    orderBy: { sortOrder: "asc" },
  });
  const existing = entries.find((entry) => {
    const payload = safeJsonParse(entry.payloadJson, {});
    return Number(payload.treatmentId) === Number(treatment.id);
  });
  const payloadJson = JSON.stringify(treatmentPayload(treatment));

  if (existing) {
    await prisma.catHistoryEntry.update({
      where: { id: existing.id },
      data: { payloadJson },
    });
    return;
  }

  await prisma.catHistoryEntry.create({
    data: {
      catId: treatment.catId,
      section: HISTORY_SECTION_TREATMENT,
      sortOrder: entries.length,
      payloadJson,
    },
  });
}

async function removeHistoryEntry(prisma, treatment) {
  const entries = await prisma.catHistoryEntry.findMany({
    where: { catId: treatment.catId, section: HISTORY_SECTION_TREATMENT },
  });
  const entry = entries.find((row) => {
    const payload = safeJsonParse(row.payloadJson, {});
    return Number(payload.treatmentId) === Number(treatment.id);
  });
  if (entry) await prisma.catHistoryEntry.delete({ where: { id: entry.id } });
}

function categoryLabel(key) {
  return {
    sires: "Padreador",
    dams: "Matriz",
    founders: "Fundador",
    kittens: "Filhote",
  }[key] || "Gato";
}

function treatmentFormData(body, medication) {
  const startDate = parseDateInput(body.startDate, todayForInput());
  if (!startDate) throw new Error("Informe a data de início.");

  const medicationName = medication?.name || cleanText(body.medicationName);
  if (!medicationName) throw new Error("Informe a medicação.");

  return {
    medicationId: medication?.id || null,
    medicationName,
    dosage: cleanText(body.dosage) || null,
    duration: cleanText(body.duration) || null,
    administrationTime: cleanText(body.administrationTime) || null,
    administrationRoute: cleanText(body.administrationRoute) || null,
    startDate,
    endDate: parseDateInput(body.endDate, null),
    notes: cleanText(body.notes) || null,
  };
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  async function loadEligibleCats(req) {
    const cats = await prisma.cat.findMany({
      where: ownerScope(req),
      include: { litterKitten: true },
      orderBy: [{ name: "asc" }],
    });

    return cats
      .map((cat) => {
        const category = classifyOperationalCat(cat, {
          includeDeliveredKittensInHistory: false,
          excludeCoOwnedAdults: false,
        });
        if (!category) return null;
        return {
          id: cat.id,
          name: buildDisplayName(cat),
          category,
          categoryLabel: categoryLabel(category),
          microchip: cat.microchip || "",
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const categoryCompare = a.categoryLabel.localeCompare(b.categoryLabel, "pt-BR");
        return categoryCompare || a.name.localeCompare(b.name, "pt-BR");
      });
  }

  async function loadPageData(req) {
    const [cats, medications, treatments] = await Promise.all([
      loadEligibleCats(req),
      prisma.treatmentMedication.findMany({
        where: { ...ownerScope(req), active: true },
        orderBy: { name: "asc" },
      }),
      prisma.catTreatment.findMany({
        where: ownerScope(req),
        include: { cat: true, medication: true },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        take: 120,
      }),
    ]);

    return {
      cats,
      medications,
      treatments: treatments.map((treatment) => ({
        ...treatment,
        catName: treatment.cat ? buildDisplayName(treatment.cat) : "-",
        startDateLabel: formatDate(treatment.startDate) || "-",
        endDateLabel: formatDate(treatment.endDate) || "-",
      })),
    };
  }

  router.get(
    "/admin/treatments",
    requireAuth,
    requirePermission("admin.treatments"),
    async (req, res) => {
      res.render("admin-treatments/index", {
        user: req.user,
        currentPath: "/admin/treatments",
        ...(await loadPageData(req)),
        routes: ADMINISTRATION_ROUTES,
        form: {
          startDate: todayForInput(),
        },
        success: req.query.ok === "1",
        error: req.query.error || "",
      });
    }
  );

  router.post(
    "/admin/treatments/medications",
    requireAuth,
    requirePermission("admin.treatments"),
    async (req, res) => {
      const name = cleanText(req.body.name);
      if (!name) return res.redirect("/admin/treatments");

      try {
        await prisma.treatmentMedication.create({
          data: {
            ownerId: req.session?.userId || null,
            name,
            description: cleanText(req.body.description) || null,
          },
        });
        res.redirect("/admin/treatments?ok=1");
      } catch (err) {
        const message = err.code === "P2002"
          ? "Esta medicação já está cadastrada."
          : "Erro ao salvar medicação.";
        res.redirect(`/admin/treatments?error=${encodeURIComponent(message)}`);
      }
    }
  );

  router.post(
    "/admin/treatments",
    requireAuth,
    requirePermission("admin.treatments"),
    async (req, res) => {
      const catIds = reqArray(req.body.catIds).map(Number).filter(Boolean);
      if (!catIds.length) {
        return res.redirect(`/admin/treatments?error=${encodeURIComponent("Selecione ao menos um animal.")}`);
      }

      const medication = req.body.medicationId
        ? await prisma.treatmentMedication.findFirst({
            where: { id: Number(req.body.medicationId), ...ownerScope(req), active: true },
          })
        : null;

      try {
        const data = treatmentFormData(req.body, medication);
        const allowedCats = await loadEligibleCats(req);
        const allowedIds = new Set(allowedCats.map((cat) => cat.id));
        const selectedIds = catIds.filter((id) => allowedIds.has(id));

        if (!selectedIds.length) {
          throw new Error("Nenhum dos animais selecionados está disponível para lançamento.");
        }

        for (const catId of selectedIds) {
          const treatment = await prisma.catTreatment.create({
            data: {
              ownerId: req.session?.userId || null,
              catId,
              ...data,
            },
          });
          await syncHistoryEntry(prisma, treatment);
        }

        res.redirect("/admin/treatments?ok=1");
      } catch (err) {
        res.redirect(`/admin/treatments?error=${encodeURIComponent(err.message || "Erro ao salvar tratamento.")}`);
      }
    }
  );

  router.post(
    "/admin/treatments/:id/delete",
    requireAuth,
    requirePermission("admin.treatments"),
    async (req, res) => {
      const treatment = await prisma.catTreatment.findFirst({
        where: { id: Number(req.params.id), ...ownerScope(req) },
      });
      if (!treatment) return res.status(404).send("Tratamento não encontrado.");

      await removeHistoryEntry(prisma, treatment);
      await prisma.catTreatment.delete({ where: { id: treatment.id } });
      res.redirect("/admin/treatments?ok=1");
    }
  );

  return router;
};
