function addMonths(date, amount) {
  const base = new Date(date);
  const next = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + amount, base.getUTCDate()));
  if (next.getUTCDate() !== base.getUTCDate()) {
    next.setUTCDate(0);
  }
  return next;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function dateKey(date) {
  const value = new Date(date);
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function makeRecurringGroupId() {
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

function makePayableGroupId(type = "monthly") {
  return `${type}-${makeRecurringGroupId()}`;
}

function payableGroupType(groupId) {
  const text = String(groupId || "");
  if (text.startsWith("weekly-")) return "weekly";
  if (text.startsWith("installment-weekly-")) return "installment-weekly";
  if (text.startsWith("installment-monthly-")) return "installment-monthly";
  return "monthly";
}

function currentMonthAnchorFrom(date) {
  const today = new Date();
  const source = new Date(date);
  const firstDayCurrentMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  if (source >= firstDayCurrentMonth) return source;
  const anchor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), source.getUTCDate()));
  if (anchor.getUTCMonth() !== today.getUTCMonth()) {
    anchor.setUTCDate(0);
  }
  return anchor;
}

function currentWeekAnchorFrom(date) {
  const today = new Date();
  const anchor = new Date(date);
  while (anchor < today) {
    anchor.setUTCDate(anchor.getUTCDate() + 7);
  }
  return anchor;
}

async function ensureFixedPayableWindow(prisma, seed, months = 12) {
  if (!seed?.isFixed) return;
  const groupType = payableGroupType(seed.recurringGroupId);
  const recurringGroupId = seed.recurringGroupId || makePayableGroupId("monthly");
  if (!seed.recurringGroupId) {
    await prisma.accountPayable.update({
      where: { id: seed.id },
      data: { recurringGroupId },
    });
  }

  const groupRows = await prisma.accountPayable.findMany({
    where: {
      ownerId: seed.ownerId,
      recurringGroupId,
    },
    select: { dueDate: true },
  });
  const existingDates = new Set(groupRows.map((row) => dateKey(row.dueDate)));
  const anchorDate = groupType === "weekly"
    ? currentWeekAnchorFrom(seed.dueDate)
    : currentMonthAnchorFrom(seed.dueDate);
  const rowsToCreate = [];
  const steps = groupType === "weekly" ? 52 : months;

  for (let index = 0; index < steps; index += 1) {
    const dueDate = groupType === "weekly" ? addDays(anchorDate, index * 7) : addMonths(anchorDate, index);
    const key = dateKey(dueDate);
    if (existingDates.has(key)) continue;
    rowsToCreate.push({
      ownerId: seed.ownerId,
      supplier: seed.supplier,
      category: seed.category,
      description: seed.description,
      amountCents: seed.amountCents,
      dueDate,
      paymentMethod: seed.paymentMethod,
      note: seed.note,
      isFixed: true,
      recurringGroupId,
    });
  }

  if (rowsToCreate.length) {
    await prisma.accountPayable.createMany({ data: rowsToCreate });
  }
}

async function ensureFixedPayablesWindow(prisma, ownerWhere = {}, months = 12) {
  const seeds = await prisma.accountPayable.findMany({
    where: {
      ...ownerWhere,
      isFixed: true,
      status: "PENDING",
    },
    orderBy: [{ recurringGroupId: "asc" }, { dueDate: "asc" }, { id: "asc" }],
  });
  const firstByGroup = new Map();
  seeds.forEach((seed) => {
    const key = seed.recurringGroupId || `single-${seed.id}`;
    if (!firstByGroup.has(key)) firstByGroup.set(key, seed);
  });
  for (const seed of firstByGroup.values()) {
    await ensureFixedPayableWindow(prisma, seed, months);
  }
}

module.exports = {
  ensureFixedPayableWindow,
  ensureFixedPayablesWindow,
  makeRecurringGroupId,
  makePayableGroupId,
  payableGroupType,
};
