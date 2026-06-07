const crypto = require("crypto");

function cleanText(value) {
  return String(value || "").trim();
}

function getEncryptionKey() {
  return crypto
    .createHash("sha256")
    .update(process.env.SESSION_SECRET || "catech-system-secret")
    .digest();
}

function encryptSecret(value) {
  const text = cleanText(value);
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

function decryptSecret(value) {
  if (!value) return "";
  try {
    const [ivRaw, tagRaw, encryptedRaw] = String(value).split(":");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      Buffer.from(ivRaw, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

function buildSender(settings) {
  const email = cleanText(settings?.marketingFromEmail);
  const name = cleanText(settings?.marketingFromName);
  if (!email) return null;
  return name ? `"${name.replace(/"/g, "'")}" <${email}>` : email;
}

function buildUserSmtpConfig(settings) {
  const host = cleanText(settings?.marketingSmtpHost);
  const user = cleanText(settings?.marketingSmtpUser);
  const pass = decryptSecret(settings?.marketingSmtpPassEncrypted);
  const from = buildSender(settings);
  const port = Number(settings?.marketingSmtpPort || 0);

  if (!host || !user || !pass || !from || !port) return null;

  return {
    host,
    port,
    secure: Boolean(settings?.marketingSmtpSecure),
    user,
    pass,
    from,
  };
}

function shapeSmtpSettings(settings) {
  return {
    fromName: settings?.marketingFromName || "",
    fromEmail: settings?.marketingFromEmail || "",
    host: settings?.marketingSmtpHost || "",
    port: settings?.marketingSmtpPort || 587,
    secure: Boolean(settings?.marketingSmtpSecure),
    user: settings?.marketingSmtpUser || "",
    hasPassword: Boolean(settings?.marketingSmtpPassEncrypted),
    isComplete: Boolean(buildUserSmtpConfig(settings)),
  };
}

module.exports = {
  encryptSecret,
  decryptSecret,
  buildSender,
  buildUserSmtpConfig,
  shapeSmtpSettings,
};
