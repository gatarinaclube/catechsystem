const express = require("express");
const { dataOwnerScope } = require("../utils/access");
const {
  addMonths,
  addDays,
  formatDate,
  formatDateInput,
  parseDate,
  ageInMonths,
  buildDisplayName,
  classifyOperationalCat,
  isRoutineModuleCatVisible,
} = require("../utils/cattery-admin");

const STATUS_GROUPS = [
  { key: "CONFIRMADO", label: "Confirmado" },
  { key: "NAO_CONFIRMADO", label: "Não Confirmado" },
  { key: "PARA_ACASALAR", label: "Para Acasalar" },
  { key: "PAUSA_REPRODUTIVA", label: "Pausa Reprodutiva" },
  { key: "COM_PROBLEMA", label: "Com Problema" },
  { key: "EM_DESENVOLVIMENTO", label: "Em Desenvolvimento" },
];

function safeJsonParse(value, fallback = []) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toIsoDate(value) {
  const date = parseDate(value);
  if (!date) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function normalizeLitterHistoryDates(values) {
  const unique = new Map();

  []
    .concat(values || [])
    .map((value) => toIsoDate(value))
    .filter(Boolean)
    .forEach((value) => unique.set(value, value));

  return Array.from(unique.values()).sort((a, b) => {
    const dateA = parseDate(a);
    const dateB = parseDate(b);
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateA - dateB;
  });
}

function laterDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function computeNextCrossDate(femaleBirthDate, litterHistoryDates) {
  const dates = litterHistoryDates
    .map(parseDate)
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (!dates.length) {
    const birth = parseDate(femaleBirthDate);
    return birth ? addDays(addMonths(birth, 10), 15) : null;
  }

  if (dates.length === 1) {
    return addMonths(dates[0], 4);
  }

  const recent = dates.slice(-3);

  if (recent.length === 2) {
    const [first, second] = recent;
    const candidate = addMonths(second, 4);
    const twelveMonthLimit = addMonths(first, 10);
    return laterDate(candidate, twelveMonthLimit);
  }

  const [first, , third] = recent;
  const candidate = addMonths(third, 4);

  return laterDate(candidate, addMonths(first, 22));
}

function computeReferenceMatingDate(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start) return null;
  if (!end || end <= start) return start;

  const diffDays = Math.round((end - start) / 86400000);
  if (diffDays <= 1) return end;
  if (diffDays === 2) return addDays(start, 1);

  return addDays(start, Math.ceil(diffDays / 2));
}

function computeDpp(startDate, endDate) {
  const reference = computeReferenceMatingDate(startDate, endDate);
  return reference ? addDays(reference, 60) : null;
}

function computeGestationDays(startDate, endDate) {
  const reference = computeReferenceMatingDate(startDate, endDate);
  if (!reference) return null;
  const now = new Date();
  return Math.max(0, Math.floor((now - reference) / 86400000));
}

