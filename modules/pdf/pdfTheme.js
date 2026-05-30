const BRAND_GREEN = "#1f7a3f";
const ACCENT_GOLD = "#d39b2a";
const BORDER = "#d9e2dc";
const MUTED = "#6b7280";

function drawPageChrome(doc) {
  const { width, height, margins } = doc.page;
  const left = margins.left;
  const right = width - margins.right;
  const bottom = height - margins.bottom;
  const currentX = doc.x;
  const currentY = doc.y;

  doc.save();

  doc
    .rect(0, 0, width, 18)
    .fill(BRAND_GREEN);

  doc
    .rect(left - 12, margins.top - 12, right - left + 24, bottom - margins.top + 24)
    .lineWidth(0.6)
    .strokeColor(BORDER)
    .stroke();

  doc
    .moveTo(left, 31)
    .lineTo(right, 31)
    .lineWidth(1.2)
    .strokeColor(ACCENT_GOLD)
    .stroke();

  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(MUTED)
    .text("CaTech System / Gatarina Clube", left, height - 30, {
      width: right - left,
      align: "left",
    });

  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(MUTED)
    .text("Documento gerado eletronicamente", left, height - 30, {
      width: right - left,
      align: "right",
    });

  doc.restore();
  doc.x = currentX;
  doc.y = currentY;
}

function applyPdfTheme(doc) {
  drawPageChrome(doc);
  doc.on("pageAdded", () => {
    drawPageChrome(doc);
  });
  doc.font("Helvetica").fillColor("#111827");
  return doc;
}

module.exports = {
  applyPdfTheme,
};
