const express = require("express");
const { canViewAllData } = require("../utils/access");
const {
  addMonths,
  addDays,
  formatDate,
  formatDateInput,
  parseDate,
  buildDisplayName,
  classifyOperationalCat,
} = require("../utils/cattery-admin");

const STATUS_GROUPS = [
  { key: "CONFIRMADO", label: "Confirmado" },
  { key: "NAO_CONFIRMADO", label: "Não Confirmado" },
  { key: "PARA_ACASALAR", label: "Para Acasalar" },
  { key: "COM_PROBLEMA", label: "Com Problema" },
  { key: "EM_DESENVOLVIMENTO", label: "Em Desenvolvimento" },
];

function monthsBetween(a, b) {
  let months =
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return months;
}

function safeJsonParse(value, fallback = []) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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
    if (monthsBetween(first, second) < 10) {
      return addMonths(first, 10);
    }
    return addMonths(second, 4);
  }

  const [first, second, third] = recent;
  let candidate =
    monthsBetween(second, third) < 10 ? addMonths(second, 10) : addMonths(third, 4);

  const oldestLimit = addMonths(first, 22);
  if (candidate < oldestLimit) {
    candidate = oldestLimit;
  }

  return candidate;
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
    name: buildDisplayName(cat) || cat.name || "-",
    fatherName: cat.father?.name || cat.fatherName || "",
    motherName: cat.mother?.name || cat.motherName || "",
    father: buildPedigreeNode(cat.father, depth - 1),
    mother: buildPedigreeNode(cat.mother, depth - 1),
  };
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  function ownerScope(req) {
    return canViewAllData(req.session?.userRole) ? {} : { ownerId: req.session.userId };
  }

  async function loadOwnerFilter(req, selectedOwnerId) {
    const users = canViewAllData(req.session?.userRole)
      ? await prisma.user.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true },
        })
      : [];

    return { users, selectedOwnerId };
  }

  async function buildRows(req, selectedOwnerId = null) {
    const scopedOwner = canViewAllData(req.session?.userRole) && selectedOwnerId
      ? { ownerId: selectedOwnerId }
      : ownerScope(req);
    const females = await prisma.cat.findMany({
      where: {
        ...scopedOwner,
        gender: "F",
        kittenNumber: null,
        ...(selectedOwnerId ? { ownerId: selectedOwnerId } : {}),
      },
      orderBy: { name: "asc" },
      include: {
        ...buildAncestorInclude(5),
        owner: true,
      },
    });

    const males = await prisma.cat.findMany({
      where: {
        ...ownerScope(req),
        gender: "M",
        kittenNumber: null,
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, titleBeforeName: true, titleAfterName: true, country: true, currentOwnerId: true, ownerId: true, neutered: true, deceased: true, kittenNumber: true, delivered: true, gender: true, birthDate: true },
    });

    const plans = await prisma.matingPlan.findMany({
      where: {
        femaleCatId: { in: females.map((cat) => cat.id) || [0] },
      },
    });

    const planMap = new Map(plans.map((plan) => [plan.femaleCatId, plan]));

    const grouped = Object.fromEntries(STATUS_GROUPS.map((group) => [group.key, []]));

    females
      .filter((female) => classifyOperationalCat(female) === "dams")
      .forEach((female) => {
      const plan = planMap.get(female.id);
      const litterHistory = safeJsonParse(plan?.litterHistoryJson);
      const nextCrossDate = computeNextCrossDate(female.birthDate, litterHistory);
      const dppDate = computeDpp(plan?.matingStartDate, plan?.matingEndDate);
      const gestationDays = computeGestationDays(plan?.matingStartDate, plan?.matingEndDate);
      const status = plan?.status || "PARA_ACASALAR";
      const fatherName = female.father?.name || female.fatherName || "-";
      const motherName = female.mother?.name || female.motherName || "-";

      grouped[status] = grouped[status] || [];
      grouped[status].push({
        female,
        plan,
        maleOptions: males.filter((male) => classifyOperationalCat(male) === "sires"),
        litterHistory,
        nextCrossDate,
        dppDate,
        gestationDays,
        fatherName,
        motherName,
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

    return { grouped, males };
  }

  router.get(
    "/admin/matings",
    requireAuth,
    requirePermission("admin.matings"),
    async (req, res) => {
      const selectedOwnerId = req.query.ownerId ? Number(req.query.ownerId) : null;
      const { users } = await loadOwnerFilter(req, selectedOwnerId);
      const { grouped, males } = await buildRows(req, selectedOwnerId);

      res.render("admin-matings/index", {
        user: req.user,
        currentPath: req.path,
        groups: STATUS_GROUPS,
        grouped,
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
      const selectedOwnerId = req.body.ownerId ? Number(req.body.ownerId) : null;

      const female = await prisma.cat.findUnique({
        where: { id: femaleCatId },
        select: { ownerId: true },
      });
      if (!female || (!canViewAllData(req.session?.userRole) && female.ownerId !== req.session.userId)) {
        return res.status(403).send("Você não tem acesso a esta gata.");
      }
      const litterHistory = []
        .concat(req.body.litterHistoryDates || [])
        .map((value) => String(value || "").trim())
        .filter((value) => value !== "");

      const payload = {
        ownerId: female?.ownerId || null,
        femaleCatId,
        maleCatId: req.body.maleCatId ? Number(req.body.maleCatId) : null,
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

      const redirectQuery = selectedOwnerId ? `?ownerId=${selectedOwnerId}` : "";
      res.redirect(`/admin/matings${redirectQuery}`);
    }
  );

  return router;
};
