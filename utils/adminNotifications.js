const { sendStatusEmail } = require("./mailer");
const { getRoleLabel } = require("./access");

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
  const requiredGatarinaEmail = process.env.GATARINA_ADMIN_EMAIL || "contato@gatarina.com.br";
  if (envEmails.length) return Array.from(new Set([...envEmails, requiredGatarinaEmail]));

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { email: true },
  });

  return Array.from(new Set([...admins.map((admin) => admin.email).filter(Boolean), requiredGatarinaEmail]));
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

function formatDate(value) {
  if (!value) return "sem vencimento cadastrado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sem vencimento cadastrado";
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function approvalStatusLabel(value) {
  const labels = {
    DEFERIDO: "Ativo",
    INDEFERIDO: "Inativo",
    RESTRICOES: "Com restrições",
  };
  return labels[String(value || "").toUpperCase()] || "Não informado";
}

function subscriptionStatusLabel(value) {
  const labels = {
    ACTIVE: "Ativo",
    TRIALING: "Teste gratuito",
    PENDING: "Pagamento pendente",
    PENDING_ASSOCIATION_PAYMENT: "Pagamento de associação pendente",
    EXPIRED: "Vencido",
    CANCELED: "Cancelado",
  };
  return labels[String(value || "").toUpperCase()] || "Não informado";
}

function supportBlock() {
  return `
    <p style="margin-top:18px;">
      Se quiser ajuda para configurar o sistema, tirar dúvidas ou receber orientação de uso, fale conosco:
      <br><strong>E-mail:</strong> petgus@gatofilia.com.br
    </p>
  `;
}

async function notifyUserAccessStatusChange(user, previousStatus, nextStatus) {
  if (!user?.email || previousStatus === nextStatus) return;

  const wasActive = previousStatus === "DEFERIDO";
  const isActive = nextStatus === "DEFERIDO";

  if (isActive && !wasActive) {
    return sendUserNotification({
      to: user.email,
      subject: "PetGus - Seu acesso foi ativado",
      html: `
        <h2>Bem-vindo ao PetGus!</h2>
        <p>Olá, ${escapeHtml(user.name)}.</p>
        <p>Seu acesso ao PetGus está ativo. Ficamos felizes em ter você com a gente nessa rotina de gestão do gatil.</p>
        <p><strong>Plano/perfil:</strong> ${escapeHtml(getRoleLabel(user.role || user.selectedPlan))}</p>
        <p><strong>Status:</strong> ${escapeHtml(subscriptionStatusLabel(user.subscriptionStatus))}</p>
        <p><strong>Vencimento:</strong> ${escapeHtml(formatDate(user.trialEndsAt))}</p>
        <p>Acesse em: <a href="${appUrl("/login")}">${appUrl("/login")}</a></p>
        ${supportBlock()}
      `,
    });
  }

  if (!isActive && wasActive) {
    return sendUserNotification({
      to: user.email,
      subject: "PetGus - Seu acesso está inativo",
      html: `
        <h2>Seu acesso foi atualizado</h2>
        <p>Olá, ${escapeHtml(user.name)}.</p>
        <p>Seu acesso ao PetGus está temporariamente inativo ou com restrições.</p>
        <p>Caso queira continuar usando o sistema, regularizar o plano ou entender o motivo da alteração, nossa equipe está à disposição.</p>
        <p><strong>Situação atual:</strong> ${escapeHtml(approvalStatusLabel(nextStatus))}</p>
        ${supportBlock()}
      `,
    });
  }
}

async function notifyUserSubscriptionStatusChange(user, previousStatus, nextStatus) {
  if (!user?.email || previousStatus === nextStatus) return;

  const status = String(nextStatus || "").toUpperCase();
  const isActive = status === "ACTIVE" || status === "TRIALING";
  const isInactive = ["EXPIRED", "CANCELED", "PENDING", "PENDING_ASSOCIATION_PAYMENT"].includes(status);

  if (isActive) {
    const title = status === "TRIALING" ? "Seu teste gratuito começou" : "Seu plano está ativo";
    const lead = status === "TRIALING"
      ? "Seu teste gratuito do PetGus está ativo. Aproveite este período para conhecer a rotina de gestão e organizar seu gatil."
      : "Seu plano PetGus foi ativado com sucesso. Obrigado por escolher nossa plataforma para apoiar a gestão do seu gatil.";

    return sendUserNotification({
      to: user.email,
      subject: `PetGus - ${title}`,
      html: `
        <h2>${escapeHtml(title)}</h2>
        <p>Olá, ${escapeHtml(user.name)}.</p>
        <p>${escapeHtml(lead)}</p>
        <p><strong>Plano/perfil:</strong> ${escapeHtml(getRoleLabel(user.role || user.selectedPlan))}</p>
        <p><strong>Status:</strong> ${escapeHtml(subscriptionStatusLabel(nextStatus))}</p>
        <p><strong>Vencimento:</strong> ${escapeHtml(formatDate(user.trialEndsAt))}</p>
        <p>Acesse em: <a href="${appUrl("/login")}">${appUrl("/login")}</a></p>
        ${supportBlock()}
      `,
    });
  }

  if (isInactive) {
    return sendUserNotification({
      to: user.email,
      subject: "PetGus - Atualização do seu plano",
      html: `
        <h2>Atualização do seu plano PetGus</h2>
        <p>Olá, ${escapeHtml(user.name)}.</p>
        <p>O status do seu plano foi atualizado para <strong>${escapeHtml(subscriptionStatusLabel(nextStatus))}</strong>.</p>
        <p>Se o período de teste ou contratação terminou, esperamos seu contato para continuar com o PetGus e manter sua gestão sempre organizada.</p>
        <p><strong>Vencimento registrado:</strong> ${escapeHtml(formatDate(user.trialEndsAt))}</p>
        ${supportBlock()}
      `,
    });
  }
}

async function notifyUserPlanChange(user, previousPlan, nextPlan) {
  if (!user?.email || previousPlan === nextPlan) return;

  return sendUserNotification({
    to: user.email,
    subject: "PetGus - Seu plano foi alterado",
    html: `
      <h2>Seu plano foi atualizado</h2>
      <p>Olá, ${escapeHtml(user.name)}.</p>
      <p>Seu plano/perfil no PetGus foi alterado.</p>
      <p><strong>Plano anterior:</strong> ${escapeHtml(previousPlan ? getRoleLabel(previousPlan) : "Não informado")}</p>
      <p><strong>Novo plano:</strong> ${escapeHtml(nextPlan ? getRoleLabel(nextPlan) : "Não informado")}</p>
      <p><strong>Vencimento:</strong> ${escapeHtml(formatDate(user.trialEndsAt))}</p>
      <p>Estamos à disposição para ajudar você a aproveitar melhor os recursos disponíveis no seu novo plano.</p>
      ${supportBlock()}
    `,
  });
}

async function notifyNewUser(prisma, user) {
  return notifyAdmins(prisma, {
    subject: "PetGus - Novo usuário cadastrado",
    html: `
      <h2>Novo usuário cadastrado</h2>
      <p><strong>Nome:</strong> ${escapeHtml(user.name)}</p>
      <p><strong>E-mail:</strong> ${escapeHtml(user.email)}</p>
      <p><strong>Telefone:</strong> ${escapeHtml(user.phones || "-")}</p>
      <p><strong>Origem:</strong> ${escapeHtml(user.accountOrigin === "NON_ASSOCIATE" ? "Usuário comercial PetGus" : user.accountOrigin === "ASSOCIATE" ? "Solicitação de associação Gatarina" : "Cadastro interno")}</p>
      <p><strong>Perfil/plano:</strong> ${escapeHtml(user.selectedPlan || user.role || "-")}</p>
      <p><strong>Status:</strong> ${escapeHtml(user.subscriptionStatus || user.approvalStatus || "-")}</p>
      <p><strong>Gatil FIFe:</strong> ${escapeHtml(user.hasFifeCattery === "YES" ? (user.fifeCatteryName || "Sim") : "Não")}</p>
      <p><a href="${appUrl(`/users/${user.id}`)}">Abrir cadastro</a></p>
    `,
  });
}

async function notifyUserRegistrationConfirmation(user) {
  const loginPath = user.accountOrigin === "NON_ASSOCIATE" ? "/login" : "/login-gatarina";
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
      <p>Acesse o sistema em: <a href="${appUrl(loginPath)}">${appUrl(loginPath)}</a></p>
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
  notifyUserAccessStatusChange,
  notifyUserPlanChange,
  notifyUserRegistrationConfirmation,
  notifyUserSubscriptionStatusChange,
  notifyUserCatConfirmation,
  notifyUserServiceConfirmation,
};
