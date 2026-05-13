const express = require("express");
const { canViewAllData } = require("../utils/access");
const {
  parseDate,
  formatDate,
  formatDateInput,
  buildDisplayName,
  classifyOperationalCat,
} = require("../utils/cattery-admin");

const CATEGORY_META = [
  { key: "sires", label: "Padreadores", color: "#2563eb" },
  { key: "dams", label: "Matrizes", color: "#db2777" },
  { key: "founders", label: "Fundadores", color: "#6b7280" },
  { key: "kittens", label: "Filhotes", color: "#16a34a" },
];

const HISTORY_SECTIONS = {
  BIRTH: "BIRTH",
  TREATMENT: "TREATMENT",
  OTHER: "OTHER",
};

const TREATMENT_TYPES = ["Internação", "Tratamento", "Cirurgia"];
const DOSAGE_OPTIONS = ["2/2", "4/4", "6/6", "8/8", "12/12", "24h", "48h", "72h"];

function formatDateLabel(value) {
  return formatDate(value) || "-";
}

function normalizeMicrochip(value) {
  return value ? String(value).replace(/\D/g, "").slice(0, 15) : "";
}

function formatMicrochip(value) {
  const digits = normalizeMicrochip(value);
  return digits ? (digits.match(/.{1,3}/g) || []).join(".") : "-";
}

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

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

function sortByName(rows) {
  rows.sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));
}

function reqArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "undefined") return [];
  return [value];
}

function parseBirthEntries(body) {
  const dates = reqArray(body.birthDates);
  const notes = reqArray(body.birthNotes);

  return dates
    .map((date, index) => ({
      date: formatDateInput(date),
      notes: (notes[index] || "").trim(),
    }))
    .filter((item) => item.date || item.notes);
}

function parseOtherEntries(body) {
  const dates = reqArray(body.otherDates);
  const notes = reqArray(body.otherNotes);

  return dates
    .map((date, index) => ({
      date: formatDateInput(date),
      notes: (notes[index] || "").trim(),
    }))
    .filter((item) => item.date || item.notes);
}

function parseTreatmentEntries(body) {
  const types = reqArray(body.treatmentType);
  const startDates = reqArray(body.treatmentStartDate);
  const endDates = reqArray(body.treatmentEndDate);
  const dischargeDates = reqArray(body.treatmentDischargeDate);
  const dosageSchedules = reqArray(body.treatmentDosageSchedule);
  const medications = reqArray(body.treatmentMedication);
  const dosages = reqArray(body.treatmentDosage);
  const notes = reqArray(body.treatmentNotes);

  return types
    .map((type, index) => ({
      type: type || "",
      startDate: formatDateInput(startDates[index]),
      endDate: formatDateInput(endDates[index]),
      dischargeDate: formatDateInput(dischargeDates[index]),
      dosageSchedule: dosageSchedules[index] || "",
      medication: (medications[index] || "").trim(),
      dosage: (dosages[index] || "").trim(),
      notes: (notes[index] || "").trim(),
    }))
    .filter((item) =>
      item.type ||
      item.startDate ||
      item.endDate ||
      item.dischargeDate ||
      item.dosageSchedule ||
      item.medication ||
      item.dosage ||
      item.notes
    );
}

function readHistoryEntries(entries, section) {
  return entries
    .filter((entry) => entry.section === section)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((entry) => safeJsonParse(entry.payloadJson, {}));
}

async function replaceSectionEntries(prisma, catId, section, payloads) {
  await prisma.catHistoryEntry.deleteMany({
    where: { catId, section },
  });

  if (!payloads.length) return;

  await prisma.catHistoryEntry.createMany({
    data: payloads.map((payload, index) => ({
      catId,
      section,
      sortOrder: index,
      payloadJson: JSON.stringify(payload),
    })),
  });
}

function formatVaccinationHistory(plan) {
  const antirabic = safeJsonParse(plan?.antirabicHistoryJson, []) || [];
  const feline = safeJsonParse(plan?.felineHistoryJson, []) || [];
  return { antirabic, feline };
}

function formatDewormingHistory(plan) {
  return safeJsonParse(plan?.historyJson, []) || [];
}

