function absoluteUrl(pathValue = "/") {
  const base = (process.env.APP_URL || "https://catechsystem.com.br").replace(/\/$/, "");
  const path = String(pathValue || "/");
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function cleanText(value, max = 160) {
  const text = String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!max || text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function imageUrl(pathValue) {
  if (!pathValue) return absoluteUrl("/logos/catech-icon.png");
  return absoluteUrl(pathValue);
}

function baseSeo({
  title,
  description,
  path = "/",
  image = "/logos/catech-icon.png",
  type = "website",
  keywords = [],
} = {}) {
  return {
    title: cleanText(title || "CaTech System", 70),
    description: cleanText(description || "Sistema de gestão para gatil, criação felina, microchip e vitrine pública de filhotes.", 170),
    canonicalUrl: absoluteUrl(path),
    imageUrl: imageUrl(image),
    type,
    keywords: Array.isArray(keywords) ? keywords.filter(Boolean).join(", ") : String(keywords || ""),
  };
}

function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "CaTech System",
    url: absoluteUrl("/"),
    logo: absoluteUrl("/logos/catech-system-wide.png"),
  };
}

module.exports = {
  absoluteUrl,
  baseSeo,
  cleanText,
  organizationSchema,
};
