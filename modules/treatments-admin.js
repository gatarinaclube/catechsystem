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
const DOSAGE_UNITS = ["ml", "mg", "g", "ui"];
const FREQUENCIES = ["1xdia", "12/12h", "8/8h", "6/6h", "4/4h", "2/2h"];

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

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function formatDosage(body) {
  const amount = cleanText(body.dosageAmount);
  const unit = cleanText(body.dosageUnit);
  if (!amount && !unit) return null;
  return [amount, unit].filter(Boolean).join(" ");
}

function formatDuration(body) {
  const days = Number.parseInt(body.durationDays || "", 10);
  return Number.isFinite(days) && days > 0 ? `${days} dia${days === 1 ? "" : "s"}` : null;
}

function formatAdministrationTime(body) {
  const frequency = cleanText(body.frequency);
  const times = reqArray(body.scheduleTimes).map(cleanText).filter(Boolean);
  if (!frequency && !times.length) return null;
  return [frequency, times.length ? times.join(" / ") : ""].filter(Boolean).join(" - ");
}

function splitDosage(value) {
  const text = cleanText(value);
  const match = text.match(/^(.+?)\s+(ml|mg|g|ui)$/i);
  return {
    amount: match ? match[1] : text,
    unit: match ? match[2].toLowerCase() : "",
  };
}

function durationDays(value) {
  const match = cleanText(value).match(/(\d+)/);
  return match ? match[1] : "";
}

function splitAdministrationTime(value) {
  const [frequency = "", timesText = ""] = cleanText(value).split(" - ");
  return {
    frequency,
    times: timesText
      ? timesText.split("/").map((item) => item.trim()).filter(Boolean)
      : [],
  };
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

async function syncTreatmentHistoryByIds(prisma, ids) {
  if (!ids.length) return;
  const treatments = await prisma.catTreatment.findMany({
    where: { id: { in: ids } },
  });
  for (const treatment of treatments) {
    await syncHistoryEntry(prisma, treatment);
  }
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

  if (!medication) throw new Error("Selecione uma medicação cadastrada.");

  const durationDays = Number.parseInt(body.durationDays || "", 10);
  const explicitEndDate = parseDateInput(body.endDate, null);
  const calculatedEndDate = Number.isFinite(durationDays) && durationDays > 0
    ? addDays(startDate, durationDays - 1)
    : null;

  return {
    medicationId: medication.id,
    medicationName: medication.name,
    dosage: formatDosage(body),
    duration: formatDuration(body),
    administrationTime: formatAdministrationTime(body),
    administrationRoute: cleanText(body.administrationRoute) || null,
    startDate,
    endDate: explicitEndDate || calculatedEndDate,
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
    const [cats, medications, treatments, medicationUsage] = await Promise.all([
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
      prisma.catTreatment.groupBy({
        by: ["medicationId"],
        where: { ...ownerScope(req), medicationId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const usageByMedication = new Map(
      medicationUsage.map((row) => [row.medicationId, row._count._all])
    );

    return {
      cats,
      medications: medications.map((medication) => ({
        ...medication,
        usageCount: usageByMedication.get(medication.id) || 0,
      })),
      treatments: treatments.map((treatment) => ({
        ...treatment,
        catName: treatment.cat ? buildDisplayName(treatment.cat) : "-",
        dosageParts: splitDosage(treatment.dosage),
        durationDays: durationDays(treatment.duration),
        administrationParts: splitAdministrationTime(treatment.administrationTime),
        startDateInput: formatDateInput(treatment.startDate),
        endDateInput: formatDateInput(treatment.endDate),
        startDateLabel: formatDate(treatment.startDate) || "-",
        endDateLabel: formatDate(treatment.endDate) || "-",
      })),
    };
  }

  async function medicationHistoryUsageCount(req, medicationName) {
    return prisma.catHistoryEntry.count({
      where: {
        section: HISTORY_SECTION_TREATMENT,
        payloadJson: { contains: medicationName },
        cat: { is: ownerScope(req) },
      },
    });
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
        dosageUnits: DOSAGE_UNITS,
        frequencies: FREQUENCIES,
        form: {
          startDate: todayForInput(),
        },
        success: req.query.ok === "1",
        error: req.query.error || "",
      });
    }
  );

  router.post(
    "/admin/treatments/medications/:id/update",
    requireAuth,
    requirePermission("admin.treatments"),
    async (req, res) => {
      const id = Number(req.params.id);
      const name = cleanText(req.body.name);
      if (!name) return res.redirect(`/admin/treatments?error=${encodeURIComponent("Informe o nome da medicação.")}`);

      const medication = await prisma.treatmentMedication.findFirst({
        where: { id, ...ownerScope(req), active: true },
      });
      if (!medication) return res.status(404).send("Medicação não encontrada.");

      try {
        await prisma.$transaction(async (tx) => {
          await tx.treatmentMedication.update({
            where: { id: medication.id },
            data: {
              name,
              description: cleanText(req.body.description) || null,
            },
          });

          const affected = await tx.catTreatment.findMany({
            where: { medicationId: medication.id },
            select: { id: true },
          });
          await tx.catTreatment.updateMany({
            where: { medicationId: medication.id },
            data: { medicationName: name },
          });
          await syncTreatmentHistoryByIds(tx, affected.map((row) => row.id));
        });
        res.redirect("/admin/treatments?ok=1");
      } catch (err) {
        const message = err.code === "P2002"
          ? "Já existe uma medicação com este nome."
          : "Erro ao atualizar medicação.";
        res.redirect(`/admin/treatments?error=${encodeURIComponent(message)}`);
      }
    }
  );

  router.post(
    "/admin/treatments/medications/:id/delete",
    requireAuth,
    requirePermission("admin.treatments"),
    async (req, res) => {
      const id = Number(req.params.id);
      const medication = await prisma.treatmentMedication.findFirst({
        where: { id, ...ownerScope(req), active: true },
      });
      if (!medication) return res.status(404).send("Medicação não encontrada.");

      const [usageCount, historyUsageCount] = await Promise.all([
        prisma.catTreatment.count({ where: { medicationId: medication.id } }),
        medicationHistoryUsageCount(req, medication.name),
      ]);
      if (usageCount > 0 || historyUsageCount > 0) {
        return res.redirect(`/admin/treatments?error=${encodeURIComponent("Esta medicação está sendo usada e não pode ser excluída.")}`);
      }

      await prisma.treatmentMedication.delete({ where: { id: medication.id } });
      res.redirect("/admin/treatments?ok=1");
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

      const medication = await prisma.treatmentMedication.findFirst({
        where: { id: Number(req.body.medicationId), ...ownerScope(req), active: true },
      });

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
    "/admin/treatments/:id/update",
    requireAuth,
    requirePermission("admin.treatments"),
    async (req, res) => {
      const treatment = await prisma.catTreatment.findFirst({
        where: { id: Number(req.params.id), ...ownerScope(req) },
      });
      if (!treatment) return res.status(404).send("Tratamento não encontrado.");

      const medication = await prisma.treatmentMedication.findFirst({
        where: { id: Number(req.body.medicationId), ...ownerScope(req), active: true },
      });

      try {
        const data = treatmentFormData(req.body, medication);
        const updated = await prisma.catTreatment.update({
          where: { id: treatment.id },
          data,
        });
        await syncHistoryEntry(prisma, updated);
        res.redirect("/admin/treatments?ok=1");
      } catch (err) {
        res.redirect(`/admin/treatments?error=${encodeURIComponent(err.message || "Erro ao atualizar tratamento.")}`);
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
