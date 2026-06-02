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
        paidDateTime: paidTime,
        dateLabel: formatDateOnlyLabel(paidDate),
        amountLabel: formatCurrency(parcel.amountCents),
        amountCents: parcel.amountCents || 0,
        clientLabel: revenue.client?.fullName || "Cliente desconhecido",
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
    description: [kittenNameOnly(revenue.kittenLabel), revenue.clientLabel].filter(Boolean).join(" · ") || "Receita",
    note: revenue.note || "",
    amountCents: Number(revenue.amountCents || 0),
    amountLabel: formatCurrency(revenue.amountCents),
  }));

  const refundCashRows = refundRows.map((refund) => ({
    id: refund.id,
    dateTime: refund.dateTime,
    dateLabel: refund.dateLabel,
    typeLabel: "Estorno",
    account: refund.paymentAccount || "-",
    description: [kittenNameOnly(refund.kittenLabel), refund.clientLabel].filter(Boolean).join(" · ") || "Estorno",
    note: refund.note || "",
    amountCents: Number(refund.amountCents || 0),
    amountLabel: refund.amountLabel,
  }));

  return [...incomeRows, ...expenseRows, ...refundCashRows, ...mapTransferRows(transfers, filters)].sort((a, b) => {
    const dateCompare = b.dateTime - a.dateTime;
    return dateCompare || String(b.id).localeCompare(String(a.id));
  });
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
      competenceDate: {
        gte: dates.startDate,
        lte: dates.closingDate,
      },
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
    purchases: purchases.map((row) => ({
      ...row,
      dateLabel: formatDateOnlyLabel(row.competenceDate),
      amountLabel: formatCurrency(row.amountCents),
    })),
    payments: payments.map((row) => ({
      ...row,
      dateLabel: formatDateOnlyLabel(row.transferDate),
      amountLabel: formatCurrency(row.amountCents),
    })),
  };
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
    const noteHeight = note
      ? doc.heightOfString(`Obs.: ${note}`, { width: 430 }) + 6
      : 0;
    const rowHeight = 22 + noteHeight;

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
        .text(`Obs.: ${note}`, columns[1].x, y + 11, { width: 430 });
    }

    y += rowHeight;
  });

  if (!rows.length) {
    doc.font("Helvetica").fontSize(10).text("Nenhuma despesa encontrada.", 40, y);
  }

  doc.end();
}

function renderRevenuesPdf(res, rows, filters, totalLabel) {
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
  doc.text(`Total: ${totalLabel}`);
  doc.moveDown(1);

  const columns = [
    { label: "Data", x: 40, width: 62 },
    { label: "Filhote", x: 108, width: 95 },
    { label: "N da Nota", x: 207, width: 52 },
    { label: "Parcela", x: 263, width: 42 },
    { label: "Cliente", x: 309, width: 85 },
    { label: "Conta", x: 398, width: 66 },
    { label: "Valor", x: 468, width: 59 },
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
    const noteHeight = note
      ? doc.heightOfString(`Obs.: ${note}`, { width: 419 }) + 6
      : 0;
    const rowHeight = 22 + noteHeight;

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
    doc.text(row.invoiceNumber || "", columns[2].x, y, { width: columns[2].width });
    doc.text(row.parcelLabel || "-", columns[3].x, y, { width: columns[3].width });
    doc.text(row.clientLabel, columns[4].x, y, { width: columns[4].width });
    doc.text(row.paymentAccount || "-", columns[5].x, y, { width: columns[5].width });
    doc.text(row.amountLabel, columns[6].x, y, { width: columns[6].width, align: "right" });

    if (note) {
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor("#6b7280")
        .text(`Obs.: ${note}`, columns[1].x, y + 11, { width: 419 });
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
  doc.text(`Entradas: ${totals.incomeLabel} | Saídas: ${totals.expenseLabel} | Saldo: ${totals.balanceLabel}`);
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
    const noteHeight = note ? doc.heightOfString(`Obs.: ${note}`, { width: 390 }) + 6 : 0;
    const rowHeight = 22 + noteHeight;

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
        .text(`Obs.: ${note}`, columns[3].x, y + 11, { width: 390 });
    }

    y += rowHeight;
  });

  if (!rows.length) doc.font("Helvetica").fontSize(10).text("Nenhum lançamento encontrado.", 40, y);
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
      const rowHeight = 21 + (note ? doc.heightOfString(`Obs.: ${note}`, { width: 390 }) + 5 : 0);
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
          .text(`Obs.: ${note}`, 108, y + 10, { width: 390 });
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
      const totalCents = rows.reduce(
        (sum, row) => sum + row.amountCents,
        0
      );

      res.render("reports/revenues", {
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
      const totalCents = rows.reduce(
        (sum, row) => sum + row.amountCents,
        0
      );

      renderRevenuesPdf(res, rows, filters, formatCurrency(totalCents));
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
      const incomeCents = rows
        .filter((row) => row.amountCents > 0)
        .reduce((sum, row) => sum + row.amountCents, 0);
      const expenseCents = rows
        .filter((row) => row.amountCents < 0)
        .reduce((sum, row) => sum + Math.abs(row.amountCents), 0);
      const balanceCents = incomeCents - expenseCents;

      res.render("reports/cash-flow", {
        user: req.user,
        currentPath: "/reports",
        rows,
        filters,
        accountOptions: await loadAccountOptions(prisma, req),
        incomeLabel: formatCurrency(incomeCents),
        expenseLabel: formatCurrency(expenseCents),
        balanceLabel: formatCurrency(balanceCents),
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
      const incomeCents = rows
        .filter((row) => row.amountCents > 0)
        .reduce((sum, row) => sum + row.amountCents, 0);
      const expenseCents = rows
        .filter((row) => row.amountCents < 0)
        .reduce((sum, row) => sum + Math.abs(row.amountCents), 0);
      const balanceCents = incomeCents - expenseCents;

      renderCashFlowPdf(res, rows, filters, {
        incomeLabel: formatCurrency(incomeCents),
        expenseLabel: formatCurrency(expenseCents),
        balanceLabel: formatCurrency(balanceCents),
      });
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