function startOfDay(value) {
  const date = parseDate(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.floor(number);
}

function hasExcessLitterWarning(litterHistoryDates) {
  const dates = litterHistoryDates
    .map(parseDate)
    .filter(Boolean)
    .sort((a, b) => a - b);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastThree = dates.slice(-3);
  if (lastThree.length >= 3 && lastThree[0] >= addMonths(today, -22)) {
    return true;
  }

  const lastTwo = dates.slice(-2);
  return lastTwo.length >= 2 && lastTwo[0] >= addMonths(today, -10);
}

function computeSupplementInfo(settings, plan, nextCrossDate, forceActive = false) {
  if (!settings?.matingSupplementEnabled) return null;

  const daysBefore = positiveInteger(settings.matingSupplementDaysBefore, 15);
  const daysAfter = positiveInteger(settings.matingSupplementDaysAfter, 30);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const matingDate = startOfDay(plan?.matingStartDate);
  if (matingDate) {
    const startDate = addDays(matingDate, -daysBefore);
    const endDate = addDays(matingDate, daysAfter);
    const active = forceActive || (today >= startDate && today <= endDate);

    return {
      active,
      phase: today < matingDate ? "Pré-cruza" : "Pós-cruza",
      startDate,
      endDate,
      endOpen: false,
      orderDate: startDate,
      summary: `${daysBefore} dias antes até ${daysAfter} dias após a cruza`,
    };
  }

  const expectedDate = startOfDay(nextCrossDate);
  if (!expectedDate) return null;

  const startDate = addDays(expectedDate, -daysBefore);
  const active = forceActive || today >= startDate;

  return {
    active,
    phase: today > expectedDate ? "Pré-cruza atrasada" : "Pré-cruza",
    startDate,
    endDate: null,
    endOpen: true,
    orderDate: startDate,
    summary: `${daysBefore} dias antes da previsão; segue até lançar a data de cruza`,
  };
}

function buildAncestorInclude(depth) {
  if (depth <= 1) {
    return {
      father: true,
      mother: true,
    };
  }

  const childInclude = buildAncestorInclude(depth - 1);
  return {
    father: { include: childInclude },
    mother: { include: childInclude },
  };
}

function buildPedigreeNode(cat, depth = 4) {
  if (!cat || depth <= 0) return null;

  return {
    name: cat.name || buildDisplayName(cat) || "-",
    fatherName: cat.father?.name || cat.fatherName || "",
    motherName: cat.mother?.name || cat.motherName || "",
    father: buildPedigreeNode(cat.father, depth - 1),
    mother: buildPedigreeNode(cat.mother, depth - 1),
  };
}

function hasOtherOwner(cat) {
  return (
    cat?.ownershipType === "CO-OWNERSHIP" ||
    cat?.ownershipType === "OTHER" ||
    Boolean(cat?.currentOwnerClientId) ||
    (Boolean(cat?.currentOwnerId) && cat.currentOwnerId !== cat.ownerId)
  );
}

function isKittenRecord(cat) {
  return Boolean(cat?.kittenNumber || cat?.litterKitten);
}

function isAdultOtherOwner(cat) {
  return !isKittenRecord(cat) && hasOtherOwner(cat);
}

function isFemaleAvailableForMatingModule(female) {
  if (!isRoutineModuleCatVisible(female)) return false;
  if (isAdultOtherOwner(female)) return false;
  if (female.deceased === true || female.neutered === true) return false;
  if (female.delivered === true) return false;
  if (female.kittenAvailabilityStatus === "DELIVERED") return false;
  if ((female.kittenNumber || female.litterKitten) && female.breedingProspect !== true) {
    return false;
  }
  return female.gender === "F";
}

function isDevelopingFemale(female) {
  return ageInMonths(female.birthDate) < 10;
}

function isMaleAvailableForMatingModule(male) {
  if (!isRoutineModuleCatVisible(male)) return false;
  if (isAdultOtherOwner(male)) return false;
  if (male.deceased === true || male.neutered === true) return false;
  if (male.delivered === true) return false;
  if (male.kittenAvailabilityStatus === "DELIVERED") return false;
  if ((male.kittenNumber || male.litterKitten) && male.breedingProspect !== true) {
    return false;
  }
  if (ageInMonths(male.birthDate) < 10) return false;
  return male.gender === "M";
}

function buildNextActions(grouped) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingLimit = addDays(today, 15);
  const actions = [];

  (grouped.PARA_ACASALAR || []).forEach((row) => {
    if (!row.nextCrossDate) return;
    const nextDate = parseDate(row.nextCrossDate);
    if (!nextDate || nextDate > upcomingLimit) return;

    actions.push({
      title: row.femaleDisplayName,
      sub: `Próxima cruza: ${formatDate(nextDate)}`,
      badge: nextDate < today ? "Atrasada" : "Para acasalar",
      color: nextDate < today ? "is-red" : "is-green",
      orderDate: nextDate,
    });
  });

  (grouped.CONFIRMADO || []).forEach((row) => {
    if (!row.dppDate) return;
    const dppDate = parseDate(row.dppDate);
    if (!dppDate || dppDate > upcomingLimit) return;

    actions.push({
      title: row.femaleDisplayName,
      sub: `DPP: ${formatDate(dppDate)}${row.gestationDays !== null ? ` · ${row.gestationDays} dias` : ""}`,
      badge: dppDate < today ? "DPP vencida" : "DPP próxima",
      color: dppDate < today ? "is-red" : "is-yellow",
      orderDate: dppDate,
    });
  });

  return actions
    .sort((a, b) => a.orderDate - b.orderDate)
    .slice(0, 6);
}

