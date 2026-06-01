const nodemailer = require("nodemailer");

function getTransporter(customConfig = null) {
  const host = customConfig?.host || process.env.SMTP_HOST;
  const port = Number(customConfig?.port || process.env.SMTP_PORT || 587);
  const user = customConfig?.user || process.env.SMTP_USER;
  const pass = customConfig?.pass || process.env.SMTP_PASS;

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

async function sendStatusEmail({ to, subject, html, smtpConfig = null, from = null, attachments = [] }) {
  const transporter = getTransporter(smtpConfig);
  const sender = from || smtpConfig?.from || process.env.MAIL_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
    from: sender,
    to,
    subject,
    html,
    attachments,
  });
}

module.exports = { sendStatusEmail };
