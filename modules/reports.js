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

function buildRevenueFilters(query) {
  return buildExpenseFilters(query);
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
        clientLabel: revenue.client?.fullName || "-",
        paymentAccount,
      });
    });
  });

  return rows.sort((a, b) => {
    const dateCompare = b.paidDateTime - a.paidDateTime;
    return dateCompare || Number(b.id) - Number(a.id);
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

function mapCashFlowRows(expenses, revenueRows, transfers, filters) {
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

  return [...incomeRows, ...expenseRows, ...mapTransferRows(transfers, filters)].sort((a, b) => {
    const dateCompare = b.dateTime - a.dateTime;
    return dateCompare || String(b.id).localeCompare(String(a.id));
  });
}

async function loadAccountOptions(prisma) {
  const rows = await prisma.quickLaunchOption.findMany({
    where: { type: "PAYMENT", disabledAt: null },
    orderBy: { name: "asc" },
    select: { name: true },
  });
  const names = Array.from(new Set(rows.map((row) => row.name).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return [{ value: "", label: "Todas" }].concat(
    names.map((name) => ({ value: name, label: name }))
  );
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
      const rows = mapExpenseRows(expenses);
      const totalCents = expenses.reduce(
        (sum, expense) => sum + expense.amountCents,
        0
      );

      res.render("reports/expenses", {
        user: req.user,
        currentPath: "/reports",
        rows,
        filters,
        accountOptions: await loadAccountOptions(prisma),
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
      const rows = mapExpenseRows(expenses);
      const totalCents = expenses.reduce(
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
        accountOptions: await loadAccountOptions(prisma),
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
          ...(canViewAllData(req.session?.userRole) ? {} : { ownerId: req.session.userId }),
          deletedAt: null,
        },
        orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }],
      });
      const revenueRows = mapRevenueRows(revenues, filters);
      const rows = mapCashFlowRows(expenses, revenueRows, transfers, filters);
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
        accountOptions: await loadAccountOptions(prisma),
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
          ...(canViewAllData(req.session?.userRole) ? {} : { ownerId: req.session.userId }),
          deletedAt: null,
        },
        orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }],
      });
      const revenueRows = mapRevenueRows(revenues, filters);
      const rows = mapCashFlowRows(expenses, revenueRows, transfers, filters);
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

  return router;
};
