function absoluteUrl(req, path = "/academy") {
  const baseUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  if (baseUrl) return `${baseUrl}${path}`;
  return `${req.protocol}://${req.get("host")}${path}`;
}

function academySeo(req, options = {}) {
  const title = options.title || "CatBreeder Pro | Formação premium para criadores felinos";
  const description =
    options.description ||
    "Academy premium para criadores felinos responsáveis, integrada ao ecossistema CaTech/Gatarina.";
  const path = options.path || req.originalUrl || "/academy";
  const image = options.image || "/logos/catech-logo.png";

  return {
    title,
    description,
    canonicalUrl: absoluteUrl(req, path),
    ogTitle: options.ogTitle || title,
    ogDescription: options.ogDescription || description,
    ogImage: image.startsWith("http") ? image : absoluteUrl(req, image),
    type: options.type || "website",
    robots: options.robots || "index,follow",
    metaPixelId: process.env.META_PIXEL_ID || "",
    googleAnalyticsId: process.env.GA_MEASUREMENT_ID || "",
  };
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sitemapUrl(loc, lastmod, priority = "0.7") {
  return [
    "  <url>",
    `    <loc>${escapeXml(loc)}</loc>`,
    lastmod ? `    <lastmod>${new Date(lastmod).toISOString()}</lastmod>` : "",
    `    <priority>${priority}</priority>`,
    "  </url>",
  ].filter(Boolean).join("\n");
}

module.exports = {
  absoluteUrl,
  academySeo,
  escapeXml,
  sitemapUrl,
};
