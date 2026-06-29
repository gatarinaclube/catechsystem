function absoluteUrl(req, path = "/academy") {
  const baseUrl = (process.env.GATOFILIA_PUBLIC_URL || "https://www.gatofilia.com.br").replace(/\/$/, "");
  if (baseUrl) return `${baseUrl}${path}`;
  return `${req.protocol}://${req.get("host")}${path}`;
}

function safeJsonLd(data) {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function academySeo(req, options = {}) {
  const title = options.title || "Gatofilia | Formação para Criadores de Gatos";
  const description =
    options.description ||
    "Capacitação premium para criadores e novos criadores que buscam conhecimento, responsabilidade, gestão profissional e excelência em felinocultura.";
  const path = options.path || req.originalUrl || "/academy";
  const image = options.image || "/uploads/academy/gatofilia-logo.png";
  const keywords = Array.isArray(options.keywords) ? options.keywords.join(", ") : (options.keywords || "");
  const jsonLd = Array.isArray(options.jsonLd) ? options.jsonLd : [];

  return {
    title,
    description,
    keywords,
    canonicalUrl: absoluteUrl(req, path),
    ogTitle: options.ogTitle || title,
    ogDescription: options.ogDescription || description,
    ogImage: image.startsWith("http") ? image : absoluteUrl(req, image),
    locale: options.locale || "pt_BR",
    type: options.type || "website",
    robots: options.robots || "index,follow",
    jsonLd: jsonLd.map((item) => safeJsonLd(item)),
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
  safeJsonLd,
  sitemapUrl,
};