function statusLabel(value) {
  return STATUS_GROUPS.find((group) => group.key === value)?.label || "Para Acasalar";
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  function ownerScope(req) {
    return dataOwnerScope(req);
  }

  async function loadOwnerFilter() {
    return { users: [], selectedOwnerId: null };
  }

  async function buildRows(req) {
    const scopedOwner = ownerScope(req);
    const females = await prisma.cat.findMany({
      where: {
        ...scopedOwner,
        gender: "F",
      },
      orderBy: { name: "asc" },
      include: {
        ...buildAncestorInclude(5),
        owner: { include: { settings: true } },
        litterKitten: { include: { litter: true } },
      },
    });

    const males = (await prisma.cat.findMany({
      where: {
        ...ownerScope(req),
        gender: "M",
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        titleBeforeName: true,
        titleAfterName: true,
        country: true,
        currentOwnerId: true,
        currentOwnerClientId: true,
        ownerId: true,
        ownershipType: true,
        neutered: true,
        deceased: true,
        kittenNumber: true,
        delivered: true,
        kittenAvailabilityStatus: true,
        gender: true,
        birthDate: true,
        breedingProspect: true,
        owner: { select: { fifeCatteryName: true, settings: true } },
        litterKitten: { include: { litter: true } },
      },
    })).map((male) => ({
      ...male,
      displayName: buildDisplayName(male),
    })).filter(isMaleAvailableForMatingModule);

    const plans = await prisma.matingPlan.findMany({
      where: {
        femaleCatId: { in: females.map((cat) => cat.id) || [0] },
      },
    });

    const planMap = new Map(plans.map((plan) => [plan.femaleCatId, plan]));

    const grouped = Object.fromEntries(STATUS_GROUPS.map((group) => [group.key, []]));

    females
      .filter((female) =>
        isFemaleAvailableForMatingModule(female) &&
        (classifyOperationalCat(female) === "dams" || isDevelopingFemale(female))
      )
      .forEach((female) => {
      const plan = planMap.get(female.id);
      const litterHistory = normalizeLitterHistoryDates(safeJsonParse(plan?.litterHistoryJson));
      const nextCrossDate = computeNextCrossDate(female.birthDate, litterHistory);
      const dppDate = computeDpp(plan?.matingStartDate, plan?.matingEndDate);
      const gestationDays = computeGestationDays(plan?.matingStartDate, plan?.matingEndDate);
      const status = isDevelopingFemale(female)
        ? "EM_DESENVOLVIMENTO"
        : plan?.status || "PARA_ACASALAR";
      const supplement = computeSupplementInfo(female.owner?.settings, plan, nextCrossDate, status === "PARA_ACASALAR");
      const fatherName = female.father?.name || female.fatherName || "-";
      const motherName = female.mother?.name || female.motherName || "-";
      const excessLitterWarning = hasExcessLitterWarning(litterHistory);

      grouped[status] = grouped[status] || [];
      grouped[status].push({
        female,
        plan,
        maleOptions: males.filter(isMaleAvailableForMatingModule),
        litterHistory,
        nextCrossDate,
        dppDate,
        gestationDays,
        supplement,
        excessLitterWarning,
        fatherName,
        motherName,
        status,
        birthDateLabel: formatDate(female.birthDate) || "-",
        femaleDisplayName: buildDisplayName(female),
        pedigree: buildPedigreeNode(female, 5),
      });
    });

    Object.values(grouped).forEach((rows) => {
      rows.sort((a, b) => {
        const aDpp = a.dppDate ? new Date(a.dppDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bDpp = b.dppDate ? new Date(b.dppDate).getTime() : Number.MAX_SAFE_INTEGER;
        if (aDpp !== bDpp) return aDpp - bDpp;

        const aNext = a.nextCrossDate ? new Date(a.nextCrossDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bNext = b.nextCrossDate ? new Date(b.nextCrossDate).getTime() : Number.MAX_SAFE_INTEGER;
        return aNext - bNext;
      });
    });

    const supplementRows = Object.values(grouped)
      .flat()
      .filter((row) => row.supplement?.active)
      .sort((a, b) => {
        const aDate = a.supplement?.orderDate ? new Date(a.supplement.orderDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bDate = b.supplement?.orderDate ? new Date(b.supplement.orderDate).getTime() : Number.MAX_SAFE_INTEGER;
        return aDate - bDate;
      });

    return { grouped, males, supplementRows };
  }

  router.get(
    "/admin/matings",
    requireAuth,
    requirePermission("admin.matings"),
    async (req, res) => {
      const selectedOwnerId = null;
      const { users } = await loadOwnerFilter();
      const { grouped, males, supplementRows } = await buildRows(req);

      res.render("admin-matings/index", {
        user: req.user,
        currentPath: req.path,
        groups: STATUS_GROUPS,
        grouped,
        nextActions: buildNextActions(grouped),
        supplementRows,
        males,
        users,
        selectedOwnerId,
        formatDate,
        formatDateInput,
      });
    }
  );

  router.post(
    "/admin/matings/:femaleCatId",
    requireAuth,
    requirePermission("admin.matings"),
    async (req, res) => {
      const femaleCatId = Number(req.params.femaleCatId);
      const selectedOwnerId = null;

      const female = await prisma.cat.findUnique({
        where: { id: femaleCatId },
        select: { ownerId: true },
      });
      if (!female || female.ownerId !== req.session.userId) {
        return res.status(403).send("Você não tem acesso a esta gata.");
      }
      const maleCatId = req.body.maleCatId ? Number(req.body.maleCatId) : null;
      if (maleCatId) {
        const male = await prisma.cat.findFirst({
          where: {
            id: maleCatId,
            ...ownerScope(req),
          },
          select: { id: true },
        });

        if (!male) {
          return res.status(403).send("Você não tem acesso a este macho.");
        }
      }
      const litterHistory = normalizeLitterHistoryDates(req.body.litterHistoryDates);

      const payload = {
        ownerId: female?.ownerId || null,
        femaleCatId,
        maleCatId,
        status: req.body.status || "PARA_ACASALAR",
        consanguinityJson: JSON.stringify([]),
        litterHistoryJson: JSON.stringify(litterHistory),
        matingStartDate: parseDate(req.body.matingStartDate),
        matingEndDate: parseDate(req.body.matingEndDate),
      };

      await prisma.matingPlan.upsert({
        where: { femaleCatId },
        create: payload,
        update: payload,
      });

      if (req.get("X-Manual-Update") === "true" || req.accepts("json")) {
        const updatedFemale = await prisma.cat.findUnique({
          where: { id: femaleCatId },
          include: {
            owner: { include: { settings: true } },
          },
        });
        const nextCrossDate = computeNextCrossDate(updatedFemale?.birthDate, litterHistory);
        const dppDate = computeDpp(payload.matingStartDate, payload.matingEndDate);
        const gestationDays = computeGestationDays(payload.matingStartDate, payload.matingEndDate);
        const responseStatus = updatedFemale && isDevelopingFemale(updatedFemale)
          ? "EM_DESENVOLVIMENTO"
          : payload.status;
        const supplement = computeSupplementInfo(
          updatedFemale?.owner?.settings,
          payload,
          nextCrossDate,
          responseStatus === "PARA_ACASALAR"
        );
        const excessLitterWarning = hasExcessLitterWarning(litterHistory);

        return res.json({
          ok: true,
          status: responseStatus,
          statusLabel: statusLabel(responseStatus),
          nextCrossLabel: nextCrossDate ? formatDate(nextCrossDate) : "-",
          excessLitterWarning,
          dppLabel: dppDate ? formatDate(dppDate) : "-",
          gestationLabel: gestationDays !== null ? `${gestationDays} dias` : "-",
          supplementActive: Boolean(supplement?.active),
          supplementText: supplement?.active
            ? `${supplement.phase} · início ${formatDate(supplement.startDate)} · ${supplement.endOpen ? "até lançar a data de cruza" : `fim ${formatDate(supplement.endDate)}`}`
            : "",
        });
      }

      const redirectQuery = selectedOwnerId ? `?ownerId=${selectedOwnerId}` : "";
      res.redirect(`/admin/matings${redirectQuery}`);
    }
  );

  return router;
};
