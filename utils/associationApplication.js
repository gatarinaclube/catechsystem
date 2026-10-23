const PDFDocument = require("pdfkit");
const { sendStatusEmail } = require("./mailer");
const declaration = require("./associationDeclaration");

const CLUB_EMAIL = "contato@gatarina.com.br";
const DATA_FIELDS = [
  ["name", "Nome completo"], ["cpf", "CPF/CNPJ ou DNI/CNI"],
  ["email", "E-mail"], ["phones", "Telefone(s)"], ["address", "Endereço"],
  ["city", "Cidade"], ["state", "Estado"], ["cep", "CEP"],
  ["country", "País"], ["clubs", "Clubes"],
  ["hasFifeCattery", "Possui gatil FIFe"], ["fifeCatteryName", "Nome do gatil FIFe"],
];

function hasAssociationConsent(body) {
  return body.agree1 === "on" && body.agree2 === "on";
}

function createApplicationSnapshot(user) {
  return {
    data: Object.fromEntries(DATA_FIELDS.map(([key]) => [key, user[key] || null])),
    declaration: {
      ...declaration,
      acceptances: declaration.acceptances.map((text) => ({ text, accepted: true })),
    },
  };
}

function formatApplicationDate(value) {
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) + " (Brasília)";
}

function applicationFields(application) {
  return DATA_FIELDS.map(([key, label]) => ({
    label,
    value: key === "hasFifeCattery"
      ? (application.data[key] === "YES" ? "Sim" : "Não")
      : application.data[key] || "Não informado",
  }));
}

function generateApplicationPdf(application) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.font("Helvetica-Bold").fontSize(16).text("Solicitação de associação - Gatarina Clube");
    doc.moveDown().font("Helvetica").fontSize(10)
      .text(`Protocolo: ${application.id} | Usuário: ${application.userId}`)
      .text(`Solicitação e aceite: ${formatApplicationDate(application.submittedAt)}`);
    doc.moveDown();
    for (const field of applicationFields(application)) doc.text(`${field.label}: ${field.value}`);
    doc.moveDown().font("Helvetica-Bold").fontSize(12).text("Declaração de ciência e responsabilidade");
    doc.moveDown().font("Helvetica").fontSize(10).text(application.declaration.introduction);
    for (const rule of application.declaration.rules) doc.moveDown(0.5).text(`- ${rule}`);
    doc.moveDown();
    for (const link of application.declaration.links) doc.text(`${link.label}: ${link.url}`);
    doc.moveDown();
    for (const acceptance of application.declaration.acceptances) {
      doc.moveDown(0.5).text(`${acceptance.accepted ? "ACEITO" : "NÃO ACEITO"}: ${acceptance.text}`);
    }
    doc.moveDown().text(`Versão da declaração: ${application.declaration.version}`);
    doc.text("Cópia dos dados e do aceite registrados no envio da solicitação.");
    doc.end();
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

async function sendApplicationCopies(prisma, application) {
  const pdf = await generateApplicationPdf(application);
  const html = `<h2>Solicitação de associação - Gatarina Clube</h2>
    <p>Protocolo: ${application.id}</p>
    <p>Solicitação e aceite: ${escapeHtml(formatApplicationDate(application.submittedAt))}</p>
    ${applicationFields(application).map(({ label, value }) => `<p><strong>${label}:</strong> ${escapeHtml(value)}</p>`).join("")}
    <h3>Declaração de ciência e responsabilidade</h3>
    <p>${escapeHtml(application.declaration.introduction)}</p>
    <ul>${application.declaration.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ul>
    ${application.declaration.links.map((link) => `<p>${escapeHtml(link.label)}: ${escapeHtml(link.url)}</p>`).join("")}
    ${application.declaration.acceptances.map((item) => `<p><strong>${item.accepted ? "ACEITO" : "NÃO ACEITO"}:</strong> ${escapeHtml(item.text)}</p>`).join("")}
    <p>A cópia em PDF segue em anexo. Versão da declaração: ${escapeHtml(application.declaration.version)}.</p>`;

  // Deliver independently, and retry only copies that have not been sent.
  for (const [prefix, to] of [["member", application.data.email], ["club", CLUB_EMAIL]]) {
    if (application[`${prefix}CopySentAt`]) continue;
    let error = null;
    try {
      await sendStatusEmail({
        to,
        subject: `Gatarina - Solicitação de associação #${application.id}`,
        html,
        attachments: [{ filename: `solicitacao-associacao-${application.id}.pdf`, content: pdf, contentType: "application/pdf" }],
      });
    } catch (err) {
      error = String(err.message || err).slice(0, 1000);
      console.error(`Erro ao enviar cópia da associação #${application.id} (${prefix}):`, error);
    }
    await prisma.associationApplication.update({
      where: { id: application.id },
      data: {
        [`${prefix}CopySentAt`]: error ? null : new Date(),
        [`${prefix}CopyError`]: error,
      },
    });
  }
}

module.exports = {
  hasAssociationConsent, createApplicationSnapshot, formatApplicationDate,
  applicationFields, generateApplicationPdf, sendApplicationCopies,
};
