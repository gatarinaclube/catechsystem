const express = require("express");

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

function parseDate(value) {
  if (!value || value === "0000-00-00") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value) {
  const parsed = parseDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : "";
}

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

function classifyCat(cat) {
  const birthDate = parseDate(cat.birthDate);
  const now = new Date();
  let months = 0;
  if (birthDate) {
    months =
      (now.getFullYear() - birthDate.getFullYear()) * 12 +
      (now.getMonth() - birthDate.getMonth());
    if (now.getDate() < birthDate.getDate()) months -= 1;
  }

  const ownerIsSelf = !cat.currentOwnerId || cat.currentOwnerId === cat.ownerId;

  if (cat.kittenNumber) {
    if (!cat.delivered) {
      if (months > 4 && ownerIsSelf) {
        return cat.gender === "M" ? "sires" : "dams";
      }
      return "kittens";
    }
    return null;
  }

  if (cat.deceased) return "founders";
  if (cat.neutered === true) return "founders";

  if (cat.gender === "M") return "sires";
  if (cat.gender === "F") return "dams";
  return "founders";
}

function sortByName(rows) {
  rows.sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));
}

function normalizeBirthEntries(body) {
  const dates = [].concat(reqArray(body.birthDates));
  const notes = [].concat(reqArray(body.birthNotes));

  return dates
    .map((date, index) => ({
      date: formatDate(date),
      notes: (notes[index] || "").trim(),
    }))
    .filter((item) => item.date || item.notes);
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
      date: formatDate(date),
      notes: (notes[index] || "").trim(),
    }))
    .filter((item) => item.date || item.notes);
}

function parseOtherEntries(body) {
  const dates = reqArray(body.otherDates);
  const notes = reqArray(body.otherNotes);

  return dates
    .map((date, index) => ({
      date: formatDate(date),
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
      startDate: formatDate(startDates[index]),
      endDate: formatDate(endDates[index]),
      dischargeDate: formatDate(dischargeDates[index]),
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

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

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
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                ...(microchipQuery ? [{ microchip: { contains: microchipQuery } }] : []),
              ],
            }
          : {},
        orderBy: [{ name: "asc" }],
      });

      const grouped = Object.fromEntries(
        CATEGORY_META.map((category) => [category.key, []])
      );

      cats.forEach((cat) => {
        const category = classifyCat(cat);
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

      const linkedLitters = await prisma.litter.findMany({
        where: {
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
          classifyCat(cat) === "sires"
            ? "Padreador"
            : classifyCat(cat) === "dams"
              ? "Matriz"
              : classifyCat(cat) === "kittens"
                ? "Filhote"
                : "Fundador",
      };

      const partumHistory = linkedLitters.map((litter) => ({
        litterNumber: litter.litterNumber || String(litter.id).padStart(3, "0"),
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
        vaccinationHistory: formatVaccinationHistory(cat.vaccinationPlan),
        dewormingHistory: formatDewormingHistory(cat.dewormingPlan),
        weighingHistory: formatWeighingHistory(cat.weighingPlan),
        examHistory: formatExamHistory(cat.examPlan),
        treatmentTypes: TREATMENT_TYPES,
        dosageOptions: DOSAGE_OPTIONS,
        formatDate,
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
