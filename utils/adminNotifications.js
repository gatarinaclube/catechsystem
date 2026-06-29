const { sendStatusEmail } = require("./mailer");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function appUrl(path = "") {
  const baseUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  return baseUrl ? `${baseUrl}${path}` : path;
}

function adminEmailsFromEnv() {
  return String(process.env.ADMIN_NOTIFICATION_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

async function getAdminEmails(prisma) {
  const envEmails = adminEmailsFromEnv();
  if (envEmails.length) return envEmails;

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { email: true },
  });

  return admins.map((admin) => admin.email).filter(Boolean);
}

async function notifyAdmins(prisma, { subject, html }) {
  try {
    const recipients = await getAdminEmails(prisma);
    if (!recipients.length) {
      console.warn("Notificação administrativa não enviada: nenhum e-mail de administrador encontrado.");
      return;
    }

    await sendStatusEmail({
      to: recipients.join(","),
      subject,
      html,
    });
  } catch (err) {
    console.error("Erro ao enviar notificação administrativa:", err.message || err);
  }
}

async function sendUserNotification({ to, subject, html }) {
  if (!to) return;

  try {
    await sendStatusEmail({ to, subject, html });
  } catch (err) {
    console.error("Erro ao enviar confirmação ao usuário:", err.message || err);
  }
}

async function notifyNewUser(prisma, user) {
  return notifyAdmins(prisma, {
    subject: "PetGus - Novo usuário cadastrado",
    html: `
      <h2>Novo usuário cadastrado</h2>
      <p><strong>Nome:</strong> ${escapeHtml(user.name)}</p>
      <p><strong>E-mail:</strong> ${escapeHtml(user.email)}</p>
      <p><strong>Telefone:</strong> ${escapeHtml(user.phones || "-")}</p>
      <p><strong>Gatil FIFe:</strong> ${escapeHtml(user.hasFifeCattery === "YES" ? (user.fifeCatteryName || "Sim") : "Não")}</p>
      <p><a href="${appUrl(`/users/${user.id}`)}">Abrir cadastro</a></p>
    `,
  });
}

async function notifyUserRegistrationConfirmation(user) {
  return sendUserNotification({
    to: user.email,
    subject: "PetGus - Cadastro recebido",
    html: `
      <h2>Cadastro recebido</h2>
      <p>Olá, ${escapeHtml(user.name)}.</p>
      <p>Recebemos seu cadastro no PetGus.</p>
      <p><strong>E-mail:</strong> ${escapeHtml(user.email)}</p>
      <p><strong>Telefone:</strong> ${escapeHtml(user.phones || "-")}</p>
      <p><strong>Gatil FIFe:</strong> ${escapeHtml(user.hasFifeCattery === "YES" ? (user.fifeCatteryName || "Sim") : "Não")}</p>
      <p>Acesse o sistema em: <a href="${appUrl("/login-gatarina")}">${appUrl("/login-gatarina")}</a></p>
    `,
  });
}

async function notifyNewCat(prisma, cat, owner = null) {
  return notifyAdmins(prisma, {
    subject: "PetGus - Novo gato cadastrado",
    html: `
      <h2>Novo gato cadastrado</h2>
      <p><strong>Nome:</strong> ${escapeHtml(cat.name)}</p>
      <p><strong>Raça:</strong> ${escapeHtml(cat.breed || "-")}</p>
      <p><strong>Sexo:</strong> ${escapeHtml(cat.gender || "-")}</p>
      <p><strong>Microchip:</strong> ${escapeHtml(cat.microchip || "-")}</p>
      <p><strong>Usuário:</strong> ${escapeHtml(owner?.name || "-")} (${escapeHtml(owner?.email || "-")})</p>
      <p><a href="${appUrl(`/cats/${cat.id}`)}">Abrir gato</a></p>
    `,
  });
}

async function notifyUserCatConfirmation(cat, owner = null) {
  return sendUserNotification({
    to: owner?.email,
    subject: "PetGus - Gato cadastrado",
    html: `
      <h2>Gato cadastrado com sucesso</h2>
      <p>Olá, ${escapeHtml(owner?.name || "")}.</p>
      <p>Seu gato foi cadastrado no módulo Meus Gatos.</p>
      <p><strong>Nome:</strong> ${escapeHtml(cat.name)}</p>
      <p><strong>Raça:</strong> ${escapeHtml(cat.breed || "-")}</p>
      <p><strong>Sexo:</strong> ${escapeHtml(cat.gender || "-")}</p>
      <p><strong>Cor/EMS:</strong> ${escapeHtml(cat.emsCode || "-")}</p>
      <p><strong>Microchip:</strong> ${escapeHtml(cat.microchip || "-")}</p>
      <p><strong>Status:</strong> ${escapeHtml(cat.status || "NOVO")}</p>
      <p><a href="${appUrl(`/cats/${cat.id}`)}">Abrir cadastro do gato</a></p>
    `,
  });
}

async function notifyNewService(prisma, service) {
  const user = service.user || await prisma.user.findUnique({
    where: { id: service.userId },
    select: { name: true, email: true },
  });

  return notifyAdmins(prisma, {
    subject: `PetGus - Novo serviço: ${service.type}`,
    html: `
      <h2>Novo serviço registrado</h2>
      <p><strong>Serviço:</strong> ${escapeHtml(service.type)}</p>
      <p><strong>Descrição:</strong> ${escapeHtml(service.description || "-")}</p>
      <p><strong>Status:</strong> ${escapeHtml(service.status || "ENVIADO_GATARINA")}</p>
      <p><strong>Usuário:</strong> ${escapeHtml(user?.name || "-")} (${escapeHtml(user?.email || "-")})</p>
      <p><a href="${appUrl(`/ffb-services/${service.id}`)}">Abrir serviço</a></p>
    `,
  });
}

async function notifyUserServiceConfirmation(prisma, service) {
  const user = service.user || await prisma.user.findUnique({
    where: { id: service.userId },
    select: { name: true, email: true },
  });

  return sendUserNotification({
    to: user?.email,
    subject: `PetGus - Solicitação recebida: ${service.type}`,
    html: `
      <h2>Solicitação recebida</h2>
      <p>Olá, ${escapeHtml(user?.name || "")}.</p>
      <p>Recebemos sua solicitação no módulo Meus Serviços.</p>
      <p><strong>Protocolo:</strong> #${escapeHtml(service.id)}</p>
      <p><strong>Serviço:</strong> ${escapeHtml(service.type)}</p>
      <p><strong>Descrição:</strong> ${escapeHtml(service.description || "-")}</p>
      <p><strong>Status:</strong> ${escapeHtml(service.status || "ENVIADO_GATARINA")}</p>
      <p><a href="${appUrl(`/my-services/${service.id}`)}">Abrir solicitação</a></p>
    `,
  });
}

module.exports = {
  notifyNewUser,
  notifyNewCat,
  notifyNewService,
  notifyUserRegistrationConfirmation,
  notifyUserCatConfirmation,
  notifyUserServiceConfirmation,
};