function formatWeighingHistory(plan) {
  return safeJsonParse(plan?.historyJson, []) || [];
}

function formatExamHistory(plan) {
  return {
    pkdefSource: plan?.pkdefSource || "",
    pkdefResult: plan?.pkdefResult || "",
    prabfSource: plan?.prabfSource || "",
    prabfResult: plan?.prabfResult || "",
    ecoHistory: safeJsonParse(plan?.ecoHistoryJson, []) || [],
  };
}

function timelineDateTime(value) {
  const parsed = parseDate(value);
  return parsed ? parsed.getTime() : null;
}

function buildTimelineEntry({ date, section, title, description, color = "is-blue" }) {
  const dateTime = timelineDateTime(date);
  if (!dateTime) return null;

  return {
    date,
    dateTime,
    dateLabel: formatDateLabel(date),
    section,
    title,
    description,
    color,
  };
}

function buildCatTimeline({
  cat,
  birthLitter,
  birthHistory,
  treatmentHistory,
  otherHistory,
  partumHistory,
  vaccinationHistory,
  dewormingHistory,
  weighingHistory,
  examHistory,
}) {
  const entries = [];

  entries.push(buildTimelineEntry({
    date: cat.birthDate,
    section: "Nascimento",
    title: "Nascimento",
    description: birthLitter
      ? `Ninhada ${birthLitter.litterNumber || String(birthLitter.id).padStart(3, "0")}`
      : "Registro de nascimento do gato.",
    color: "is-green",
  }));

  birthHistory.forEach((item) => {
    entries.push(buildTimelineEntry({
      date: item.date,
      section: "Nascimento",
      title: "Histórico individual de nascimento",
      description: item.notes || "Sem observações.",
      color: "is-green",
    }));
  });

  partumHistory.forEach((item) => {
    entries.push(buildTimelineEntry({
      date: item.rawBirthDate,
      section: "Partos",
      title: `Parto - Ninhada ${item.litterNumber}`,
      description: `${item.totalKittens} filhote(s), ${item.females} fêmea(s), ${item.males} macho(s), ${item.dead} óbito(s).`,
      color: "is-purple",
    }));
  });

  treatmentHistory.forEach((item) => {
    entries.push(buildTimelineEntry({
      date: item.startDate || item.endDate || item.dischargeDate,
      section: "Tratamentos",
      title: item.type || "Tratamento",
      description: [
        item.medication ? `Medicação: ${item.medication}` : "",
        item.dosage ? `Dosagem: ${item.dosage}` : "",
        item.notes || "",
      ].filter(Boolean).join(" · ") || "Sem observações.",
      color: "is-yellow",
    }));
  });

  vaccinationHistory.antirabic.forEach((item) => {
    entries.push(buildTimelineEntry({
      date: item.date,
      section: "Vacinas",
      title: "Vacina antirrábica",
      description: "Registro de vacina antirrábica.",
      color: "is-blue",
    }));
  });

  vaccinationHistory.feline.forEach((item) => {
    entries.push(buildTimelineEntry({
      date: item.date,
      section: "Vacinas",
      title: "Vacina Feline",
      description: item.type || "Tipo não informado.",
      color: "is-blue",
    }));
  });

  dewormingHistory.forEach((item) => {
    entries.push(buildTimelineEntry({
      date: item.date,
      section: "Vermifugação",
      title: "Vermifugação",
      description: item.type || "Tipo não informado.",
      color: "is-green",
    }));
  });

  weighingHistory.forEach((item) => {
    entries.push(buildTimelineEntry({
      date: item.date,
      section: "Pesagem",
      title: "Pesagem",
      description: item.weight ? `${item.weight} kg` : "Peso não informado.",
      color: "is-purple",
    }));
  });

  examHistory.ecoHistory.forEach((item) => {
    entries.push(buildTimelineEntry({
      date: item.date,
      section: "Exames",
      title: "Ecocardiodoppler",
      description: "Registro de exame ecocardiodoppler.",
      color: "is-blue",
    }));
  });

  otherHistory.forEach((item) => {
    entries.push(buildTimelineEntry({
      date: item.date,
      section: "Outros",
      title: "Outro histórico",
      description: item.notes || "Sem observações.",
    }));
  });

  return entries
    .filter(Boolean)
    .sort((a, b) => b.dateTime - a.dateTime);
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  function ownerScope(req) {
    return canViewAllData(req.session?.userRole) ? {} : { ownerId: req.session.userId };
  }

  async function ensureCatAccess(req, catId) {
    const cat = await prisma.cat.findFirst({
      where: { id: catId, ...ownerScope(req) },
      select: { id: true },
    });
    return Boolean(cat);
  }

  router.get(
    "/admin/history",
    requireAuth,
    requirePermission("admin.history"),
    async (req, res) => {
      const query = (req.query.q || "").trim();
      const microchipQuery = normalizeMicrochip(query);

      const cats = await prisma.cat.findMany({
        where: query
          ? {
              ...ownerScope(req),
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                ...(microchipQuery ? [{ microchip: { contains: microchipQuery } }] : []),
              ],
            }
          : ownerScope(req),
        orderBy: [{ name: "asc" }],
      });

      const grouped = Object.fromEntries(
        CATEGORY_META.map((category) => [category.key, []])
      );

      cats.forEach((cat) => {
        const category = classifyOperationalCat(cat, {
          includeDeliveredKittensInHistory: true,
          excludeCoOwnedAdults: false,
        });
        if (!category) return;

        grouped[category].push({
          id: cat.id,
          displayName: buildDisplayName(cat),
          birthDateLabel: formatDateLabel(cat.birthDate),
          microchipLabel: formatMicrochip(cat.microchip),
        });
      });

      Object.values(grouped).forEach(sortByName);

      res.render("admin-history/list", {
        user: req.user,
        currentPath: req.path,
        categories: CATEGORY_META,
        grouped,
        query,
      });
    }
  );

  router.get(
    "/admin/history/:id",
    requireAuth,
    requirePermission("admin.history"),
    async (req, res) => {
      const catId = Number(req.params.id);
      const cat = await prisma.cat.findUnique({
        where: { id: catId },
        include: {
          owner: true,
          currentOwner: true,
          father: true,
          mother: true,
          litterKitten: {
            include: { litter: true },
          },
          vaccinationPlan: true,
          dewormingPlan: true,
          weighingPlan: true,
          examPlan: true,
          historyEntries: true,
        },
      });

      if (!cat) {
        return res.status(404).send("Gato não encontrado.");
      }

      if (!(await ensureCatAccess(req, catId))) {
        return res.status(403).send("Você não tem acesso a este histórico.");
      }

      const linkedLitters = await prisma.litter.findMany({
        where: {
          ...ownerScope(req),
          OR: [
            ...(cat.microchip ? [{ femaleMicrochip: cat.microchip }] : []),
            ...(cat.name ? [{ femaleName: cat.name }] : []),
          ],
        },
        include: {
          kittens: true,
        },
        orderBy: { litterBirthDate: "asc" },
      });

      const birthHistory = readHistoryEntries(cat.historyEntries, HISTORY_SECTIONS.BIRTH);
      const treatmentHistory = readHistoryEntries(
        cat.historyEntries,
        HISTORY_SECTIONS.TREATMENT
      );
      const otherHistory = readHistoryEntries(cat.historyEntries, HISTORY_SECTIONS.OTHER);

      const litterNote = cat.litterKitten?.litter?.historyNotes || "";
      const birthLitter = cat.litterKitten?.litter || null;

      const birthInfo = {
        displayName: buildDisplayName(cat),
        birthDate: formatDateLabel(cat.birthDate),
        age: calculateAgeLabel(cat.birthDate),
        microchip: formatMicrochip(cat.microchip),
        sex: cat.gender === "M" ? "Macho" : cat.gender === "F" ? "Fêmea" : "-",
        country: cat.country || "-",
        breed: cat.breed || "-",
        emsCode: cat.emsCode || "-",
        pedigreeType: cat.pedigreeType || "-",
        pedigreeNumber: cat.pedigreeNumber || "-",
        father: cat.father?.name || cat.fatherName || "-",
        mother: cat.mother?.name || cat.motherName || "-",
        owner: cat.owner?.name || "-",
        currentOwner: cat.currentOwner?.name || cat.owner?.name || "-",
        classification:
          classifyOperationalCat(cat, {
            includeDeliveredKittensInHistory: true,
            excludeCoOwnedAdults: false,
          }) === "sires"
            ? "Padreador"
            : classifyOperationalCat(cat, {
                includeDeliveredKittensInHistory: true,
                excludeCoOwnedAdults: false,
              }) === "dams"
              ? "Matriz"
              : classifyOperationalCat(cat, {
                  includeDeliveredKittensInHistory: true,
                  excludeCoOwnedAdults: false,
                }) === "kittens"
                ? "Filhote"
                : "Fundador",
      };

      const partumHistory = linkedLitters.map((litter) => ({
        litterNumber: litter.litterNumber || String(litter.id).padStart(3, "0"),
        rawBirthDate: litter.litterBirthDate,
        birthDate: formatDateLabel(litter.litterBirthDate),
        totalKittens: litter.litterCount || litter.kittens.length || 0,
        females: litter.femaleCount || 0,
        males: litter.maleCount || 0,
        dead: litter.deadCount || 0,
        notes: litter.historyNotes || "",
        kittens: litter.kittens.map((kitten) => ({
          number: kitten.kittenNumber || "-",
          name: kitten.name || "-",
          sex: kitten.sex || "-",
          microchip: formatMicrochip(kitten.microchip),
        })),
      }));
      const vaccinationHistory = formatVaccinationHistory(cat.vaccinationPlan);
      const dewormingHistory = formatDewormingHistory(cat.dewormingPlan);
      const weighingHistory = formatWeighingHistory(cat.weighingPlan);
      const examHistory = formatExamHistory(cat.examPlan);
      const timeline = buildCatTimeline({
        cat,
        birthLitter,
        birthHistory,
        treatmentHistory,
        otherHistory,
        partumHistory,
        vaccinationHistory,
        dewormingHistory,
        weighingHistory,
        examHistory,
      });

      res.render("admin-history/detail", {
        user: req.user,
        currentPath: "/admin/history",
        cat,
        birthInfo,
        birthLitter,
        litterNote,
        birthHistory,
        treatmentHistory,
        otherHistory,
        partumHistory,
        vaccinationHistory,
        dewormingHistory,
        weighingHistory,
        examHistory,
        timeline,
        treatmentTypes: TREATMENT_TYPES,
        dosageOptions: DOSAGE_OPTIONS,
        formatDate,
        formatDateInput,
        formatDateLabel,
        formatMicrochip,
      });
    }
  );

  router.post(
    "/admin/history/:id/birth",
    requireAuth,
    requirePermission("admin.history"),
    async (req, res) => {
      const catId = Number(req.params.id);
      if (!(await ensureCatAccess(req, catId))) {
        return res.status(403).send("Você não pode editar este histórico.");
      }
      await replaceSectionEntries(
        prisma,
        catId,
        HISTORY_SECTIONS.BIRTH,
        parseBirthEntries(req.body)
      );
      res.redirect(`/admin/history/${catId}`);
    }
  );

  router.post(
    "/admin/history/:id/treatments",
    requireAuth,
    requirePermission("admin.history"),
    async (req, res) => {
      const catId = Number(req.params.id);
      if (!(await ensureCatAccess(req, catId))) {
        return res.status(403).send("Você não pode editar este histórico.");
      }
      await replaceSectionEntries(
        prisma,
        catId,
        HISTORY_SECTIONS.TREATMENT,
        parseTreatmentEntries(req.body)
      );
      res.redirect(`/admin/history/${catId}`);
    }
  );

  router.post(
    "/admin/history/:id/others",
    requireAuth,
    requirePermission("admin.history"),
    async (req, res) => {
      const catId = Number(req.params.id);
      if (!(await ensureCatAccess(req, catId))) {
        return res.status(403).send("Você não pode editar este histórico.");
      }
      await replaceSectionEntries(
        prisma,
        catId,
        HISTORY_SECTIONS.OTHER,
        parseOtherEntries(req.body)
      );
      res.redirect(`/admin/history/${catId}`);
    }
  );

  return router;
};
