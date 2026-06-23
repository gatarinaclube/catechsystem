const express = require("express");
const PDFDocument = require("pdfkit");
const { canViewAllData } = require("../utils/access");

function todayParts() {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  return today.split("-").map(Number);
}

function currentMonthInput() {
  const [year, month] = todayParts();
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseDateInput(value, fallback) {
  const text = String(value || fallback || "").slice(0, 10);
  const [year, month, day] = text.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(date) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

function formatDateOnlyLabel(date) {
  if (!date) return "-";
  const value = new Date(date);
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const year = value.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function formatCurrency(cents) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function clampDay(value, fallback = 1) {
  return Math.min(31, Math.max(1, Number.parseInt(value || fallback, 10) || fallback));
}

function utcDateWithClampedDay(year, monthIndex, day) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(day, lastDay)));
}

function cardInvoiceDates(month, closingDay, dueDay) {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const closingDate = utcDateWithClampedDay(year, monthIndex, closingDay);
  const previousClosingDate = utcDateWithClampedDay(year, monthIndex - 1, closingDay);
  const startDate = addDays(previousClosingDate, 1);
  const dueMonthIndex = dueDay > closingDay ? monthIndex : monthIndex + 1;
  const dueDate = utcDateWithClampedDay(year, dueMonthIndex, dueDay);
  return { startDate, closingDate, previousClosingDate, dueDate };
}

