const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");

const COLORS = {
  green: "#17623a",
  darkGreen: "#0f3f29",
  gold: "#c9902f",
  red: "#b71c1c",
  text: "#111827",
  muted: "#5f6b63",
  border: "#d8e2dc",
  soft: "#f6faf7",
  softRed: "#fff1f1",
  white: "#ffffff",
};

const STATUS_LABELS = {
  ENVIADO_GATARINA: "Enviado para Gatarina",
  COM_PENDENCIA: "Servico com Pendencia",
  ENVIADO_FFB: "Enviado para FFB",
  RECEBIDO_FFB: "Recebido da FFB",
  ENVIADO_ASSOCIADO: "Enviado ao Associado",
};

function value(text) {
  if (text === null || text === undefined || text === "") return "-";
  return String(text);
}

function formatDateBR(date) {
  if (!date) return "-";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function formatDateTimeBR(date) {
  if (!date) return "-";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function setPdfMetadata(doc, title) {
  doc.info.Title = title;
  doc.info.Creator = "CaTech System / Gatarina Clube";
}

function drawPageChrome(doc) {
  const { width, height, margins } = doc.page;
  const left = margins.left;
  const right = width - margins.right;
  const top = margins.top;
  const bottom = height - margins.bottom;

  doc.save();
  doc.rect(0, 0, width, 16).fill(COLORS.green);
  doc.rect(left - 10, top - 10, right - left + 20, bottom - top + 20)
    .lineWidth(0.5)
    .strokeColor(COLORS.border)
    .stroke();
  doc.moveTo(left, top - 5)
    .lineTo(right, top - 5)
    .lineWidth(1)
    .strokeColor(COLORS.gold)
    .stroke();
  doc.moveTo(left, height - 28)
    .lineTo(right, height - 28)
    .lineWidth(0.4)
    .strokeColor(COLORS.border)
    .stroke();
  doc.restore();
  doc.x = left;
  doc.y = top;
}

function applyPdfTheme(doc, title = "Documento de servico") {
  setPdfMetadata(doc, title);
  drawPageChrome(doc);
  doc.font("Helvetica").fillColor(COLORS.text);
  return doc;
}

function tryImage(doc, relPath, x, y, options) {
  const abs = path.join(__dirname, "../../public", relPath);
  if (fs.existsSync(abs)) {
    doc.image(abs, x, y, options);
    return true;
  }
  return false;
}

function drawDocumentHeader(doc, title, subtitle) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const top = doc.y;
  const logoSize = 30;

  tryImage(doc, "logos/logo1.png", left, top - 4, { width: logoSize, height: logoSize });
  tryImage(doc, "logos/logo2.png", left + 36, top - 4, { width: logoSize, height: logoSize });
  tryImage(doc, "logos/logo3.png", left + width - 78, top - 8, { width: 78, height: 36 });

  doc.font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(COLORS.darkGreen)
    .text(title, left + 82, top, { width: width - 170, align: "center", lineGap: 0 });
  doc.font("Helvetica")
    .fontSize(8.5)
    .fillColor(COLORS.muted)
    .text(subtitle || "Sistema CaTech / Gatarina Clube", left + 82, top + 18, {
      width: width - 170,
      align: "center",
      lineGap: 0,
    });

  doc.moveTo(left, top + 40).lineTo(left + width, top + 40).lineWidth(0.7).strokeColor(COLORS.border).stroke();
  doc.fillColor(COLORS.text);
  doc.y = top + 50;
}

function drawSectionTitle(doc, title, x, y, width) {
  doc.save();
  doc.rect(x, y, width, 15).fill(COLORS.green);
  doc.font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(COLORS.white)
    .text(title, x + 7, y + 4, { width: width - 14, lineBreak: false });
  doc.restore();
  return y + 15;
}

function drawKeyValueBox(doc, title, items, x, y, width, options = {}) {
  const columns = options.columns || 2;
  const rowHeight = options.rowHeight || 16;
  const titleHeight = 15;
  const rows = Math.max(1, Math.ceil(items.length / columns));
  const height = titleHeight + rows * rowHeight + 8;
  const cellWidth = (width - 14) / columns;

  drawSectionTitle(doc, title, x, y, width);
  doc.save();
  doc.rect(x, y + titleHeight, width, height - titleHeight)
    .fillAndStroke(options.fill || COLORS.soft, COLORS.border);
  doc.restore();

  items.forEach((item, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cellX = x + 7 + col * cellWidth;
    const cellY = y + titleHeight + 6 + row * rowHeight;
    const label = `${item.label}: `;
    doc.font("Helvetica-Bold")
      .fontSize(options.labelSize || 7.7)
      .fillColor(COLORS.darkGreen)
      .text(label, cellX, cellY, { width: cellWidth - 4, continued: true, lineBreak: false });
    doc.font("Helvetica")
      .fontSize(options.valueSize || 7.7)
      .fillColor(COLORS.text)
      .text(value(item.value), { width: cellWidth - 4, ellipsis: true, lineBreak: false });
  });

  return y + height + (options.gap ?? 7);
}

function drawTextBox(doc, title, lines, x, y, width, options = {}) {
  const titleHeight = 15;
  const lineHeight = options.lineHeight || 12;
  const height = titleHeight + Math.max(1, lines.length) * lineHeight + 9;

  drawSectionTitle(doc, title, x, y, width);
  doc.save();
  doc.rect(x, y + titleHeight, width, height - titleHeight)
    .fillAndStroke(options.fill || COLORS.soft, COLORS.border);
  doc.restore();

  const text = lines.length ? lines.map(value).join("\n") : "-";
  doc.font("Helvetica")
    .fontSize(options.fontSize || 7.8)
    .fillColor(COLORS.text)
    .text(text, x + 7, y + titleHeight + 6, {
      width: width - 14,
      height: height - titleHeight - 8,
      ellipsis: true,
      lineGap: 0,
    });
  return y + height + (options.gap ?? 7);
}

function drawTable(doc, title, columns, rows, x, y, width, options = {}) {
  const titleHeight = 15;
  const headerHeight = options.headerHeight || 14;
  const rowHeight = options.rowHeight || 20;
  const maxRows = options.maxRows || rows.length;
  const displayRows = rows.slice(0, maxRows);
  const height = titleHeight + headerHeight + Math.max(1, displayRows.length) * rowHeight + 4;

  drawSectionTitle(doc, title, x, y, width);
  doc.save();
  doc.rect(x, y + titleHeight, width, height - titleHeight)
    .fillAndStroke(COLORS.white, COLORS.border);
  doc.rect(x, y + titleHeight, width, headerHeight).fill(COLORS.softRed);
  doc.restore();

  let colX = x + 5;
  columns.forEach((col) => {
    doc.font("Helvetica-Bold")
      .fontSize(7)
      .fillColor(COLORS.darkGreen)
      .text(col.label, colX, y + titleHeight + 4, {
        width: col.width,
        ellipsis: true,
        lineBreak: false,
      });
    colX += col.width;
  });

  displayRows.forEach((row, rowIndex) => {
    const rowY = y + titleHeight + headerHeight + 3 + rowIndex * rowHeight;
    if (rowIndex % 2 === 0) {
      doc.save();
      doc.rect(x + 1, rowY - 2, width - 2, rowHeight).fill("#fbfdfb");
      doc.restore();
    }
    let cellX = x + 5;
    columns.forEach((col) => {
      doc.font("Helvetica")
        .fontSize(options.fontSize || 6.8)
        .fillColor(COLORS.text)
        .text(value(row[col.key]), cellX, rowY, {
          width: col.width,
          height: rowHeight - 2,
          ellipsis: true,
          lineGap: 0,
        });
      cellX += col.width;
    });
  });

  if (!displayRows.length) {
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted).text("-", x + 6, y + titleHeight + headerHeight + 5);
  }

  return y + height + (options.gap ?? 7);
}

function drawStatusBox(doc, statuses, x, y, width, options = {}) {
  const mapped = Array.isArray(statuses) && statuses.length
    ? statuses.map((st, index) => `${index + 1}. ${STATUS_LABELS[st.status] || st.status} - ${formatDateTimeBR(st.createdAt)}`)
    : ["Nenhum status registrado ate o momento."];
  return drawTextBox(doc, "LINHA DO TEMPO DE STATUS", mapped, x, y, width, {
    fontSize: options.fontSize || 7.1,
    lineHeight: options.lineHeight || 10,
    gap: options.gap ?? 0,
  });
}

function createServiceDoc(output, title) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 34,
    bufferPages: false,
    autoFirstPage: true,
  });
  doc.pipe(output);
  applyPdfTheme(doc, title);
  return doc;
}

module.exports = {
  COLORS,
  STATUS_LABELS,
  applyPdfTheme,
  createServiceDoc,
  drawDocumentHeader,
  drawKeyValueBox,
  drawStatusBox,
  drawTable,
  drawTextBox,
  formatDateBR,
  formatDateTimeBR,
  value,
};
