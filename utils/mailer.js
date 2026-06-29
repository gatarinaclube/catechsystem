const nodemailer = require("nodemailer");

const DEFAULT_PETGUS_FROM = "PetGus <petgus@gatofilia.com.br>";

function envValue(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && String(value).trim()) return value;
  }
  return "";
}

function getTransporter(customConfig = null) {
  const host = customConfig?.host || envValue("PETGUS_SMTP_HOST", "SMTP_HOST");
  const port = Number(customConfig?.port || envValue("PETGUS_SMTP_PORT", "SMTP_PORT") || 587);
  const user = customConfig?.user || envValue("PETGUS_SMTP_USER", "SMTP_USER");
  const pass = customConfig?.pass || envValue("PETGUS_SMTP_PASS", "SMTP_PASS");

  if (!host || !user || !pass) {
    throw new Error("SMTP não configurado corretamente");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: typeof customConfig?.secure === "boolean" ? customConfig.secure : port === 465,
    auth: { user, pass },
  });
}

async function sendStatusEmail({ to, subject, html, smtpConfig = null, from = null, attachments = [], replyTo = null }) {
  const transporter = getTransporter(smtpConfig);
  const sender = from || smtpConfig?.from || envValue("PETGUS_MAIL_FROM") || DEFAULT_PETGUS_FROM;

  await transporter.sendMail({
    from: sender,
    to,
    subject,
    html,
    attachments,
    ...(replyTo ? { replyTo } : {}),
  });
}

module.exports = { sendStatusEmail };
