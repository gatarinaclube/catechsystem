const express = require("express");
const PDFDocument = require("pdfkit");
const { canViewAllData } = require("../utils/access");

const PAYMENT_FILTERS = [
  { value: "", label: "Todas" },
  { value: "CREDIT", label: "Somente Cartão de Crédito" },
  { value: "PIX", label: "Somente PIX" },
  { value: "CASH", label: "Somente Dinheiro" },
];

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

function paymentFilterLabel(value) {
  return PAYMENT_FILTERS.find((option) => option.value === value)?.label || "Todas";
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

  const paymentMethod = PAYMENT_FILTERS.some((option) => option.value === query.paymentMethod)
    ? query.paymentMethod
    : "";

  return {
    periodType,
    month,
    startDate,
    endDate,
    startDateInput: formatDateInput(startDate),
    endDateInput: formatDateInput(endDate),
    paymentMethod,
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

  if (filters.paymentMethod) {
    const keyword = filters.paymentMethod === "PIX"
      ? "PIX"
      : filters.paymentMethod === "CREDIT"
        ? "Crédito"
        : "Dinheiro";
    where.paymentMethod = { contains: keyword, mode: "insensitive" };
  }

  return where;
}

function buildRevenueWhere(req, filters) {
  const where = {
    ...(canViewAllData(req.session?.userRole) ? {} : { ownerId: req.session.userId }),
    createdAt: {
      gte: filters.startDate,
      lt: addDays(filters.endDate, 1),
    },
  };

  if (filters.paymentMethod) {
    const keyword = filters.paymentMethod === "PIX"
      ? "PIX"
      : filters.paymentMethod === "CREDIT"
        ? "Crédito"
        : "Dinheiro";
    where.paymentAccount = { contains: keyword, mode: "insensitive" };
  }

  return where;
}

function buildQueryString(filters, forcePdf = false) {
  const params = new URLSearchParams({
    periodType: filters.periodType,
    month: filters.month,
    startDate: filters.startDateInput,
    endDate: filters.endDateInput,
    paymentMethod: filters.paymentMethod,
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

function mapRevenueRows(revenues) {
  return revenues.map((revenue) => ({
    ...revenue,
    dateLabel: formatDateLabel(revenue.createdAt),
    amountLabel: formatCurrency(revenue.totalAmountCents),
    clientLabel: revenue.client?.fullName || "-",
  }));
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
  doc.text(`Forma de pagamento: ${paymentFilterLabel(filters.paymentMethod)}`);
  doc.text(`Total: ${totalLabel}`);
  doc.moveDown(1);

  const columns = [
    { label: "Data", x: 40, width: 62 },
    { label: "Categoria", x: 108, width: 120 },
    { label: "Fornecedor", x: 232, width: 112 },
    { label: "Pagamento", x: 348, width: 95 },
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

  rows.forEach((row) => {
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
    `Período: ${formatDateLabel(filters.startDate)} a ${formatDateLabel(filters.endDate)}`
  );
  doc.text(`Forma de pagamento: ${paymentFilterLabel(filters.paymentMethod)}`);
  doc.text(`Total: ${totalLabel}`);
  doc.moveDown(1);

  const columns = [
    { label: "Data", x: 40, width: 62 },
    { label: "Filhote", x: 108, width: 130 },
    { label: "Cliente", x: 242, width: 125 },
    { label: "Conta", x: 371, width: 90 },
    { label: "Valor", x: 465, width: 62 },
  ];

  function drawHeader(y) {
    doc.font("Helvetica-Bold").fontSize(8);
    columns.forEach((column) => doc.text(column.label, column.x, y, { width: column.width }));
    doc.moveTo(40, y + 13).lineTo(555, y + 13).strokeColor("#d1d5db").stroke();
  }

  let y = doc.y;
  drawHeader(y);
  y += 20;

  rows.forEach((row) => {
    if (y > 735) {
      doc.addPage();
      y = 40;
      drawHeader(y);
      y += 20;
    }

    doc.font("Helvetica").fontSize(8).fillColor("#111827");
    doc.text(row.dateLabel, columns[0].x, y, { width: columns[0].width });
    doc.text(row.kittenLabel || "-", columns[1].x, y, { width: columns[1].width });
    doc.text(row.clientLabel, columns[2].x, y, { width: columns[2].width });
    doc.text(row.paymentAccount || "-", columns[3].x, y, { width: columns[3].width });
    doc.text(row.amountLabel, columns[4].x, y, { width: columns[4].width, align: "right" });
    y += 22;
  });

  if (!rows.length) doc.font("Helvetica").fontSize(10).text("Nenhuma receita encontrada.", 40, y);
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
        paymentFilters: PAYMENT_FILTERS,
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
      const rows = mapRevenueRows(revenues);
      const totalCents = revenues.reduce(
        (sum, revenue) => sum + revenue.totalAmountCents,
        0
      );

      res.render("reports/revenues", {
        user: req.user,
        currentPath: "/reports",
        rows,
        filters,
        paymentFilters: PAYMENT_FILTERS,
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
      const rows = mapRevenueRows(revenues);
      const totalCents = revenues.reduce(
        (sum, revenue) => sum + revenue.totalAmountCents,
        0
      );

      renderRevenuesPdf(res, rows, filters, formatCurrency(totalCents));
    }
  );

  return router;
};