function previousMonthInput(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildExpenseFilters(query) {
  const periodType = query.periodType === "custom" ? "custom" : "month";
  const month = /^\d{4}-\d{2}$/.test(query.month || "")
    ? query.month
    : currentMonthInput();

  let startDate;
  let endDate;

  if (periodType === "custom") {
    startDate = parseDateInput(query.startDate, null);
    endDate = parseDateInput(query.endDate, null);

    if (!startDate || !endDate) {
      const [year, monthNumber] = month.split("-").map(Number);
      startDate = new Date(Date.UTC(year, monthNumber - 1, 1));
      endDate = new Date(Date.UTC(year, monthNumber, 0));
    }
  } else {
    const [year, monthNumber] = month.split("-").map(Number);
    startDate = new Date(Date.UTC(year, monthNumber - 1, 1));
    endDate = new Date(Date.UTC(year, monthNumber, 0));
  }

  return {
    periodType,
    month,
    startDate,
    endDate,
    startDateInput: formatDateInput(startDate),
    endDateInput: formatDateInput(endDate),
    account: String(query.account || "").trim(),
  };
}

function buildCreditCardFilters(query) {
  const month = /^\d{4}-\d{2}$/.test(query.month || "")
    ? query.month
    : currentMonthInput();
  return {
    month,
    card: String(query.card || "").trim(),
  };
}

function buildRevenueFilters(query) {
  return buildExpenseFilters(query);
}

function buildAccountingFilters(query) {
  const periodType = ["last3", "month", "custom"].includes(query.periodType)
    ? query.periodType
    : "last3";
  const month = /^\d{4}-\d{2}$/.test(query.month || "")
    ? query.month
    : currentMonthInput();
  const [year, monthNumber] = month.split("-").map(Number);
  let startDate;
  let endDate;

  if (periodType === "custom") {
    startDate = parseDateInput(query.startDate, null);
    endDate = parseDateInput(query.endDate, null);
  } else if (periodType === "month") {
    startDate = new Date(Date.UTC(year, monthNumber - 1, 1));
    endDate = new Date(Date.UTC(year, monthNumber, 0));
  } else {
    startDate = new Date(Date.UTC(year, monthNumber - 3, 1));
    endDate = new Date(Date.UTC(year, monthNumber, 0));
  }

  if (!startDate || !endDate) {
    startDate = new Date(Date.UTC(year, monthNumber - 3, 1));
    endDate = new Date(Date.UTC(year, monthNumber, 0));
  }

  return {
    periodType,
    month,
    startDate,
    endDate,
    startDateInput: formatDateInput(startDate),
    endDateInput: formatDateInput(endDate),
    account: String(query.account || "").trim(),
  };
}

function buildExpenseWhere(req, filters) {
  const where = {
    ...(canViewAllData(req.session?.userRole) ? {} : { ownerId: req.session.userId }),
    competenceDate: {
      gte: filters.startDate,
      lt: addDays(filters.endDate, 1),
    },
  };

  if (filters.account) {
    where.paymentMethod = filters.account;
  }

  return where;
}

function buildRevenueWhere(req, filters) {
  return {
    ...(canViewAllData(req.session?.userRole) ? {} : { ownerId: req.session.userId }),
  };
}

function buildQueryString(filters, forcePdf = false) {
  const params = new URLSearchParams({
    periodType: filters.periodType,
    month: filters.month,
    startDate: filters.startDateInput,
    endDate: filters.endDateInput,
    account: filters.account || "",
  });

  if (forcePdf) {
    params.set("download", "pdf");
  }

  return params.toString();
}

function buildCreditCardQueryString(filters, forcePdf = false) {
  const params = new URLSearchParams({
    card: filters.card || "",
    month: filters.month || currentMonthInput(),
  });

  if (forcePdf) {
    params.set("download", "pdf");
  }

  return params.toString();
}

function ownerScope(req) {
  if (canViewAllData(req.session?.userRole)) return {};
  return { ownerId: req.session?.userId || null };
}

function settingScope(req) {
  if (canViewAllData(req.session?.userRole)) return {};
  return { ownerId: req.session?.userId || null };
}

function mapExpenseRows(expenses) {
  return expenses.map((expense) => ({
    ...expense,
    dateLabel: formatDateOnlyLabel(expense.competenceDate),
    amountLabel: formatCurrency(expense.amountCents),
  }));
}

function parseParcelData(value) {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function mapCreditCardPurchaseRows(expenses, dates) {
  const startTime = dates.startDate.getTime();
  const endTime = addDays(dates.closingDate, 1).getTime();
  const rows = [];

  expenses.forEach((expense) => {
    const parcels = parseParcelData(expense.parcelDataJson);

    if (parcels.length) {
      parcels.forEach((parcel) => {
        const parcelDate = parseDateInput(parcel.date, null);
        if (!parcelDate) return;

        const parcelTime = parcelDate.getTime();
        if (parcelTime < startTime || parcelTime >= endTime) return;

        rows.push({
          ...expense,
          parcelNumber: parcel.number,
          parcelLabel: `${parcel.number || "-"} / ${expense.installments || parcels.length || "-"}`,
          competenceDate: parcelDate,
          dateLabel: formatDateOnlyLabel(parcelDate),
          amountCents: Number(parcel.amountCents || 0),
          amountLabel: formatCurrency(parcel.amountCents),
        });
      });
      return;
    }

    const expenseTime = new Date(expense.competenceDate).getTime();
    if (expenseTime < startTime || expenseTime >= endTime) return;

    rows.push({
      ...expense,
      parcelLabel: expense.paymentMode === "Parcelado" && expense.installments
        ? `1 / ${expense.installments}`
        : "",
      dateLabel: formatDateOnlyLabel(expense.competenceDate),
      amountLabel: formatCurrency(expense.amountCents),
    });
  });

  return rows.sort((a, b) => {
    const dateCompare = new Date(a.competenceDate).getTime() - new Date(b.competenceDate).getTime();
    return dateCompare || Number(a.id) - Number(b.id);
  });
}

function kittenNameOnly(label) {
  return String(label || "-").replace(/^\s*[^-]+-\s*/, "") || "-";
}

function parcelCancellationNote(parcel) {
  if (!parcel?.canceled) return "";
  const refundDate = parcel.refundDate ? parseDateInput(parcel.refundDate, null) : null;
  return refundDate
    ? `Pagamento cancelado. Estorno em ${formatDateOnlyLabel(refundDate)}.`
    : "Pagamento cancelado.";
}

function mapRevenueRows(revenues, filters) {
  const rows = [];
  const startTime = filters.startDate.getTime();
  const endTime = addDays(filters.endDate, 1).getTime();

  revenues.forEach((revenue) => {
    parseParcelData(revenue.parcelDataJson).forEach((parcel) => {
      if (!parcel.paid || !parcel.date) return;

      const paidDate = parseDateInput(parcel.date, null);
      if (!paidDate) return;

      const paidTime = paidDate.getTime();
      if (paidTime < startTime || paidTime >= endTime) return;
      const paymentAccount = parcel.paymentAccount || revenue.paymentAccount || "";
      if (filters.account && paymentAccount !== filters.account) return;

      rows.push({
        ...revenue,
        parcelNumber: parcel.number,
        parcelLabel: `${parcel.number || "-"} / ${revenue.installments || "-"}`,
        paymentLabel: parcel.number ? `Pagamento ${parcel.number}/${revenue.installments || "-"}` : "",
        paidDateTime: paidTime,
        dateLabel: formatDateOnlyLabel(paidDate),
        amountLabel: formatCurrency(parcel.amountCents),
        amountCents: parcel.amountCents || 0,
        canceled: parcel.canceled === true,
        clientLabel: revenue.client?.fullName || "Cliente desconhecido",
        invoiceLabel: revenue.invoiceNumber ? `NF ${revenue.invoiceNumber}` : "",
        paymentAccount,
        note: parcelCancellationNote(parcel),
      });
    });
  });

  return rows.sort((a, b) => {
    const dateCompare = b.paidDateTime - a.paidDateTime;
    return dateCompare || Number(b.id) - Number(a.id);
  });
}

function buildRevenueTotals(rows) {
  const totalCents = rows.reduce((sum, row) => sum + Number(row.amountCents || 0), 0);
  const canceledCents = rows
    .filter((row) => row.canceled)
    .reduce((sum, row) => sum + Number(row.amountCents || 0), 0);
  const receivedCents = totalCents - canceledCents;

  return {
    totalCents,
    canceledCents,
    receivedCents,
    totalLabel: formatCurrency(totalCents),
    canceledLabel: formatCurrency(canceledCents),
    receivedLabel: formatCurrency(receivedCents),
  };
}

function currentMonthStartDate() {
  const [year, month] = todayParts();
  return new Date(Date.UTC(year, month - 1, 1));
}

function mapReceivableRows(revenues, filters) {
  const rows = [];
  const startTime = currentMonthStartDate().getTime();

  revenues.forEach((revenue) => {
    parseParcelData(revenue.parcelDataJson).forEach((parcel) => {
      if (parcel.paid || parcel.canceled || !parcel.date || !parcel.amountCents) return;

      const dueDate = parseDateInput(parcel.date, null);
      if (!dueDate) return;

      const dueTime = dueDate.getTime();
      if (dueTime < startTime) return;
      const paymentAccount = parcel.paymentAccount || revenue.paymentAccount || "";
      if (filters.account && paymentAccount !== filters.account) return;

      rows.push({
        ...revenue,
        parcelNumber: parcel.number,
        parcelLabel: `${parcel.number || "-"} / ${revenue.installments || "-"}`,
        dueDateTime: dueTime,
        dateLabel: formatDateOnlyLabel(dueDate),
        amountLabel: formatCurrency(parcel.amountCents),
        amountCents: parcel.amountCents || 0,
        clientLabel: revenue.client?.fullName || "Cliente desconhecido",
        paymentAccount,
      });
    });
  });

  return rows.sort((a, b) => {
    const dateCompare = a.dueDateTime - b.dueDateTime;
    return dateCompare || Number(a.id) - Number(b.id);
  });
}

function mapRefundRows(revenues, filters) {
  const rows = [];
  const startTime = filters.startDate.getTime();
  const endTime = addDays(filters.endDate, 1).getTime();

  revenues.forEach((revenue) => {
    parseParcelData(revenue.parcelDataJson).forEach((parcel) => {
      if (!parcel.paid || !parcel.canceled || !parcel.refundDate || !parcel.amountCents) return;

      const refundDate = parseDateInput(parcel.refundDate, null);
      if (!refundDate) return;

      const refundTime = refundDate.getTime();
      if (refundTime < startTime || refundTime >= endTime) return;
      const paymentAccount = parcel.paymentAccount || revenue.paymentAccount || "";
      if (filters.account && paymentAccount !== filters.account) return;

      rows.push({
        id: `refund-${revenue.id}-${parcel.number || ""}`,
        revenueId: revenue.id,
        parcelNumber: parcel.number,
        parcelLabel: `${parcel.number || "-"} / ${revenue.installments || "-"}`,
        dateTime: refundTime,
        dateLabel: formatDateOnlyLabel(refundDate),
        amountCents: -Number(parcel.amountCents || 0),
        amountLabel: `- ${formatCurrency(parcel.amountCents)}`,
        kittenLabel: revenue.kittenLabel || "-",
        clientLabel: revenue.client?.fullName || "Cliente desconhecido",
        paymentAccount,
        note: `Estorno referente ao pagamento de ${parcel.date ? formatDateOnlyLabel(parseDateInput(parcel.date, null)) : "data não informada"}.`,
      });
    });
  });

  return rows.sort((a, b) => {
    const dateCompare = b.dateTime - a.dateTime;
    return dateCompare || String(b.id).localeCompare(String(a.id));
  });
}

function mapTransferRows(transfers, filters) {
  const startTime = filters.startDate.getTime();
  const endTime = addDays(filters.endDate, 1).getTime();
  const rows = [];

  transfers.forEach((transfer) => {
    const transferTime = new Date(transfer.transferDate).getTime();
    if (transferTime < startTime || transferTime >= endTime) return;

    if (!filters.account || filters.account === transfer.toAccount) {
      rows.push({
        id: `transfer-in-${transfer.id}`,
        dateTime: transferTime,
        dateLabel: formatDateOnlyLabel(transfer.transferDate),
        typeLabel: "Transferência",
        account: transfer.toAccount,
        description: `Entrada de ${transfer.fromAccount}`,
        note: transfer.note || "",
        amountCents: Number(transfer.amountCents || 0),
        amountLabel: formatCurrency(transfer.amountCents),
      });
    }

    if (!filters.account || filters.account === transfer.fromAccount) {
      rows.push({
        id: `transfer-out-${transfer.id}`,
        dateTime: transferTime,
        dateLabel: formatDateOnlyLabel(transfer.transferDate),
        typeLabel: "Transferência",
        account: transfer.fromAccount,
        description: `Saída para ${transfer.toAccount}`,
        note: transfer.note || "",
        amountCents: -Number(transfer.amountCents || 0),
        amountLabel: `- ${formatCurrency(transfer.amountCents)}`,
      });
    }
  });

  return rows;
}

function mapCashFlowRows(expenses, revenueRows, transfers, filters, refundRows = []) {
  const invoiceLabel = (row) => row.invoiceNumber ? `NF ${row.invoiceNumber}` : "";
  const parcelLabel = (row) => row.parcelLabel ? `Pagamento ${String(row.parcelLabel).replace(/\s+/g, "")}` : "";

  const expenseRows = mapExpenseRows(expenses).map((expense) => ({
    id: `expense-${expense.id}`,
    dateTime: new Date(expense.competenceDate).getTime(),
    dateLabel: expense.dateLabel,
    typeLabel: "Saída",
    account: expense.paymentMethod || "-",
    description: [expense.category, expense.supplier].filter(Boolean).join(" · ") || "Despesa",
    note: expense.note || "",
    amountCents: -Number(expense.amountCents || 0),
    amountLabel: `- ${formatCurrency(expense.amountCents)}`,
  }));

  const incomeRows = revenueRows.map((revenue) => ({
    id: `revenue-${revenue.id}-${revenue.parcelNumber || ""}`,
    dateTime: revenue.paidDateTime,
    dateLabel: revenue.dateLabel,
    typeLabel: "Entrada",
    account: revenue.paymentAccount || "-",
    description: [kittenNameOnly(revenue.kittenLabel), revenue.clientLabel, invoiceLabel(revenue), parcelLabel(revenue)].filter(Boolean).join(" · ") || "Receita",
    note: revenue.note || "",
    amountCents: Number(revenue.amountCents || 0),
    amountLabel: formatCurrency(revenue.amountCents),
    canceled: revenue.canceled === true,
  }));

  const refundCashRows = refundRows.map((refund) => ({
    id: refund.id,
    dateTime: refund.dateTime,
    dateLabel: refund.dateLabel,
    typeLabel: "Estorno",
    account: refund.paymentAccount || "-",
    description: [kittenNameOnly(refund.kittenLabel), refund.clientLabel, invoiceLabel(refund), parcelLabel(refund)].filter(Boolean).join(" · ") || "Estorno",
    note: refund.note || "",
    amountCents: Number(refund.amountCents || 0),
    amountLabel: refund.amountLabel,
  }));

  return [...incomeRows, ...expenseRows, ...refundCashRows, ...mapTransferRows(transfers, filters)].sort((a, b) => {
    const dateCompare = b.dateTime - a.dateTime;
    return dateCompare || String(b.id).localeCompare(String(a.id));
  });
}

function buildCashFlowTotals(rows) {
  const incomeCents = rows
    .filter((row) => row.amountCents > 0)
    .reduce((sum, row) => sum + Number(row.amountCents || 0), 0);
  const canceledCents = rows
    .filter((row) => row.canceled)
    .reduce((sum, row) => sum + Number(row.amountCents || 0), 0);
  const receivedCents = incomeCents - canceledCents;
  const expenseCents = rows
    .filter((row) => row.amountCents < 0)
    .reduce((sum, row) => sum + Math.abs(Number(row.amountCents || 0)), 0);
  const balanceCents = incomeCents - expenseCents;

  return {
    incomeCents,
    canceledCents,
    receivedCents,
    expenseCents,
    balanceCents,
    incomeLabel: formatCurrency(incomeCents),
    canceledLabel: formatCurrency(canceledCents),
    receivedLabel: formatCurrency(receivedCents),
    expenseLabel: formatCurrency(expenseCents),
    balanceLabel: formatCurrency(balanceCents),
  };
}

function monthKeyFromDate(date) {
  const parsed = new Date(date);
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabelFromKey(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function buildMonthBuckets(filters) {
  const buckets = [];
  const cursor = new Date(Date.UTC(filters.startDate.getUTCFullYear(), filters.startDate.getUTCMonth(), 1));
  const end = new Date(Date.UTC(filters.endDate.getUTCFullYear(), filters.endDate.getUTCMonth(), 1));

  while (cursor <= end) {
    const key = monthKeyFromDate(cursor);
    buckets.push({ key, label: monthLabelFromKey(key), rows: [], totalCents: 0 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return buckets.reverse();
}

function buildRowMonthBuckets(rows, dateGetter) {
  const keys = Array.from(new Set(
    rows
      .map((row) => dateGetter(row))
      .filter(Boolean)
      .map(monthKeyFromDate)
  )).sort((a, b) => a.localeCompare(b));

  return keys.map((key) => ({
    key,
    label: monthLabelFromKey(key),
    rows: [],
    totalCents: 0,
  }));
}

function groupRowsByMonth(rows, filters, dateGetter, options = {}) {
  const buckets = options.onlyWithRows
    ? buildRowMonthBuckets(rows, dateGetter)
    : buildMonthBuckets(filters);
  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  rows.forEach((row) => {
    const date = dateGetter(row);
    if (!date) return;
    const bucket = bucketMap.get(monthKeyFromDate(date));
    if (!bucket) return;
    bucket.rows.push(row);
    bucket.totalCents += Number(row.amountCents || 0);
  });

  buckets.forEach((bucket) => {
    bucket.rows.sort((a, b) => {
      const aTime = new Date(dateGetter(a)).getTime();
      const bTime = new Date(dateGetter(b)).getTime();
      return options.direction === "asc" ? aTime - bTime : bTime - aTime;
    });
    bucket.totalLabel = bucket.totalCents < 0
      ? `- ${formatCurrency(Math.abs(bucket.totalCents))}`
      : formatCurrency(bucket.totalCents);
  });

  return buckets;
}

function buildAccountingExpenseRows(expenses, transfers, filters, account, refundRows = []) {
  const expenseRows = mapExpenseRows(
    expenses.filter((expense) => !account || expense.paymentMethod === account)
  ).map((expense) => ({
    id: `expense-${expense.id}`,
    date: expense.competenceDate,
    dateTime: new Date(expense.competenceDate).getTime(),
    dateLabel: expense.dateLabel,
    typeLabel: "Despesa",
    account: expense.paymentMethod || "-",
    description: [expense.category, expense.supplier].filter(Boolean).join(" · ") || "Despesa",
    note: expense.note || "",
    amountCents: -Number(expense.amountCents || 0),
    amountLabel: `- ${formatCurrency(expense.amountCents)}`,
  }));

  const refundAccountRows = refundRows
    .filter((refund) => !account || refund.paymentAccount === account)
    .map((refund) => ({
      id: refund.id,
      date: new Date(refund.dateTime),
      dateTime: refund.dateTime,
      dateLabel: refund.dateLabel,
      typeLabel: "Estorno",
      account: refund.paymentAccount || "-",
      description: [kittenNameOnly(refund.kittenLabel), refund.clientLabel].filter(Boolean).join(" · ") || "Estorno",
      note: refund.note || "",
      amountCents: Number(refund.amountCents || 0),
      amountLabel: refund.amountLabel,
    }));

  const transferRows = mapTransferRows(transfers, { ...filters, account });
  return [...expenseRows, ...refundAccountRows, ...transferRows].sort((a, b) => b.dateTime - a.dateTime);
}

function pickAccountingAccounts(accountOptions, selectedAccount = "") {
  const names = accountOptions.map((option) => option.value).filter(Boolean);
  if (selectedAccount) return [selectedAccount];

  const sicoob = names.find((name) => /sicoob/i.test(name) && !/cart|cr[eé]dito/i.test(name))
    || names.find((name) => /sicoob/i.test(name))
    || names[0]
    || "";
  const credit = names.find((name) => /cart|cr[eé]dito/i.test(name) && name !== sicoob)
    || names.find((name) => name !== sicoob)
    || "";

  return [sicoob, credit].filter(Boolean);
}

async function loadCreditCardNames(prisma, req) {
  const cardSettings = await prisma.financialAccountSetting.findMany({
    where: { ...settingScope(req), isCreditCard: true },
    select: { accountName: true },
  });
  return new Set(cardSettings.map((setting) => setting.accountName).filter(Boolean));
}

async function loadAccountOptions(prisma, req, { includeCreditCards = false } = {}) {
  const creditCardNames = await loadCreditCardNames(prisma, req);
  const rows = await prisma.quickLaunchOption.findMany({
    where: { type: "PAYMENT", disabledAt: null },
    orderBy: { name: "asc" },
    select: { name: true },
  });
  const names = Array.from(new Set(rows.map((row) => row.name).filter(Boolean)))
    .filter((name) => includeCreditCards || !creditCardNames.has(name))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return [{ value: "", label: "Todas" }].concat(
    names.map((name) => ({ value: name, label: name }))
  );
}

function filterCreditCardExpenses(expenses, creditCardNames) {
  if (!creditCardNames.size) return expenses;
  return expenses.filter((expense) => !creditCardNames.has(expense.paymentMethod || ""));
}

function firstName(value) {
  return String(value || "").trim().split(/\s+/)[0] || "";
}

function compactDateLabel(date) {
  const label = formatDateOnlyLabel(date);
  return label === "-" ? "" : label;
}

function compactShortDateLabel(date) {
  const label = compactDateLabel(date);
  return label ? label.replace(/\/(\d{2})(\d{2})$/, "/$2") : "";
}

function searchableText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeOption(value, allowed, fallback) {
  const text = String(value || "").trim();
  return allowed.includes(text) ? text : fallback;
}

function normalizeReservationSavePayload(body) {
  const registrationStatus = { ...(body.registrationStatus || {}) };
  const kittenRows = { ...(body.kittenRows || {}) };
  const summaryIds = new Set([].concat(body.summaryIds || []).map(Number).filter(Boolean));

  Object.entries(body || {}).forEach(([key, value]) => {
    const registrationMatch = key.match(/^registrationStatus\[(\d+)\]$/);
    if (registrationMatch) {
      registrationStatus[registrationMatch[1]] = value;
      summaryIds.add(Number(registrationMatch[1]));
      return;
    }

    const flatRegistrationMatch = key.match(/^registrationStatus_(\d+)$/);
    if (flatRegistrationMatch) {
      registrationStatus[flatRegistrationMatch[1]] = value;
      summaryIds.add(Number(flatRegistrationMatch[1]));
      return;
    }

    const kittenMatch = key.match(/^kittenRows\[(\d+)\]\[(\d+)\]\[([^\]]+)\]$/);
    if (kittenMatch) {
      const [, summaryId, kittenId, field] = kittenMatch;
      summaryIds.add(Number(summaryId));
      kittenRows[summaryId] = kittenRows[summaryId] || {};
      kittenRows[summaryId][kittenId] = kittenRows[summaryId][kittenId] || {};
      kittenRows[summaryId][kittenId][field] = value;
      return;
    }

    const flatKittenMatch = key.match(/^kittenRow_(\d+)_(\d+)_(\w+)$/);
    if (flatKittenMatch) {
      const [, summaryId, kittenId, field] = flatKittenMatch;
      summaryIds.add(Number(summaryId));
      kittenRows[summaryId] = kittenRows[summaryId] || {};
      kittenRows[summaryId][kittenId] = kittenRows[summaryId][kittenId] || {};
      kittenRows[summaryId][kittenId][field] = value;
    }
  });

  return { registrationStatus, kittenRows, summaryIds: Array.from(summaryIds) };
}

function paymentDatesLabel(parcels) {
  return parcels
    .filter((parcel) => parcel.paid && parcel.date && !parcel.canceled)
    .map((parcel) => {
      const amount = formatCurrency(parcel.amountCents || 0);
      return `${formatDateOnlyLabel(parseDateInput(parcel.date, null))}: ${amount}`;
    })
    .join(" | ");
}

function paidAmountCents(parcels) {
  return parcels
    .filter((parcel) => parcel.paid && !parcel.canceled)
    .reduce((sum, parcel) => sum + Number(parcel.amountCents || 0), 0);
}

function revenueSummary(revenue) {
  if (!revenue) {
    return {
      buyerFirstName: "",
      accountNote: "",
      valueCents: 0,
      freightCents: 0,
      totalCents: 0,
      paidCents: 0,
      remainingCents: 0,
      paymentDates: "",
    };
  }

  const parcels = parseParcelData(revenue.parcelDataJson);
  const paidCents = paidAmountCents(parcels);
  const totalCents = Number(revenue.totalAmountCents || 0);
  const firstParcelAccount = parcels.find((parcel) => parcel.paymentAccount)?.paymentAccount;
  const account = firstParcelAccount || revenue.paymentAccount || "";
  const invoice = revenue.invoiceNumber ? `NF ${revenue.invoiceNumber}` : "";

  return {
    buyerFirstName: firstName(revenue.client?.fullName),
    accountNote: [account, invoice].filter(Boolean).join(" / "),
    valueCents: Number(revenue.catAmountCents || 0),
    freightCents: Number(revenue.transportAmountCents || 0),
    totalCents,
    paidCents,
    remainingCents: totalCents - paidCents,
    paymentDates: paymentDatesLabel(parcels),
  };
}

function revenueHasCanceledPayment(revenue) {
  return parseParcelData(revenue?.parcelDataJson).some((parcel) => parcel.canceled === true);
}

function reservationKittenNameLabel(kitten) {
  const currentName = String(kitten?.kittenCat?.name || kitten?.name || "").trim();
  if (currentName) return currentName;

  const sex = String(kitten?.kittenCat?.gender || kitten?.sex || "").trim().toUpperCase();
  if (sex === "M") return "Macho";
  if (sex === "F") return "Fêmea";
  return "-";
}

function kittenReservationClass(kitten, revenue, forceAvailable = false) {
  const status = String(kitten.kittenCat?.kittenAvailabilityStatus || "").toUpperCase();
  if (status === "DECEASED" || kitten.deceased) return "is-deceased";
  if (forceAvailable) return "is-available";
  if (status === "DELIVERED" || kitten.kittenCat?.delivered) return "is-delivered";
  if (revenue || status === "RESERVED" || kitten.kittenCat?.sold) return "is-reserved";
  if (status === "AVAILABLE") return "is-available";
  return "is-unavailable";
}

function ownerIdForReport(req, litter) {
  return canViewAllData(req.session?.userRole) ? litter.ownerId || req.session.userId : req.session.userId;
}

function littersScope(req) {
  return canViewAllData(req.session?.userRole) ? {} : { ownerId: req.session.userId };
}

function reservationLitterSortNumber(summary) {
  const raw = String(summary?.litter?.litterNumber || "").match(/\d+/)?.[0];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number(summary?.litterId || summary?.litter?.id || summary?.id || 0);
}

function shortMotherName(litter) {
  const name = String(litter?.femaleName || "").trim();
  if (!name) return "-";

  const withoutCountryPrefix = name.replace(/^[A-Z]{2}\*[^ ]+\s+/i, "").trim();
  if (withoutCountryPrefix && withoutCountryPrefix !== name) return withoutCountryPrefix;

  const catteryName = String(litter?.catteryName || "").trim();
  if (catteryName && name.toLowerCase().startsWith(catteryName.toLowerCase())) {
    return name.slice(catteryName.length).trim() || name;
  }

  return name;
}

async function loadReservationLitterOptions(prisma, req) {
  const litters = await prisma.litter.findMany({
    where: littersScope(req),
    select: {
      id: true,
      litterNumber: true,
      femaleName: true,
      maleName: true,
      litterBirthDate: true,
    },
    orderBy: [{ litterBirthDate: "desc" }, { id: "desc" }],
    take: 300,
  });

  return litters.map((litter) => ({
    id: litter.id,
    label: [
      `#${litter.id}`,
      litter.litterNumber ? `Ninhada ${litter.litterNumber}` : null,
      litter.femaleName ? `Mãe ${litter.femaleName}` : null,
      litter.maleName ? `Pai ${litter.maleName}` : null,
      litter.litterBirthDate ? `Nascimento ${formatDateOnlyLabel(litter.litterBirthDate)}` : null,
    ].filter(Boolean).join(" · "),
  }));
}

async function findReservationLitter(prisma, req, body) {
  const selectedId = Number(body.litterId || "");
  if (Number.isFinite(selectedId) && selectedId > 0) {
    return prisma.litter.findFirst({
      where: { ...littersScope(req), id: selectedId },
    });
  }

  const query = String(body.litterQuery || "").trim();
  if (!query) return null;
  const numeric = Number(query.replace(/[^\d]/g, ""));

  if (Number.isFinite(numeric) && numeric > 0) {
    const byNumber = await prisma.litter.findFirst({
      where: {
        ...littersScope(req),
        OR: [
          { id: numeric },
          { litterNumber: { contains: String(numeric) } },
        ],
      },
    });
    if (byNumber) return byNumber;
  }

  const litters = await prisma.litter.findMany({
    where: {
      ...littersScope(req),
      OR: [
        { femaleName: { contains: query, mode: "insensitive" } },
        { maleName: { contains: query, mode: "insensitive" } },
        { litterNumber: { contains: query, mode: "insensitive" } },
        { catteryName: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: [{ litterBirthDate: "desc" }, { id: "desc" }],
    take: 1,
  });

  if (litters[0]) return litters[0];

  const fallbackLitters = await prisma.litter.findMany({
    where: littersScope(req),
    orderBy: [{ litterBirthDate: "desc" }, { id: "desc" }],
    take: 300,
  });
  const normalizedQuery = searchableText(query);

  return fallbackLitters.find((litter) => {
    const label = [
      litter.femaleName,
      litter.maleName,
      litter.litterNumber,
      litter.catteryName,
      compactDateLabel(litter.litterBirthDate),
      compactShortDateLabel(litter.litterBirthDate),
    ].filter(Boolean).join(" ");
    return searchableText(label).includes(normalizedQuery);
  }) || null;
}

async function ensureReservationSummary(prisma, req, litter) {
  const ownerId = ownerIdForReport(req, litter);
  const existing = await prisma.reservationPaymentLitter.findFirst({
    where: { ownerId, litterId: litter.id },
    select: { id: true },
  });

  if (existing) return existing;

  return prisma.reservationPaymentLitter.create({
    data: {
      ownerId,
      litterId: litter.id,
    },
    select: { id: true },
  });
}

async function ensureReservationKittenRow(prisma, summaryId, litterKittenId, data = {}) {
  return prisma.reservationPaymentKitten.upsert({
    where: {
      summaryId_litterKittenId: {
        summaryId,
        litterKittenId,
      },
    },
    update: data,
    create: {
      summaryId,
      litterKittenId,
      ...data,
    },
  });
}

function parseSummaryKittenToken(value) {
  const [summaryText, kittenText] = String(value || "").split(":");
  const summaryId = Number(summaryText);
  const litterKittenId = Number(kittenText);
  if (!Number.isFinite(summaryId) || !Number.isFinite(litterKittenId)) {
    return null;
  }
  return { summaryId, litterKittenId };
}

async function ensureSummaryKittenAccess(prisma, req, summaryId, litterKittenId) {
  const summary = await prisma.reservationPaymentLitter.findFirst({
    where: { id: summaryId, ...ownerScope(req) },
    include: { litter: { include: { kittens: { select: { id: true } } } } },
  });

  if (!summary) return null;
  const validKitten = (summary.litter?.kittens || []).some((kitten) => kitten.id === litterKittenId);
  return validKitten ? summary : null;
}

async function loadReservationPaymentReport(prisma, req) {
  const summaries = await prisma.reservationPaymentLitter.findMany({
    where: ownerScope(req),
    include: {
      rows: true,
      litter: {
        include: {
          kittens: {
            include: {
              kittenCat: true,
            },
            orderBy: [{ index: "asc" }, { id: "asc" }],
          },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const kittenCatIds = summaries
    .flatMap((summary) => summary.litter?.kittens || [])
    .map((kitten) => kitten.kittenCatId)
    .filter(Boolean);

  const revenues = kittenCatIds.length
    ? await prisma.revenueEntry.findMany({
        where: {
          ...ownerScope(req),
          kittenId: { in: kittenCatIds },
        },
        include: { client: true },
        orderBy: [{ createdAt: "desc" }],
      })
    : [];
  const revenueByKittenId = new Map();
  const canceledRevenueKittenIds = new Set();
  revenues.forEach((revenue) => {
    if (revenueHasCanceledPayment(revenue)) {
      canceledRevenueKittenIds.add(revenue.kittenId);
      return;
    }

    if (!revenueByKittenId.has(revenue.kittenId)) {
      revenueByKittenId.set(revenue.kittenId, revenue);
    }
  });

  return summaries.map((summary) => {
    const rowByKittenId = new Map(summary.rows.map((row) => [row.litterKittenId, row]));
    const mappedKittens = (summary.litter?.kittens || []).map((kitten) => {
      const manual = rowByKittenId.get(kitten.id) || {};
      const revenue = kitten.kittenCatId ? revenueByKittenId.get(kitten.kittenCatId) : null;
      const forceAvailable = Boolean(kitten.kittenCatId && !revenue && canceledRevenueKittenIds.has(kitten.kittenCatId));
      const financial = revenueSummary(revenue);
      return {
        ...kitten,
        manual,
        hidden: manual.hidden === true,
        rowClass: kittenReservationClass(kitten, revenue, forceAvailable),
        deliveryDateInput: manual.deliveryDate ? formatDateInput(manual.deliveryDate) : "",
        deliveryLocation: manual.deliveryLocation || "",
        airReservation: manual.airReservation || "Não",
        groupStatus: manual.groupStatus || "Não",
        manualStatus: manual.manualStatus || "Não Enviado",
        kittenNumberLabel: kitten.kittenNumber || kitten.index || "-",
        kittenNameLabel: reservationKittenNameLabel(kitten),
        buyerFirstName: financial.buyerFirstName,
        accountNote: financial.accountNote,
        valueLabel: financial.valueCents ? formatCurrency(financial.valueCents) : "",
        freightLabel: financial.freightCents ? formatCurrency(financial.freightCents) : "",
        totalLabel: financial.totalCents ? formatCurrency(financial.totalCents) : "",
        paidLabel: financial.paidCents ? formatCurrency(financial.paidCents) : "",
        remainingLabel: financial.totalCents ? formatCurrency(financial.remainingCents) : "",
        paymentDates: financial.paymentDates,
      };
    });

    return {
      ...summary,
      motherShortName: shortMotherName(summary.litter),
      litterBirthLabel: formatDateOnlyLabel(summary.litter?.litterBirthDate),
      kittens: mappedKittens.filter((kitten) => !kitten.hidden),
      hiddenKittens: mappedKittens.filter((kitten) => kitten.hidden),
    };
  }).sort((a, b) => {
    const numericCompare = reservationLitterSortNumber(a) - reservationLitterSortNumber(b);
    return numericCompare || Number(a.litterId) - Number(b.litterId);
  });
}

async function loadCreditCardAccounts(prisma, req) {
  const cards = await prisma.financialAccountSetting.findMany({
    where: { ...settingScope(req), isCreditCard: true },
    orderBy: { accountName: "asc" },
  });
  return cards.map((card) => ({
    id: card.id,
    ownerId: card.ownerId,
    value: card.accountName,
    label: card.accountName,
    closingDay: card.creditCardClosingDay || 1,
    dueDay: card.creditCardDueDay || 1,
  }));
}

async function findCreditCardInvoiceSetting(prisma, req, cardName, month) {
  if (!cardName) return null;
  return prisma.creditCardInvoiceSetting.findFirst({
    where: {
      ...settingScope(req),
      accountName: cardName,
      month,
    },
  });
}

async function buildCreditCardInvoiceDates(prisma, req, card, month) {
  const defaultDates = cardInvoiceDates(month, card?.closingDay || 1, card?.dueDay || 1);
  if (!card?.value) return defaultDates;

  const [currentSetting, previousSetting] = await Promise.all([
    findCreditCardInvoiceSetting(prisma, req, card.value, month),
    findCreditCardInvoiceSetting(prisma, req, card.value, previousMonthInput(month)),
  ]);

  const closingDate = currentSetting?.closingDate || defaultDates.closingDate;
  const dueDate = currentSetting?.dueDate || defaultDates.dueDate;
  const previousClosingDate = previousSetting?.closingDate || defaultDates.previousClosingDate;

  return {
    startDate: addDays(previousClosingDate, 1),
    previousClosingDate,
    closingDate,
    dueDate,
    hasCustomDates: Boolean(currentSetting),
  };
}

async function buildCreditCardInvoiceRows(prisma, req, cardName, dates) {
  if (!cardName) {
    return { purchases: [], payments: [] };
  }

  const purchases = await prisma.quickLaunchEntry.findMany({
    where: {
      ...ownerScope(req),
      paymentMethod: cardName,
    },
    orderBy: [{ competenceDate: "asc" }, { createdAt: "asc" }],
  });
  const payments = await prisma.financialTransfer.findMany({
    where: {
      ...ownerScope(req),
      toAccount: cardName,
      deletedAt: null,
      transferDate: {
        gt: dates.closingDate,
        lte: dates.dueDate,
      },
    },
    orderBy: [{ transferDate: "asc" }, { createdAt: "asc" }],
  });

  return {
    purchases: mapCreditCardPurchaseRows(purchases, dates),
    payments: payments.map((row) => ({
      ...row,
      dateLabel: formatDateOnlyLabel(row.transferDate),
      amountLabel: formatCurrency(row.amountCents),
    })),
  };
}

function pdfTextHeight(doc, text, width, fontSize = 8, fontName = "Helvetica") {
  doc.font(fontName).fontSize(fontSize);
  return doc.heightOfString(String(text || "-"), { width });
}

function pdfMaxColumnHeight(doc, columns, row, fontSize = 8) {
  return columns.reduce((max, column) => {
    const value = typeof column.value === "function" ? column.value(row) : row[column.value];
    return Math.max(max, pdfTextHeight(doc, value || "-", column.width, fontSize));
  }, 0);
}

function renderExpensesPdf(res, rows, filters, totalLabel) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const fileName = `relatorio-despesas-${filters.startDateInput}-${filters.endDateInput}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  doc.pipe(res);

  doc.font("Helvetica-Bold").fontSize(18).text("Relatório de Despesas");
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(10).text(
    `Período: ${formatDateOnlyLabel(filters.startDate)} a ${formatDateOnlyLabel(filters.endDate)}`
  );
  doc.text(`Conta: ${filters.account || "Todas"}`);
  doc.text(`Total: ${totalLabel}`);
  doc.moveDown(1);

  const columns = [
    { label: "Data", x: 40, width: 62 },
    { label: "Categoria", x: 108, width: 120 },
    { label: "Fornecedor", x: 232, width: 112 },
    { label: "Conta", x: 348, width: 95 },
    { label: "Valor", x: 447, width: 80 },
  ];

  function drawHeader(y) {
    doc.font("Helvetica-Bold").fontSize(8);
    columns.forEach((column) => {
      doc.text(column.label, column.x, y, { width: column.width });
    });
    doc.moveTo(40, y + 13).lineTo(555, y + 13).strokeColor("#d1d5db").stroke();
  }

  let y = doc.y;
  drawHeader(y);
  y += 20;

  rows.forEach((row, index) => {
    const note = String(row.note || "").trim();
    const textHeight = Math.max(11, pdfMaxColumnHeight(doc, [
      { ...columns[0], value: "dateLabel" },
      { ...columns[1], value: "category" },
      { ...columns[2], value: "supplier" },
      { ...columns[3], value: "paymentMethod" },
      { ...columns[4], value: "amountLabel" },
    ], row, 8));
    const noteHeight = note ? pdfTextHeight(doc, `Obs.: ${note}`, 430, 7) + 4 : 0;
    const noteY = y + textHeight + 4;
    const rowHeight = Math.max(22, textHeight + noteHeight + (note ? 8 : 4));

    if (y + rowHeight > 735) {
      doc.addPage();
      y = 40;
      drawHeader(y);
      y += 20;
    }

    if (index % 2 === 0) {
      doc.rect(40, y - 4, 515, rowHeight).fill("#f9fafb");
    }

    doc.strokeColor("#e5e7eb").lineWidth(0.4);
    doc.moveTo(40, y + rowHeight - 5).lineTo(555, y + rowHeight - 5).stroke();

    doc.font("Helvetica").fontSize(8).fillColor("#111827");
    doc.text(row.dateLabel, columns[0].x, y, { width: columns[0].width });
    doc.text(row.category || "-", columns[1].x, y, { width: columns[1].width });
    doc.text(row.supplier || "-", columns[2].x, y, { width: columns[2].width });
    doc.text(row.paymentMethod || "-", columns[3].x, y, { width: columns[3].width });
    doc.text(row.amountLabel, columns[4].x, y, {
      width: columns[4].width,
      align: "right",
    });

    if (note) {
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor("#6b7280")
        .text(`Obs.: ${note}`, columns[1].x, noteY, { width: 430 });
    }

    y += rowHeight;
  });

  if (!rows.length) {
    doc.font("Helvetica").fontSize(10).text("Nenhuma despesa encontrada.", 40, y);
  }

  doc.end();
}

function renderRevenuesPdf(res, rows, filters, totals) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const fileName = `relatorio-receitas-${filters.startDateInput}-${filters.endDateInput}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  doc.pipe(res);

  doc.font("Helvetica-Bold").fontSize(18).text("Relatório de Receitas");
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(10).text(
    `Período: ${formatDateOnlyLabel(filters.startDate)} a ${formatDateOnlyLabel(filters.endDate)}`
  );
  doc.text(`Conta: ${filters.account || "Todas"}`);
  doc.text(`Total: ${totals.totalLabel} | Cancelamentos: ${totals.canceledLabel} | Total Recebidos: ${totals.receivedLabel}`);
  doc.moveDown(1);

  const columns = [
    { label: "Data", x: 40, width: 62 },
    { label: "Filhote", x: 108, width: 95 },
    { label: "Nota", x: 207, width: 55 },
    { label: "Pagamento", x: 266, width: 70 },
    { label: "Cliente", x: 340, width: 76 },
    { label: "Conta", x: 420, width: 55 },
    { label: "Valor", x: 479, width: 48 },
  ];

  function drawHeader(y) {
    doc.font("Helvetica-Bold").fontSize(8);
    columns.forEach((column) => doc.text(column.label, column.x, y, { width: column.width }));
    doc.moveTo(40, y + 13).lineTo(555, y + 13).strokeColor("#d1d5db").stroke();
  }

  let y = doc.y;
  drawHeader(y);
  y += 20;

  rows.forEach((row, index) => {
    const note = String(row.note || "").trim();
    const textHeight = Math.max(11, pdfMaxColumnHeight(doc, [
      { ...columns[0], value: "dateLabel" },
      { ...columns[1], value: (item) => kittenNameOnly(item.kittenLabel) },
      { ...columns[2], value: "invoiceLabel" },
      { ...columns[3], value: "paymentLabel" },
      { ...columns[4], value: "clientLabel" },
      { ...columns[5], value: "paymentAccount" },
      { ...columns[6], value: "amountLabel" },
    ], row, 8));
    const noteHeight = note ? pdfTextHeight(doc, `Obs.: ${note}`, 419, 7) + 4 : 0;
    const noteY = y + textHeight + 4;
    const rowHeight = Math.max(22, textHeight + noteHeight + (note ? 8 : 4));

    if (y + rowHeight > 735) {
      doc.addPage();
      y = 40;
      drawHeader(y);
      y += 20;
    }

    if (index % 2 === 0) {
      doc.rect(40, y - 4, 515, rowHeight).fill("#f9fafb");
    }

    doc.strokeColor("#e5e7eb").lineWidth(0.4);
    doc.moveTo(40, y + rowHeight - 5).lineTo(555, y + rowHeight - 5).stroke();

    doc.font("Helvetica").fontSize(8).fillColor("#111827");
    doc.text(row.dateLabel, columns[0].x, y, { width: columns[0].width });
    doc.text(kittenNameOnly(row.kittenLabel), columns[1].x, y, { width: columns[1].width });
    doc.text(row.invoiceLabel || "", columns[2].x, y, { width: columns[2].width });
    doc.text(row.paymentLabel || "-", columns[3].x, y, { width: columns[3].width });
    doc.text(row.clientLabel, columns[4].x, y, { width: columns[4].width });
    doc.text(row.paymentAccount || "-", columns[5].x, y, { width: columns[5].width });
    doc.text(row.amountLabel, columns[6].x, y, { width: columns[6].width, align: "right" });

    if (note) {
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor("#6b7280")
        .text(`Obs.: ${note}`, columns[1].x, noteY, { width: 419 });
    }

    y += rowHeight;
  });

  if (!rows.length) doc.font("Helvetica").fontSize(10).text("Nenhuma receita encontrada.", 40, y);
  doc.end();
}

function renderCashFlowPdf(res, rows, filters, totals) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const fileName = `relatorio-fluxo-caixa-${filters.startDateInput}-${filters.endDateInput}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  doc.pipe(res);

  doc.font("Helvetica-Bold").fontSize(18).text("Relatório de Fluxo de Caixa");
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(10).text(
    `Período: ${formatDateOnlyLabel(filters.startDate)} a ${formatDateOnlyLabel(filters.endDate)}`
  );
  doc.text(`Conta: ${filters.account || "Todas"}`);
  doc.text(`Entradas: ${totals.incomeLabel} | Cancelamentos: ${totals.canceledLabel} | Total Recebidos: ${totals.receivedLabel}`);
  doc.text(`Saídas: ${totals.expenseLabel} | Saldo: ${totals.balanceLabel}`);
  doc.moveDown(1);

  const columns = [
    { label: "Data", x: 40, width: 58 },
    { label: "Tipo", x: 102, width: 54 },
    { label: "Conta", x: 160, width: 95 },
    { label: "Descrição", x: 259, width: 176 },
    { label: "Valor", x: 439, width: 88 },
  ];

  function drawHeader(y) {
    doc.font("Helvetica-Bold").fontSize(8);
    columns.forEach((column) => doc.text(column.label, column.x, y, { width: column.width }));
    doc.moveTo(40, y + 13).lineTo(555, y + 13).strokeColor("#d1d5db").stroke();
  }

  let y = doc.y;
  drawHeader(y);
  y += 20;

  rows.forEach((row, index) => {
    const note = String(row.note || "").trim();
    const textHeight = Math.max(11, pdfMaxColumnHeight(doc, [
      { ...columns[0], value: "dateLabel" },
      { ...columns[1], value: "typeLabel" },
      { ...columns[2], value: "account" },
      { ...columns[3], value: "description" },
      { ...columns[4], value: "amountLabel" },
    ], row, 8));
    const noteHeight = note ? pdfTextHeight(doc, `Obs.: ${note}`, 390, 7) + 4 : 0;
    const noteY = y + textHeight + 4;
    const rowHeight = Math.max(22, textHeight + noteHeight + (note ? 8 : 4));

    if (y + rowHeight > 735) {
      doc.addPage();
      y = 40;
      drawHeader(y);
      y += 20;
    }

    if (index % 2 === 0) doc.rect(40, y - 4, 515, rowHeight).fill("#f9fafb");

    doc.strokeColor("#e5e7eb").lineWidth(0.4);
    doc.moveTo(40, y + rowHeight - 5).lineTo(555, y + rowHeight - 5).stroke();

    doc.font("Helvetica").fontSize(8).fillColor("#111827");
    doc.text(row.dateLabel, columns[0].x, y, { width: columns[0].width });
    doc.text(row.typeLabel, columns[1].x, y, { width: columns[1].width });
    doc.text(row.account || "-", columns[2].x, y, { width: columns[2].width });
    doc.text(row.description || "-", columns[3].x, y, { width: columns[3].width });
    doc.text(row.amountLabel, columns[4].x, y, { width: columns[4].width, align: "right" });

    if (note) {
      doc.font("Helvetica").fontSize(7).fillColor("#6b7280")
        .text(`Obs.: ${note}`, columns[3].x, noteY, { width: 390 });
    }

    y += rowHeight;
  });

  if (!rows.length) doc.font("Helvetica").fontSize(10).text("Nenhum lançamento encontrado.", 40, y);
  doc.end();
}

function renderCreditCardPdf(res, data) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const safeCardName = String(data.cardName || "cartao").replace(/[^\wÀ-ÿ-]+/g, "-");
  const fileName = `relatorio-cartao-${safeCardName}-${data.month}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  doc.pipe(res);

  function ensureSpace(y, height = 70) {
    if (y + height > 750) {
      doc.addPage();
      return 40;
    }
    return y;
  }

  function drawRows(title, rows, columns, emptyText, totalLabel, startY) {
    let y = ensureSpace(startY, 76);
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#111827").text(title, 40, y, {
      width: 360,
    });
    doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text(`Total: ${totalLabel}`, 400, y + 2, {
      width: 115,
      align: "right",
    });
    y += 24;

    if (!rows.length) {
      doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text(emptyText, 40, y, {
        width: 515,
      });
      return y + 28;
    }

    function drawHeader(headerY) {
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#374151");
      columns.forEach((column) => doc.text(column.label, column.x, headerY, { width: column.width }));
      doc.moveTo(40, headerY + 13).lineTo(555, headerY + 13).strokeColor("#d1d5db").stroke();
    }

    drawHeader(y);
    y += 20;

    rows.forEach((row, index) => {
      const note = String(row.note || "").trim();
      const textHeight = Math.max(11, pdfMaxColumnHeight(doc, columns, row, 8));
      const noteHeight = note ? pdfTextHeight(doc, `Obs.: ${note}`, 380, 7) + 4 : 0;
      const rowHeight = Math.max(22, textHeight + noteHeight + (note ? 8 : 4));
      y = ensureSpace(y, rowHeight + 18);

      if (y === 40) {
        drawHeader(y);
        y += 20;
      }

      if (index % 2 === 0) doc.rect(40, y - 4, 515, rowHeight).fill("#f9fafb");
      doc.strokeColor("#e5e7eb").lineWidth(0.4);
      doc.moveTo(40, y + rowHeight - 5).lineTo(555, y + rowHeight - 5).stroke();

      doc.font("Helvetica").fontSize(8).fillColor("#111827");
      columns.forEach((column) => {
        const value = typeof column.value === "function" ? column.value(row) : row[column.value];
        doc.text(value || "-", column.x, y, {
          width: column.width,
          align: column.align || "left",
        });
      });

      if (note) {
        doc.font("Helvetica").fontSize(7).fillColor("#6b7280")
          .text(`Obs.: ${note}`, 108, y + textHeight + 4, { width: 380 });
      }

      y += rowHeight;
    });

    return y + 16;
  }

  doc.font("Helvetica-Bold").fontSize(18).fillColor("#111827").text("Relatório de Cartão de Crédito");
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(10).fillColor("#111827").text(`Cartão: ${data.cardName || "-"}`);
  doc.text(`Fatura: ${data.monthLabel || data.month}`);
  doc.text(`Período: ${data.startLabel} a ${data.closingLabel}`);
  doc.text(`Vencimento: ${data.dueLabel}`);
  doc.text(`Compras: ${data.purchaseTotalLabel} | Pagamentos: ${data.paymentTotalLabel} | Saldo: ${data.balanceLabel}`);
  doc.moveDown(1);

  const purchaseColumns = [
    { label: "Data", x: 40, width: 58, value: "dateLabel" },
    { label: "Parcela", x: 102, width: 48, value: "parcelLabel" },
    { label: "Categoria", x: 154, width: 96, value: "category" },
    { label: "Fornecedor", x: 254, width: 138, value: "supplier" },
    { label: "Valor", x: 397, width: 118, value: "amountLabel", align: "right" },
  ];
  const paymentColumns = [
    { label: "Data", x: 40, width: 62, value: "dateLabel" },
    { label: "Origem", x: 108, width: 150, value: "fromAccount" },
    { label: "Cartão", x: 264, width: 150, value: "toAccount" },
    { label: "Valor", x: 420, width: 95, value: "amountLabel", align: "right" },
  ];

  let y = doc.y;
  y = drawRows("Compras", data.purchases, purchaseColumns, "Nenhuma compra encontrada para esta fatura.", data.purchaseTotalLabel, y);
  drawRows("Pagamentos da Fatura", data.payments, paymentColumns, "Nenhum pagamento encontrado para esta fatura.", data.paymentTotalLabel, y);
  doc.end();
}

function renderAccountingPdf(res, data, filters) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const fileName = `relatorio-contabil-${filters.startDateInput}-${filters.endDateInput}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  doc.pipe(res);

  function ensureSpace(height = 70) {
    if (doc.y + height > 750) {
      doc.addPage();
    }
  }

  function startSectionPage(title, totalLabel) {
    doc.addPage();
    doc.x = 40;
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#111827").text(title, 40, doc.y, {
      width: 515,
      align: "left",
    });
    if (totalLabel) {
      doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text(`Total: ${totalLabel}`, 40, doc.y, {
        width: 515,
        align: "left",
      });
    }
    doc.moveDown(0.7);
  }

  function drawMonthTitle(month) {
    ensureSpace(42);
    doc.x = 40;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#1f2937")
      .text(`${month.label} · ${month.totalLabel}`, 40, doc.y, {
        width: 515,
        align: "left",
      });
    doc.moveDown(0.2);
  }

  function drawRows(rows, columns, emptyText) {
    if (!rows.length) {
      doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text(emptyText, 40, doc.y, {
        width: 515,
        align: "left",
      });
      doc.moveDown(0.4);
      return;
    }

    const headerY = doc.y;
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#374151");
    columns.forEach((column) => doc.text(column.label, column.x, headerY, { width: column.width }));
    doc.moveTo(40, headerY + 12).lineTo(555, headerY + 12).strokeColor("#d1d5db").stroke();
    let y = headerY + 18;

    rows.forEach((row, index) => {
      const note = String(row.note || "").trim();
      const textHeight = Math.max(10, pdfMaxColumnHeight(doc, columns, row, 7.5));
      const noteHeight = note ? pdfTextHeight(doc, `Obs.: ${note}`, 390, 7) + 4 : 0;
      const rowHeight = Math.max(21, textHeight + noteHeight + (note ? 8 : 4));
      if (y + rowHeight > 750) {
        doc.addPage();
        y = 40;
      }

      if (index % 2 === 0) doc.rect(40, y - 4, 515, rowHeight).fill("#f9fafb");
      doc.strokeColor("#e5e7eb").lineWidth(0.4);
      doc.moveTo(40, y + rowHeight - 5).lineTo(555, y + rowHeight - 5).stroke();

      doc.font("Helvetica").fontSize(7.5).fillColor("#111827");
      columns.forEach((column) => {
        const value = typeof column.value === "function" ? column.value(row) : row[column.value];
        doc.text(value || "-", column.x, y, {
          width: column.width,
          align: column.align || "left",
        });
      });

      if (note) {
        doc.font("Helvetica").fontSize(7).fillColor("#6b7280")
          .text(`Obs.: ${note}`, 108, y + textHeight + 4, { width: 390 });
      }

      y += rowHeight;
    });

    doc.y = y + 2;
  }

  const revenueColumns = [
    { label: "Data", x: 40, width: 58, value: "dateLabel" },
    { label: "Filhote", x: 102, width: 104, value: (row) => kittenNameOnly(row.kittenLabel) },
    { label: "Cliente", x: 210, width: 116, value: "clientLabel" },
    { label: "Parcela", x: 330, width: 42, value: "parcelLabel" },
    { label: "Conta", x: 376, width: 84, value: "paymentAccount" },
    { label: "Valor", x: 464, width: 63, value: "amountLabel", align: "right" },
  ];
  const expenseColumns = [
    { label: "Data", x: 40, width: 58, value: "dateLabel" },
    { label: "Tipo", x: 102, width: 66, value: "typeLabel" },
    { label: "Descrição", x: 172, width: 190, value: "description" },
    { label: "Conta", x: 366, width: 92, value: "account" },
    { label: "Valor", x: 462, width: 65, value: "amountLabel", align: "right" },
  ];

  doc.font("Helvetica-Bold").fontSize(18).fillColor("#111827").text("Relatório Contábil", 40, doc.y, {
    width: 515,
    align: "left",
  });
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(10).fillColor("#111827").text(
    `Período: ${formatDateOnlyLabel(filters.startDate)} a ${formatDateOnlyLabel(filters.endDate)}`,
    40,
    doc.y,
    { width: 515, align: "left" }
  );
  doc.text(`Conta filtrada: ${filters.account || "Receitas gerais e contas contábeis"}`, 40, doc.y, {
    width: 515,
    align: "left",
  });

  startSectionPage("Receitas", data.revenueTotalLabel);
  data.revenueMonths.forEach((month) => {
    drawMonthTitle(month);
    drawRows(month.rows, revenueColumns, "Nenhuma receita neste mês.");
  });

  startSectionPage("A Receber", data.receivableTotalLabel);
  data.receivableMonths.forEach((month) => {
    drawMonthTitle(month);
    drawRows(month.rows, revenueColumns, "Nenhum valor a receber neste mês.");
  });

  data.accountSections.forEach((section, index) => {
    startSectionPage(`Despesas - Conta ${index + 1} - ${section.account}`, section.totalLabel);
    section.months.forEach((month) => {
      drawMonthTitle(month);
      drawRows(month.rows, expenseColumns, "Nenhuma movimentação nesta conta neste mês.");
    });
  });

  doc.end();
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  router.get(
    "/reports",
    requireAuth,
    requirePermission("admin.reports"),
    async (req, res) => {
      res.render("reports/index", {
        user: req.user,
        currentPath: "/reports",
      });
    }
  );

  router.get(
    "/reports/resumo-reserva-pagamento",
    requireAuth,
    requirePermission("admin.reports"),
    async (req, res) => {
      const [litterOptions, summaries] = await Promise.all([
        loadReservationLitterOptions(prisma, req),
        loadReservationPaymentReport(prisma, req),
      ]);

      res.render("reports/reservation-payment", {
        user: req.user,
        currentPath: "/reports",
        litterOptions,
        summaries,
        success: req.query.ok === "1",
        error: req.query.error || "",
        registrationOptions: ["Solicitar", "Solicitado", "Entregue"],
        yesNoOptions: ["Sim", "Não"],
        airReservationOptions: ["Sim", "Não", "Solicitado"],
        manualOptions: ["Enviado", "Não Enviado"],
      });
    }
  );

  router.post(
    "/reports/resumo-reserva-pagamento/add",
    requireAuth,
    requirePermission("admin.reports"),
    async (req, res) => {
      try {
        const litter = await findReservationLitter(prisma, req, req.body);
        if (!litter) {
          return res.redirect(`/reports/resumo-reserva-pagamento?error=${encodeURIComponent("Ninhada não encontrada para adicionar ao resumo.")}`);
        }

        await ensureReservationSummary(prisma, req, litter);
        res.redirect("/reports/resumo-reserva-pagamento?ok=1");
      } catch (err) {
        console.error("Erro ao adicionar ninhada ao resumo:", err);
        res.redirect(`/reports/resumo-reserva-pagamento?error=${encodeURIComponent("Erro ao adicionar ninhada ao resumo.")}`);
      }
    }
  );

  router.post(
    "/reports/resumo-reserva-pagamento/hide-kitten",
    requireAuth,
    requirePermission("admin.reports"),
    async (req, res) => {
      try {
        const token = parseSummaryKittenToken(req.body.hideKitten);
        if (!token) {
          return res.redirect(`/reports/resumo-reserva-pagamento?error=${encodeURIComponent("Filhote não encontrado para ocultar.")}`);
        }

        const summary = await ensureSummaryKittenAccess(prisma, req, token.summaryId, token.litterKittenId);
        if (!summary) {
          return res.redirect(`/reports/resumo-reserva-pagamento?error=${encodeURIComponent("Filhote não encontrado para ocultar.")}`);
        }

        await ensureReservationKittenRow(prisma, token.summaryId, token.litterKittenId, { hidden: true });
        res.redirect("/reports/resumo-reserva-pagamento?ok=1");
      } catch (err) {
        console.error("Erro ao ocultar filhote no resumo:", err);
        res.redirect(`/reports/resumo-reserva-pagamento?error=${encodeURIComponent("Erro ao ocultar filhote.")}`);
      }
    }
  );

  router.post(
    "/reports/resumo-reserva-pagamento/show-kitten",
    requireAuth,
    requirePermission("admin.reports"),
    async (req, res) => {
      try {
        const token = parseSummaryKittenToken(req.body.showKitten);
        if (!token) {
          return res.redirect(`/reports/resumo-reserva-pagamento?error=${encodeURIComponent("Filhote não encontrado para restaurar.")}`);
        }

        const summary = await ensureSummaryKittenAccess(prisma, req, token.summaryId, token.litterKittenId);
        if (!summary) {
          return res.redirect(`/reports/resumo-reserva-pagamento?error=${encodeURIComponent("Filhote não encontrado para restaurar.")}`);
        }

        await ensureReservationKittenRow(prisma, token.summaryId, token.litterKittenId, { hidden: false });
        res.redirect("/reports/resumo-reserva-pagamento?ok=1");
      } catch (err) {
        console.error("Erro ao restaurar filhote no resumo:", err);
        res.redirect(`/reports/resumo-reserva-pagamento?error=${encodeURIComponent("Erro ao restaurar filhote.")}`);
      }
    }
  );

  router.post(
    "/reports/resumo-reserva-pagamento/remove-litter",
    requireAuth,
    requirePermission("admin.reports"),
    async (req, res) => {
      try {
        const summaryId = Number(req.body.removeSummary);
        if (!Number.isFinite(summaryId)) {
          return res.redirect(`/reports/resumo-reserva-pagamento?error=${encodeURIComponent("Ninhada não encontrada para remover do resumo.")}`);
        }

        await prisma.reservationPaymentLitter.deleteMany({
          where: {
            id: summaryId,
            ...ownerScope(req),
          },
        });
        res.redirect("/reports/resumo-reserva-pagamento?ok=1");
      } catch (err) {
        console.error("Erro ao remover ninhada do resumo:", err);
        res.redirect(`/reports/resumo-reserva-pagamento?error=${encodeURIComponent("Erro ao remover ninhada do resumo.")}`);
      }
    }
  );

  router.post(
    "/reports/resumo-reserva-pagamento/save",
    requireAuth,
    requirePermission("admin.reports"),
    async (req, res) => {
      try {
        const { registrationStatus, kittenRows, summaryIds } = normalizeReservationSavePayload(req.body);

        const summaries = summaryIds.length
          ? await prisma.reservationPaymentLitter.findMany({
              where: {
                id: { in: summaryIds },
                ...ownerScope(req),
              },
              include: { litter: { include: { kittens: true } } },
            })
          : [];

        for (const summary of summaries) {
          const nextStatus = normalizeOption(
            registrationStatus[String(summary.id)],
            ["Solicitar", "Solicitado", "Entregue"],
            summary.registrationStatus || "Solicitar"
          );

          await prisma.reservationPaymentLitter.update({
            where: { id: summary.id },
            data: { registrationStatus: nextStatus },
          });

          const validKittenIds = new Set((summary.litter?.kittens || []).map((kitten) => kitten.id));
          const rows = kittenRows[String(summary.id)] || {};

          for (const [kittenIdText, row] of Object.entries(rows)) {
            const litterKittenId = Number(kittenIdText);
            if (!validKittenIds.has(litterKittenId)) continue;

            const deliveryDate = parseDateInput(row.deliveryDate, null);
            const data = {
              deliveryDate,
              deliveryLocation: String(row.deliveryLocation || "").trim() || null,
              airReservation: normalizeOption(row.airReservation, ["Sim", "Não", "Solicitado"], "Não"),
              groupStatus: normalizeOption(row.groupStatus, ["Sim", "Não"], "Não"),
              manualStatus: normalizeOption(row.manualStatus, ["Enviado", "Não Enviado"], "Não Enviado"),
            };

            await prisma.reservationPaymentKitten.upsert({
              where: {
                summaryId_litterKittenId: {
                  summaryId: summary.id,
                  litterKittenId,
                },
              },
              update: data,
              create: {
                summaryId: summary.id,
                litterKittenId,
                ...data,
              },
            });
          }
        }

        res.redirect("/reports/resumo-reserva-pagamento?ok=1");
      } catch (err) {
        console.error("Erro ao salvar resumo reserva/pagamento:", err);
        res.redirect(`/reports/resumo-reserva-pagamento?error=${encodeURIComponent("Erro ao salvar resumo.")}`);
      }
    }
  );

  router.get(
    "/reports/expenses",
    requireAuth,
    requirePermission("admin.reports"),
    async (req, res) => {
      const filters = buildExpenseFilters(req.query);
      const expenses = await prisma.quickLaunchEntry.findMany({
        where: buildExpenseWhere(req, filters),
        orderBy: [{ competenceDate: "desc" }, { createdAt: "desc" }],
      });
      const creditCardNames = await loadCreditCardNames(prisma, req);
      const visibleExpenses = filterCreditCardExpenses(expenses, creditCardNames);
      const rows = mapExpenseRows(visibleExpenses);
      const totalCents = visibleExpenses.reduce(
        (sum, expense) => sum + expense.amountCents,
        0
      );

      res.render("reports/expenses", {
        user: req.user,
        currentPath: "/reports",
        rows,
        filters,
        accountOptions: await loadAccountOptions(prisma, req),
        totalLabel: formatCurrency(totalCents),
        pdfQuery: buildQueryString(filters, true),
      });
    }
  );

  router.get(
    "/reports/expenses/pdf",
    requireAuth,
    requirePermission("admin.reports"),
    async (req, res) => {
      const filters = buildExpenseFilters(req.query);
      const expenses = await prisma.quickLaunchEntry.findMany({
        where: buildExpenseWhere(req, filters),
        orderBy: [{ competenceDate: "desc" }, { createdAt: "desc" }],
      });
      const creditCardNames = await loadCreditCardNames(prisma, req);
      const visibleExpenses = filterCreditCardExpenses(expenses, creditCardNames);
      const rows = mapExpenseRows(visibleExpenses);
      const totalCents = visibleExpenses.reduce(
        (sum, expense) => sum + expense.amountCents,
        0
      );

      renderExpensesPdf(res, rows, filters, formatCurrency(totalCents));
    }
  );

  router.get(
    "/reports/revenues",
    requireAuth,
    requirePermission("admin.reports"),
    async (req, res) => {
      const filters = buildRevenueFilters(req.query);
      const revenues = await prisma.revenueEntry.findMany({
        where: buildRevenueWhere(req, filters),
        include: { client: true },
        orderBy: [{ createdAt: "desc" }],
      });
      const rows = mapRevenueRows(revenues, filters);
      const totals = buildRevenueTotals(rows);

      res.render("reports/revenues", {
        user: req.user,
        currentPath: "/reports",
        rows,
        filters,
        accountOptions: await loadAccountOptions(prisma, req),
        totalLabel: totals.totalLabel,
        canceledLabel: totals.canceledLabel,
        receivedLabel: totals.receivedLabel,
        pdfQuery: buildQueryString(filters, true),
      });
    }
  );

  router.get(
    "/reports/revenues/pdf",
    requireAuth,
    requirePermission("admin.reports"),
    async (req, res) => {
      const filters = buildRevenueFilters(req.query);
      const revenues = await prisma.revenueEntry.findMany({
        where: buildRevenueWhere(req, filters),
        include: { client: true },
        orderBy: [{ createdAt: "desc" }],
      });
      const rows = mapRevenueRows(revenues, filters);
      const totals = buildRevenueTotals(rows);

      renderRevenuesPdf(res, rows, filters, totals);
    }
  );

  router.get(
    "/reports/cash-flow",
    requireAuth,
    requirePermission("admin.reports"),
    async (req, res) => {
      const filters = buildExpenseFilters(req.query);
      const expenses = await prisma.quickLaunchEntry.findMany({
        where: buildExpenseWhere(req, filters),
        orderBy: [{ competenceDate: "desc" }, { createdAt: "desc" }],
      });
      const revenues = await prisma.revenueEntry.findMany({
        where: buildRevenueWhere(req, filters),
        include: { client: true },
        orderBy: [{ createdAt: "desc" }],
      });
      const transfers = await prisma.financialTransfer.findMany({
        where: {
          ...ownerScope(req),
          deletedAt: null,
        },
        orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }],
      });
      const revenueRows = mapRevenueRows(revenues, filters);
      const refundRows = mapRefundRows(revenues, filters);
      const creditCardNames = await loadCreditCardNames(prisma, req);
      const rows = mapCashFlowRows(
        filterCreditCardExpenses(expenses, creditCardNames),
        revenueRows,
        transfers,
        filters,
        refundRows
      );
      const totals = buildCashFlowTotals(rows);

      res.render("reports/cash-flow", {
        user: req.user,
        currentPath: "/reports",
        rows,
        filters,
        accountOptions: await loadAccountOptions(prisma, req),
        incomeLabel: totals.incomeLabel,
        canceledLabel: totals.canceledLabel,
        receivedLabel: totals.receivedLabel,
        expenseLabel: totals.expenseLabel,
        balanceLabel: totals.balanceLabel,
        pdfQuery: buildQueryString(filters, true),
      });
    }
  );

  router.get(
    "/reports/cash-flow/pdf",
    requireAuth,
    requirePermission("admin.reports"),
    async (req, res) => {
      const filters = buildExpenseFilters(req.query);
      const expenses = await prisma.quickLaunchEntry.findMany({
        where: buildExpenseWhere(req, filters),
        orderBy: [{ competenceDate: "desc" }, { createdAt: "desc" }],
      });
      const revenues = await prisma.revenueEntry.findMany({
        where: buildRevenueWhere(req, filters),
        include: { client: true },
        orderBy: [{ createdAt: "desc" }],
      });
      const transfers = await prisma.financialTransfer.findMany({
        where: {
          ...ownerScope(req),
          deletedAt: null,
        },
        orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }],
      });
      const revenueRows = mapRevenueRows(revenues, filters);
      const refundRows = mapRefundRows(revenues, filters);
      const creditCardNames = await loadCreditCardNames(prisma, req);
      const rows = mapCashFlowRows(
        filterCreditCardExpenses(expenses, creditCardNames),
        revenueRows,
        transfers,
        filters,
        refundRows
      );
      const totals = buildCashFlowTotals(rows);

      renderCashFlowPdf(res, rows, filters, totals);
    }
  );

  router.post(
    "/reports/credit-cards/invoice-dates",
    requireAuth,
    requirePermission("admin.reports"),
    async (req, res) => {
      const cardName = String(req.body.card || "").trim();
      const month = /^\d{4}-\d{2}$/.test(req.body.month || "")
        ? req.body.month
        : currentMonthInput();
      const closingDate = parseDateInput(req.body.closingDate, null);
      const dueDate = parseDateInput(req.body.dueDate, null);

      if (cardName && closingDate && dueDate) {
        const card = await prisma.financialAccountSetting.findFirst({
          where: { ...settingScope(req), accountName: cardName, isCreditCard: true },
          select: { id: true, ownerId: true },
        });

        if (card) {
          const existing = await prisma.creditCardInvoiceSetting.findFirst({
            where: {
              ownerId: card.ownerId,
              accountName: cardName,
              month,
            },
            select: { id: true },
          });
          const data = {
            ownerId: card.ownerId,
            accountName: cardName,
            month,
            closingDate,
            dueDate,
          };

          if (existing) {
            await prisma.creditCardInvoiceSetting.update({
              where: { id: existing.id },
              data: {
                closingDate,
                dueDate,
              },
            });
          } else {
            await prisma.creditCardInvoiceSetting.create({ data });
          }
        }
      }

      if (req.headers.accept?.includes("application/json")) {
        return res.json({ ok: true });
      }

      res.redirect(`/reports/credit-cards?card=${encodeURIComponent(cardName)}&month=${encodeURIComponent(month)}`);
    }
  );

  router.get(
    "/reports/credit-cards",
    requireAuth,
    requirePermission("admin.reports"),
    async (req, res) => {
      const filters = buildCreditCardFilters(req.query);
      const cardOptions = await loadCreditCardAccounts(prisma, req);
      const selectedCard = cardOptions.find((option) => option.value === filters.card)
        || cardOptions[0]
        || null;
      const cardName = selectedCard?.value || "";
      const dueDay = clampDay(selectedCard?.dueDay, 1);
      const dates = await buildCreditCardInvoiceDates(prisma, req, selectedCard, filters.month);
      const rows = await buildCreditCardInvoiceRows(prisma, req, cardName, dates);
      const purchaseTotalCents = rows.purchases.reduce((sum, row) => sum + Number(row.amountCents || 0), 0);
      const paymentTotalCents = rows.payments.reduce((sum, row) => sum + Number(row.amountCents || 0), 0);
      const balanceCents = purchaseTotalCents - paymentTotalCents;

      res.render("reports/credit-cards", {
        user: req.user,
        currentPath: "/reports",
        cardOptions,
        selectedCard,
        filters: {
          ...filters,
          card: cardName,
          dueDay,
          closingDateInput: formatDateInput(dates.closingDate),
          dueDateInput: formatDateInput(dates.dueDate),
          hasCustomDates: dates.hasCustomDates,
        },
        purchases: rows.purchases,
        payments: rows.payments,
        startLabel: formatDateOnlyLabel(dates.startDate),
        closingLabel: formatDateOnlyLabel(dates.closingDate),
        dueLabel: formatDateOnlyLabel(dates.dueDate),
        purchaseTotalLabel: formatCurrency(purchaseTotalCents),
        paymentTotalLabel: formatCurrency(paymentTotalCents),
        balanceLabel: formatCurrency(balanceCents),
        pdfQuery: buildCreditCardQueryString({ ...filters, card: cardName }, true),
      });
    }
  );

  router.get(
    "/reports/credit-cards/pdf",
    requireAuth,
    requirePermission("admin.reports"),
    async (req, res) => {
      const filters = buildCreditCardFilters(req.query);
      const cardOptions = await loadCreditCardAccounts(prisma, req);
      const selectedCard = cardOptions.find((option) => option.value === filters.card)
        || cardOptions[0]
        || null;
      const cardName = selectedCard?.value || "";
      const dueDay = clampDay(selectedCard?.dueDay, 1);
      const dates = await buildCreditCardInvoiceDates(prisma, req, selectedCard, filters.month);
      const rows = await buildCreditCardInvoiceRows(prisma, req, cardName, dates);
      const purchaseTotalCents = rows.purchases.reduce((sum, row) => sum + Number(row.amountCents || 0), 0);
      const paymentTotalCents = rows.payments.reduce((sum, row) => sum + Number(row.amountCents || 0), 0);
      const balanceCents = purchaseTotalCents - paymentTotalCents;

      renderCreditCardPdf(res, {
        cardName,
        dueDay,
        month: filters.month,
        monthLabel: filters.month,
        startLabel: formatDateOnlyLabel(dates.startDate),
        closingLabel: formatDateOnlyLabel(dates.closingDate),
        dueLabel: formatDateOnlyLabel(dates.dueDate),
        purchases: rows.purchases,
        payments: rows.payments,
        purchaseTotalLabel: formatCurrency(purchaseTotalCents),
        paymentTotalLabel: formatCurrency(paymentTotalCents),
        balanceLabel: formatCurrency(balanceCents),
      });
    }
  );

  async function loadAccountingData(req, filters) {
    const accountOptions = await loadAccountOptions(prisma, req);
    const expenses = await prisma.quickLaunchEntry.findMany({
      where: buildExpenseWhere(req, { ...filters, account: "" }),
      orderBy: [{ competenceDate: "desc" }, { createdAt: "desc" }],
    });
    const revenues = await prisma.revenueEntry.findMany({
      where: buildRevenueWhere(req, filters),
      include: { client: true },
      orderBy: [{ createdAt: "desc" }],
    });
    const transfers = await prisma.financialTransfer.findMany({
      where: {
        ...ownerScope(req),
        deletedAt: null,
      },
      orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }],
    });

    const revenueRows = mapRevenueRows(revenues, filters);
    const refundRows = mapRefundRows(revenues, filters);
    const receivableRows = mapReceivableRows(revenues, filters);
    const creditCardNames = await loadCreditCardNames(prisma, req);
    const visibleExpenses = filterCreditCardExpenses(expenses, creditCardNames);
    const revenueMonths = groupRowsByMonth(
      revenueRows,
      filters,
      (row) => new Date(row.paidDateTime)
    );
    const receivableMonths = groupRowsByMonth(
      receivableRows,
      filters,
      (row) => new Date(row.dueDateTime),
      { onlyWithRows: true, direction: "asc" }
    );
    const revenueTotalCents = revenueRows.reduce((sum, row) => sum + Number(row.amountCents || 0), 0);
    const receivableTotalCents = receivableRows.reduce((sum, row) => sum + Number(row.amountCents || 0), 0);
    const accounts = pickAccountingAccounts(accountOptions, filters.account);
    const accountSections = accounts.map((account) => {
      const rows = buildAccountingExpenseRows(visibleExpenses, transfers, filters, account, refundRows);
      const totalCents = rows
        .filter((row) => row.amountCents < 0)
        .reduce((sum, row) => sum + Math.abs(row.amountCents), 0);

      return {
        account,
        rows,
        months: groupRowsByMonth(rows, filters, (row) => new Date(row.dateTime)),
        totalLabel: formatCurrency(totalCents),
      };
    });

    return {
      accountOptions,
      revenueRows,
      revenueMonths,
      revenueTotalLabel: formatCurrency(revenueTotalCents),
      receivableRows,
      receivableMonths,
      receivableTotalLabel: formatCurrency(receivableTotalCents),
      accountSections,
    };
  }

  router.get(
    "/reports/accounting",
    requireAuth,
    requirePermission("admin.reports"),
    async (req, res) => {
      const filters = buildAccountingFilters(req.query);
      const data = await loadAccountingData(req, filters);

      res.render("reports/accounting", {
        user: req.user,
        currentPath: "/reports",
        filters,
        accountOptions: data.accountOptions,
        revenueMonths: data.revenueMonths,
        revenueTotalLabel: data.revenueTotalLabel,
        receivableMonths: data.receivableMonths,
        receivableTotalLabel: data.receivableTotalLabel,
        accountSections: data.accountSections,
        pdfQuery: buildQueryString(filters, true),
      });
    }
  );

  router.get(
    "/reports/accounting/pdf",
    requireAuth,
    requirePermission("admin.reports"),
    async (req, res) => {
      const filters = buildAccountingFilters(req.query);
      const data = await loadAccountingData(req, filters);
      renderAccountingPdf(res, data, filters);
    }
  );

  return router;
};
