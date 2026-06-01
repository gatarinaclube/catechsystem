const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { canViewAllData } = require("../utils/access");
const { sendStatusEmail } = require("../utils/mailer");

const baseUploadsDir = process.env.UPLOADS_DIR
  ? process.env.UPLOADS_DIR
  : path.join(__dirname, "..", "public", "uploads");
const marketingUploadDir = path.join(baseUploadsDir, "crm-marketing");
const MARKETING_FONTS = [
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "Trebuchet MS, Arial, sans-serif", label: "Trebuchet" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
];
const DEFAULT_TEMPLATE = {
  fontFamily: "Arial, Helvetica, sans-serif",
  backgroundColor: "#f3f4f6",
  cardColor: "#ffffff",
  textColor: "#1f2933",
  accentColor: "#8a5a20",
  footerText: "Você recebeu este e-mail porque se cadastrou para receber novidades.",
};

if (!fs.existsSync(marketingUploadDir)) {
  fs.mkdirSync(marketingUploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, marketingUploadDir),
    filename: (req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `marketing-${unique}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "marketingImage" && !file.mimetype.startsWith("image/")) {
      return cb(new Error("Envie apenas imagens no e-mail marketing."));
    }
    cb(null, true);
  },
});

function cleanText(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || "";
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function extractEmails(value) {
  const text = cleanText(value);
  if (!text) return [];
  return Array.from(
    new Set(
      text
        .split(/[\s,;]+/)
        .map(normalizeEmail)
        .filter(Boolean)
        .filter(isValidEmail)
    )
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildAbsoluteUrl(req, filePath) {
  if (!filePath) return "";
  const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
  return `${baseUrl}${filePath}`;
}

function normalizeColor(value, fallback) {
  const text = cleanText(value);
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
}

function normalizeUrl(value) {
  const text = cleanText(value);
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}

function normalizeFont(value) {
  const text = cleanText(value);
  return MARKETING_FONTS.some((font) => font.value === text)
    ? text
    : DEFAULT_TEMPLATE.fontFamily;
}

function shapeMarketingTemplate(settings) {
  return {
    fontFamily: normalizeFont(settings?.marketingFontFamily),
    backgroundColor: normalizeColor(settings?.marketingBackgroundColor, DEFAULT_TEMPLATE.backgroundColor),
    cardColor: normalizeColor(settings?.marketingCardColor, DEFAULT_TEMPLATE.cardColor),
    textColor: normalizeColor(settings?.marketingTextColor, DEFAULT_TEMPLATE.textColor),
    accentColor: normalizeColor(settings?.marketingAccentColor, DEFAULT_TEMPLATE.accentColor),
    websiteUrl: settings?.marketingWebsiteUrl || "",
    instagramUrl: settings?.marketingInstagramUrl || "",
    whatsappUrl: settings?.marketingWhatsappUrl || "",
    footerText: settings?.marketingFooterText || DEFAULT_TEMPLATE.footerText,
  };
}

function buildButtons(buttons, accentColor) {
  const filtered = buttons.filter((button) => button.url && button.label);
  if (!filtered.length) return "";

  const iconByKey = {
    website: "www",
    instagram: "IG",
    whatsapp: "WA",
    extra: "+",
  };

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-top:22px;">
      <tr>
        <td style="text-align:center;">
          ${filtered.map((button) => `
            <a href="${escapeHtml(button.url)}" style="display:inline-block;margin:4px;padding:12px 18px;border-radius:6px;background:${accentColor};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">
              <span style="display:inline-block;min-width:24px;height:24px;line-height:24px;margin-right:8px;border-radius:50%;background:rgba(255,255,255,0.22);color:#ffffff;text-align:center;font-size:11px;font-weight:800;vertical-align:middle;">
                ${escapeHtml(iconByKey[button.key] || "+")}
              </span>
              ${escapeHtml(button.label)}
            </a>
          `).join("")}
        </td>
      </tr>
    </table>
  `;
}

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function parseJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function buildCampaignButtons(body, template) {
  return [
    { key: "website", label: cleanText(body.websiteButtonLabel) || "Site", url: normalizeUrl(body.websiteButtonUrl || template.websiteUrl) },
    { key: "instagram", label: cleanText(body.instagramButtonLabel) || "Instagram", url: normalizeUrl(body.instagramButtonUrl || template.instagramUrl) },
    { key: "whatsapp", label: cleanText(body.whatsappButtonLabel) || "WhatsApp", url: normalizeUrl(body.whatsappButtonUrl || template.whatsappUrl) },
    { key: "extra", label: cleanText(body.extraButtonLabel), url: normalizeUrl(body.extraButtonUrl) },
  ].filter((button) => button.url && button.label);
}

function shapeDraft(draft) {
  const buttons = parseJson(draft?.ctaJson, []) || [];
  const byKey = (key) => buttons.find((button) => button.key === key) || {};
  return {
    id: draft?.id || null,
    title: draft?.title || "",
    subject: draft?.subject || "",
    bodyText: draft?.bodyText || "",
    websiteButtonLabel: byKey("website").label || "Site",
    websiteButtonUrl: byKey("website").url || "",
    instagramButtonLabel: byKey("instagram").label || "Instagram",
    instagramButtonUrl: byKey("instagram").url || "",
    whatsappButtonLabel: byKey("whatsapp").label || "WhatsApp",
    whatsappButtonUrl: byKey("whatsapp").url || "",
    extraButtonLabel: byKey("extra").label || "",
    extraButtonUrl: byKey("extra").url || "",
  };
}

function buildMarketingHtml({
  subject,
  bodyText,
  imageUrl,
  template,
  buttons,
  trackingPixelUrl = "",
  unsubscribeUrl = "",
}) {
  const paragraphs = escapeHtml(bodyText)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n/g, "<br>"))
    .map((paragraph) => `<p style="margin:0 0 16px;">${paragraph}</p>`)
    .join("");
  const safeTemplate = {
    ...DEFAULT_TEMPLATE,
    ...template,
  };

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${safeTemplate.backgroundColor};padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:680px;background:${safeTemplate.cardColor};border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
            ${imageUrl ? `
              <tr>
                <td>
                  <img src="${escapeHtml(imageUrl)}" alt="" style="width:100%;max-width:680px;display:block;border:0;">
                </td>
              </tr>
            ` : ""}
            <tr>
              <td style="padding:30px 28px 26px;font-family:${safeTemplate.fontFamily};color:${safeTemplate.textColor};line-height:1.65;font-size:15px;">
                <div style="width:54px;height:4px;background:${safeTemplate.accentColor};border-radius:99px;margin-bottom:18px;"></div>
                <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:${safeTemplate.textColor};font-weight:800;">${escapeHtml(subject)}</h1>
                ${paragraphs}
                ${buildButtons(buttons, safeTemplate.accentColor)}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#f9fafb;font-family:${safeTemplate.fontFamily};color:#6b7280;font-size:12px;line-height:1.5;text-align:center;">
                ${escapeHtml(safeTemplate.footerText)}
                ${unsubscribeUrl ? `<br><a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;">Não quero mais receber estes e-mails</a>` : ""}
              </td>
            </tr>
          </table>
          ${trackingPixelUrl ? `<img src="${escapeHtml(trackingPixelUrl)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;">` : ""}
        </td>
      </tr>
    </table>
  `;
}

const OPEN_PIXEL = Buffer.from(
  "R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64"
);

function getEncryptionKey() {
  const secret =
    process.env.MARKETING_SMTP_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.SMTP_PASS ||
    "dev-secret";
  return crypto.createHash("sha256").update(secret).digest();
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

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  function clientScope(req) {
    if (canViewAllData(req.session?.userRole)) return { deletedAt: null };
    return {
      deletedAt: null,
      OR: [
        { ownerId: req.session?.userId || null },
        { ownerId: null },
      ],
    };
  }

  function formatDateLabel(date) {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });
  }

  function normalizeDocument(value) {
    return String(value || "").replace(/[\s.\-_/]/g, "").toUpperCase();
  }

  async function ensureUniqueDocument(req, document, excludeId = null) {
    const normalized = normalizeDocument(document);
    if (!normalized) return;

    const clients = await prisma.revenueClient.findMany({
      where: clientScope(req),
      select: { id: true, document: true },
    });
    const duplicate = clients.find((client) =>
      client.id !== excludeId && normalizeDocument(client.document) === normalized
    );

    if (duplicate) {
      throw new Error("Já existe um cliente cadastrado com este CPF/RG/Passaporte.");
    }
  }

  function clientData(req) {
    return {
      fullName: req.body.fullName,
      document: req.body.document || null,
      cep: req.body.cep || null,
      street: req.body.street || null,
      number: req.body.number || null,
      complement: req.body.complement || null,
      neighborhood: req.body.neighborhood || null,
      city: req.body.city || null,
      state: req.body.state || null,
      country: req.body.country || null,
      email: req.body.email || null,
      phone: req.body.phone || null,
    };
  }

  function marketingScope(req) {
    return { ownerId: req.session?.userId };
  }

  async function getMarketingRecipients(req) {
    const recipientMode = cleanText(req.body.recipientMode) || "all";

    if (recipientMode === "manual") {
      return extractEmails(req.body.manualRecipients).map((email) => ({
        id: null,
        email,
        unsubscribeToken: null,
        manual: true,
      }));
    }

    if (recipientMode === "selected") {
      const ids = []
        .concat(req.body.selectedContacts || [])
        .map((id) => Number(id))
        .filter(Boolean);

      if (!ids.length) return [];

      return prisma.crmEmailContact.findMany({
        where: {
          ...marketingScope(req),
          id: { in: ids },
        },
        orderBy: { email: "asc" },
      });
    }

    return prisma.crmEmailContact.findMany({
      where: marketingScope(req),
      orderBy: { email: "asc" },
    });
  }

  async function buildMarketingMessage(req) {
    const subject = cleanText(req.body.subject);
    const bodyText = cleanText(req.body.bodyText);

    if (!subject || !bodyText) {
      throw new Error("Informe assunto e texto do e-mail.");
    }

    const imageFile = req.files?.marketingImage?.[0] || null;
    const attachmentFiles = req.files?.marketingAttachments || [];
    const imagePath = imageFile ? `/uploads/crm-marketing/${imageFile.filename}` : null;
    const attachmentPaths = attachmentFiles.map((file) => `/uploads/crm-marketing/${file.filename}`);
    const imageUrl = buildAbsoluteUrl(req, imagePath);
    const settings = await prisma.userSettings.findUnique({
      where: { userId: req.session.userId },
    });
    const template = shapeMarketingTemplate(settings);
    const buttons = buildCampaignButtons(req.body, template);
    const smtpConfig = buildUserSmtpConfig(settings);
    if (!smtpConfig) {
      throw new Error("Configure seu próprio SMTP/remetente antes de enviar e-mail marketing.");
    }
    const attachments = attachmentFiles.map((file) => ({
      filename: file.originalname,
      path: file.path,
    }));

    return {
      subject,
      bodyText,
      imagePath,
      attachmentPaths,
      imageUrl,
      template,
      buttons,
      smtpConfig,
      attachments,
    };
  }

  function isClientComplete(client) {
    return Boolean(
      client.fullName &&
      client.document &&
      (client.email || client.phone) &&
      client.country &&
      client.city &&
      client.state
    );
  }

  router.get("/crm", requireAuth, requirePermission("admin.crm"), async (req, res) => {
    const [clients, emailContacts, campaigns, drafts, userSettings] = await Promise.all([
      prisma.revenueClient.findMany({
        where: clientScope(req),
        orderBy: { fullName: "asc" },
        include: {
          _count: {
            select: { revenues: true },
          },
        },
      }),
      prisma.crmEmailContact.findMany({
        where: marketingScope(req),
        orderBy: { createdAt: "desc" },
      }),
      prisma.crmEmailCampaign.findMany({
        where: marketingScope(req),
        orderBy: { sentAt: "desc" },
        take: 10,
      }),
      prisma.crmEmailDraft.findMany({
        where: marketingScope(req),
        orderBy: { updatedAt: "desc" },
      }),
      prisma.userSettings.findUnique({
        where: { userId: req.session.userId },
      }),
    ]);
    const selectedDraftId = req.query.draftId ? Number(req.query.draftId) : null;
    const selectedDraft = selectedDraftId
      ? drafts.find((draft) => draft.id === selectedDraftId)
      : null;
    const mappedClients = clients.map((client) => ({
      ...client,
      createdAtLabel: formatDateLabel(client.createdAt),
      isComplete: isClientComplete(client),
      salesCount: client._count?.revenues || 0,
      locationLabel: [client.city, client.state].filter(Boolean).join(" - "),
      contactLabel: [client.phone, client.email].filter(Boolean).join(" · "),
    }));

    res.render("crm/index", {
      user: req.user,
      clients: mappedClients,
      emailContacts: emailContacts.map((contact) => ({
        ...contact,
        createdAtLabel: formatDateLabel(contact.createdAt),
      })),
      campaigns: campaigns.map((campaign) => ({
        ...campaign,
        sentAtLabel: formatDateLabel(campaign.sentAt),
        openRate: campaign.deliveredCount
          ? Math.round((campaign.openedCount / campaign.deliveredCount) * 100)
          : 0,
      })),
      drafts: drafts.map((draft) => ({
        ...draft,
        updatedAtLabel: formatDateLabel(draft.updatedAt),
      })),
      selectedDraft: shapeDraft(selectedDraft),
      smtpSettings: shapeSmtpSettings(userSettings),
      marketingTemplate: shapeMarketingTemplate(userSettings),
      marketingFonts: MARKETING_FONTS,
      activeTab: ["clientes", "emails", "marketing"].includes(req.query.tab)
        ? req.query.tab
        : "clientes",
      messages: {
        success: req.query.success || "",
        error: req.query.error || "",
      },
      summary: {
        total: mappedClients.length,
        complete: mappedClients.filter((client) => client.isComplete).length,
        incomplete: mappedClients.filter((client) => !client.isComplete).length,
        withSales: mappedClients.filter((client) => client.salesCount > 0).length,
        emailContacts: emailContacts.length,
        campaigns: campaigns.length,
        delivered: campaigns.reduce((sum, campaign) => sum + (campaign.deliveredCount || 0), 0),
        failed: campaigns.reduce((sum, campaign) => sum + (campaign.failedCount || 0), 0),
        opened: campaigns.reduce((sum, campaign) => sum + (campaign.openedCount || 0), 0),
      },
      currentPath: "/crm",
    });
  });

  router.get("/crm/marketing/open/:token.gif", async (req, res) => {
    try {
      const recipient = await prisma.crmEmailCampaignRecipient.findUnique({
        where: { token: req.params.token },
        select: { id: true, campaignId: true, openedAt: true },
      });

      if (recipient && !recipient.openedAt) {
        await prisma.$transaction([
          prisma.crmEmailCampaignRecipient.update({
            where: { id: recipient.id },
            data: { openedAt: new Date() },
          }),
          prisma.crmEmailCampaign.update({
            where: { id: recipient.campaignId },
            data: { openedCount: { increment: 1 } },
          }),
        ]);
      }
    } catch (err) {
      console.error("Erro ao registrar abertura de e-mail:", err);
    }

    res.setHeader("Content-Type", "image/gif");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.end(OPEN_PIXEL);
  });

  router.get("/crm/marketing/descadastrar/:token", async (req, res) => {
    try {
      await prisma.crmEmailContact.deleteMany({
        where: { unsubscribeToken: req.params.token },
      });
      res
        .status(200)
        .send("<!doctype html><html><head><meta charset=\"utf-8\"><title>Descadastro realizado</title></head><body style=\"font-family:Arial,sans-serif;padding:32px;color:#1f2933;\"><h1>Descadastro realizado</h1><p>Seu e-mail foi removido da lista de e-mail marketing.</p></body></html>");
    } catch (err) {
      console.error("Erro ao descadastrar e-mail marketing:", err);
      res.status(500).send("Erro ao remover e-mail da lista.");
    }
  });

  router.post("/crm/emails", requireAuth, requirePermission("admin.crm"), async (req, res) => {
    const emails = extractEmails(req.body.emails || req.body.email);
    const name = cleanText(req.body.name) || null;

    if (!emails.length) {
      return res.redirect("/crm?tab=emails&error=Informe pelo menos um e-mail válido.");
    }

    let created = 0;
    for (const email of emails) {
      try {
        await prisma.crmEmailContact.create({
          data: {
            ownerId: req.session.userId,
            email,
            name: emails.length === 1 ? name : null,
            source: emails.length === 1 ? "manual" : "importacao",
            unsubscribeToken: generateToken(),
          },
        });
        created += 1;
      } catch (err) {
        if (err.code !== "P2002") {
          throw err;
        }
      }
    }

    const skipped = emails.length - created;
    const message = `${created} e-mail(s) cadastrado(s)${skipped ? `, ${skipped} duplicado(s) ignorado(s)` : ""}.`;
    res.redirect(`/crm?tab=emails&success=${encodeURIComponent(message)}`);
  });

  router.post("/crm/emails/:id/excluir", requireAuth, requirePermission("admin.crm"), async (req, res) => {
    await prisma.crmEmailContact.deleteMany({
      where: {
        id: Number(req.params.id),
        ...marketingScope(req),
      },
    });
    res.redirect("/crm?tab=emails&success=E-mail removido.");
  });

  router.post(
    "/crm/marketing/enviar",
    requireAuth,
    requirePermission("admin.crm"),
    upload.fields([
      { name: "marketingImage", maxCount: 1 },
      { name: "marketingAttachments", maxCount: 5 },
    ]),
    async (req, res) => {
      try {
        const message = await buildMarketingMessage(req);
        const contacts = await getMarketingRecipients(req);

        if (!contacts.length) {
          return res.redirect("/crm?tab=marketing&error=Informe ao menos um destinatário válido.");
        }

        const campaign = await prisma.crmEmailCampaign.create({
          data: {
            ownerId: req.session.userId,
            subject: message.subject,
            bodyText: message.bodyText,
            imagePath: message.imagePath,
            attachmentPathsJson: JSON.stringify(message.attachmentPaths),
            ctaJson: JSON.stringify(message.buttons),
            styleJson: JSON.stringify(message.template),
            recipients: contacts.length,
          },
        });
        let sent = 0;
        let failed = 0;

        for (const contact of contacts) {
          let unsubscribeToken = contact.unsubscribeToken;
          if (!unsubscribeToken && contact.id) {
            unsubscribeToken = generateToken();
            await prisma.crmEmailContact.update({
              where: { id: contact.id },
              data: { unsubscribeToken },
            });
          }
          const token = crypto.randomBytes(24).toString("hex");
          const recipient = await prisma.crmEmailCampaignRecipient.create({
            data: {
              campaignId: campaign.id,
              email: contact.email,
              token,
            },
          });

          try {
            const trackingPixelUrl = buildAbsoluteUrl(req, `/crm/marketing/open/${token}.gif`);
            const unsubscribeUrl = unsubscribeToken
              ? buildAbsoluteUrl(req, `/crm/marketing/descadastrar/${unsubscribeToken}`)
              : "";
            const html = buildMarketingHtml({
              subject: message.subject,
              bodyText: message.bodyText,
              imageUrl: message.imageUrl,
              template: message.template,
              buttons: message.buttons,
              trackingPixelUrl,
              unsubscribeUrl,
            });
            await sendStatusEmail({
              to: contact.email,
              subject: message.subject,
              html,
              attachments: message.attachments,
              ...(message.smtpConfig ? { smtpConfig: message.smtpConfig, from: message.smtpConfig.from } : {}),
            });
            await prisma.crmEmailCampaignRecipient.update({
              where: { id: recipient.id },
              data: { status: "DELIVERED" },
            });
            sent += 1;
          } catch (mailErr) {
            await prisma.crmEmailCampaignRecipient.update({
              where: { id: recipient.id },
              data: {
                status: "FAILED",
                error: String(mailErr.message || mailErr).slice(0, 500),
              },
            });
            if (contact.id) {
              await prisma.crmEmailContact.deleteMany({
                where: {
                  ownerId: req.session.userId,
                  email: contact.email,
                },
              });
            }
            failed += 1;
          }
        }

        await prisma.crmEmailCampaign.update({
          where: { id: campaign.id },
          data: {
            deliveredCount: sent,
            failedCount: failed,
          },
        });

        res.redirect(`/crm?tab=marketing&success=${encodeURIComponent(`Campanha processada: ${sent} entregue(s), ${failed} com erro removido(s) da lista.`)}`);
      } catch (err) {
        console.error("Erro ao enviar e-mail marketing:", err);
        res.redirect(`/crm?tab=marketing&error=${encodeURIComponent(err.message || "Erro ao enviar campanha.")}`);
      }
    }
  );

  router.post(
    "/crm/marketing/teste",
    requireAuth,
    requirePermission("admin.crm"),
    upload.fields([
      { name: "marketingImage", maxCount: 1 },
      { name: "marketingAttachments", maxCount: 5 },
    ]),
    async (req, res) => {
      try {
        const testEmails = extractEmails(req.body.testRecipients);

        if (!testEmails.length) {
          return res.redirect("/crm?tab=marketing&error=Informe ao menos um e-mail para teste.");
        }

        const message = await buildMarketingMessage(req);
        const html = buildMarketingHtml({
          subject: message.subject,
          bodyText: message.bodyText,
          imageUrl: message.imageUrl,
          template: message.template,
          buttons: message.buttons,
          unsubscribeUrl: "#",
        });

        let sent = 0;
        for (const email of testEmails) {
          await sendStatusEmail({
            to: email,
            subject: `[TESTE] ${message.subject}`,
            html,
            attachments: message.attachments,
            ...(message.smtpConfig ? { smtpConfig: message.smtpConfig, from: message.smtpConfig.from } : {}),
          });
          sent += 1;
        }

        res.redirect(`/crm?tab=marketing&success=${encodeURIComponent(`Teste enviado para ${sent} e-mail(s).`)}`);
      } catch (err) {
        console.error("Erro ao enviar teste de e-mail marketing:", err);
        res.redirect(`/crm?tab=marketing&error=${encodeURIComponent(err.message || "Erro ao enviar teste.")}`);
      }
    }
  );

  router.post("/crm/marketing/template", requireAuth, requirePermission("admin.crm"), async (req, res) => {
    try {
      await prisma.userSettings.upsert({
        where: { userId: req.session.userId },
        create: {
          userId: req.session.userId,
          marketingFontFamily: normalizeFont(req.body.fontFamily),
          marketingBackgroundColor: normalizeColor(req.body.backgroundColor, DEFAULT_TEMPLATE.backgroundColor),
          marketingCardColor: normalizeColor(req.body.cardColor, DEFAULT_TEMPLATE.cardColor),
          marketingTextColor: normalizeColor(req.body.textColor, DEFAULT_TEMPLATE.textColor),
          marketingAccentColor: normalizeColor(req.body.accentColor, DEFAULT_TEMPLATE.accentColor),
          marketingWebsiteUrl: normalizeUrl(req.body.websiteUrl) || null,
          marketingInstagramUrl: normalizeUrl(req.body.instagramUrl) || null,
          marketingWhatsappUrl: normalizeUrl(req.body.whatsappUrl) || null,
          marketingFooterText: cleanText(req.body.footerText) || DEFAULT_TEMPLATE.footerText,
        },
        update: {
          marketingFontFamily: normalizeFont(req.body.fontFamily),
          marketingBackgroundColor: normalizeColor(req.body.backgroundColor, DEFAULT_TEMPLATE.backgroundColor),
          marketingCardColor: normalizeColor(req.body.cardColor, DEFAULT_TEMPLATE.cardColor),
          marketingTextColor: normalizeColor(req.body.textColor, DEFAULT_TEMPLATE.textColor),
          marketingAccentColor: normalizeColor(req.body.accentColor, DEFAULT_TEMPLATE.accentColor),
          marketingWebsiteUrl: normalizeUrl(req.body.websiteUrl) || null,
          marketingInstagramUrl: normalizeUrl(req.body.instagramUrl) || null,
          marketingWhatsappUrl: normalizeUrl(req.body.whatsappUrl) || null,
          marketingFooterText: cleanText(req.body.footerText) || DEFAULT_TEMPLATE.footerText,
        },
      });

      res.redirect("/crm?tab=marketing&success=Layout do e-mail salvo.");
    } catch (err) {
      res.redirect(`/crm?tab=marketing&error=${encodeURIComponent(err.message || "Erro ao salvar layout.")}`);
    }
  });

  router.post(
    "/crm/marketing/drafts",
    requireAuth,
    requirePermission("admin.crm"),
    upload.fields([
      { name: "marketingImage", maxCount: 1 },
      { name: "marketingAttachments", maxCount: 5 },
    ]),
    async (req, res) => {
      try {
      const title = cleanText(req.body.draftTitle);
      const subject = cleanText(req.body.subject);
      const bodyText = cleanText(req.body.bodyText);
      const settings = await prisma.userSettings.findUnique({
        where: { userId: req.session.userId },
      });
      const template = shapeMarketingTemplate(settings);
      const buttons = buildCampaignButtons(req.body, template);
      const draftId = req.body.draftId ? Number(req.body.draftId) : null;

      if (!title || !subject || !bodyText) {
        return res.redirect("/crm?tab=marketing&error=Informe nome do modelo, assunto e texto para salvar.");
      }

      if (draftId) {
        const result = await prisma.crmEmailDraft.updateMany({
          where: { id: draftId, ownerId: req.session.userId },
          data: {
            title,
            subject,
            bodyText,
            ctaJson: JSON.stringify(buttons),
            styleJson: JSON.stringify(template),
          },
        });

        if (!result.count) {
          return res.redirect("/crm?tab=marketing&error=Modelo não encontrado.");
        }

        return res.redirect(`/crm?tab=marketing&draftId=${draftId}&success=Modelo atualizado.`);
      }

      const draft = await prisma.crmEmailDraft.create({
        data: {
          ownerId: req.session.userId,
          title,
          subject,
          bodyText,
          ctaJson: JSON.stringify(buttons),
          styleJson: JSON.stringify(template),
        },
      });

      res.redirect(`/crm?tab=marketing&draftId=${draft.id}&success=E-mail salvo para reutilização.`);
    } catch (err) {
        res.redirect(`/crm?tab=marketing&error=${encodeURIComponent(err.message || "Erro ao salvar modelo.")}`);
      }
    }
  );

  router.post("/crm/marketing/drafts/:id/excluir", requireAuth, requirePermission("admin.crm"), async (req, res) => {
    await prisma.crmEmailDraft.deleteMany({
      where: {
        id: Number(req.params.id),
        ownerId: req.session.userId,
      },
    });
    res.redirect("/crm?tab=marketing&success=Modelo removido.");
  });

  router.post("/crm/marketing/smtp", requireAuth, requirePermission("admin.crm"), async (req, res) => {
    try {
      const fromName = cleanText(req.body.fromName) || null;
      const fromEmail = normalizeEmail(req.body.fromEmail) || null;
      const host = cleanText(req.body.smtpHost) || null;
      const port = Number(req.body.smtpPort || 0) || null;
      const user = cleanText(req.body.smtpUser) || null;
      const password = cleanText(req.body.smtpPassword);
      const clearPassword = req.body.clearSmtpPassword === "on";

      if (fromEmail && !isValidEmail(fromEmail)) {
        throw new Error("Informe um e-mail remetente válido.");
      }

      if (port && (port < 1 || port > 65535)) {
        throw new Error("Informe uma porta SMTP válida.");
      }

      const existing = await prisma.userSettings.findUnique({
        where: { userId: req.session.userId },
        select: { marketingSmtpPassEncrypted: true },
      });

      await prisma.userSettings.upsert({
        where: { userId: req.session.userId },
        create: {
          userId: req.session.userId,
          marketingFromName: fromName,
          marketingFromEmail: fromEmail,
          marketingSmtpHost: host,
          marketingSmtpPort: port,
          marketingSmtpSecure: req.body.smtpSecure === "on",
          marketingSmtpUser: user,
          marketingSmtpPassEncrypted: clearPassword ? null : encryptSecret(password),
        },
        update: {
          marketingFromName: fromName,
          marketingFromEmail: fromEmail,
          marketingSmtpHost: host,
          marketingSmtpPort: port,
          marketingSmtpSecure: req.body.smtpSecure === "on",
          marketingSmtpUser: user,
          marketingSmtpPassEncrypted: clearPassword
            ? null
            : password
              ? encryptSecret(password)
              : existing?.marketingSmtpPassEncrypted || null,
        },
      });

      res.redirect("/crm?tab=marketing&success=Configuração de e-mail salva.");
    } catch (err) {
      res.redirect(`/crm?tab=marketing&error=${encodeURIComponent(err.message || "Erro ao salvar SMTP.")}`);
    }
  });

  router.post("/crm/marketing/smtp/testar", requireAuth, requirePermission("admin.crm"), async (req, res) => {
    try {
      const settings = await prisma.userSettings.findUnique({
        where: { userId: req.session.userId },
      });
      const smtpConfig = buildUserSmtpConfig(settings);

      if (!smtpConfig) {
        throw new Error("Configure completamente o SMTP antes de testar.");
      }

      await sendStatusEmail({
        to: settings.marketingFromEmail,
        subject: "Teste de envio - CaTechSystem",
        html: "<p>Este é um teste de envio do e-mail marketing do CaTechSystem.</p>",
        smtpConfig,
        from: smtpConfig.from,
      });

      res.redirect("/crm?tab=marketing&success=E-mail de teste enviado para o remetente configurado.");
    } catch (err) {
      res.redirect(`/crm?tab=marketing&error=${encodeURIComponent(err.message || "Erro ao testar SMTP.")}`);
    }
  });

  router.get("/crm/clientes/novo", requireAuth, requirePermission("admin.crm"), (req, res) => {
    res.render("revenues/client-form", {
      title: "Novo Cliente",
      formAction: "/crm/clientes/novo",
      backPath: "/crm",
      client: null,
      deleteAction: null,
      error: null,
      currentPath: "/crm",
    });
  });

  router.post("/crm/clientes/novo", requireAuth, requirePermission("admin.crm"), async (req, res) => {
    try {
      await ensureUniqueDocument(req, req.body.document);
      await prisma.revenueClient.create({
        data: {
          ownerId: req.session?.userId || null,
          ...clientData(req),
        },
      });
      res.redirect("/crm");
    } catch (err) {
      res.status(400).render("revenues/client-form", {
        title: "Novo Cliente",
        formAction: "/crm/clientes/novo",
        backPath: "/crm",
        client: req.body,
        deleteAction: null,
        error: err.message || "Erro ao salvar cliente.",
        currentPath: "/crm",
      });
    }
  });

  router.get("/crm/clientes/:id", requireAuth, requirePermission("admin.crm"), async (req, res) => {
    const client = await prisma.revenueClient.findFirst({
      where: {
        id: Number(req.params.id),
        ...clientScope(req),
      },
    });

    if (!client) return res.status(404).send("Cliente não encontrado.");

    res.render("revenues/client-form", {
      title: "Editar Cliente",
      formAction: `/crm/clientes/${client.id}`,
      backPath: "/crm",
      client: {
        ...client,
        createdAtLabel: formatDateLabel(client.createdAt),
      },
      deleteAction: `/crm/clientes/${client.id}/excluir`,
      error: null,
      currentPath: "/crm",
    });
  });

  router.post("/crm/clientes/:id", requireAuth, requirePermission("admin.crm"), async (req, res) => {
    const client = await prisma.revenueClient.findFirst({
      where: {
        id: Number(req.params.id),
        ...clientScope(req),
      },
    });

    if (!client) return res.status(404).send("Cliente não encontrado.");

    try {
      await ensureUniqueDocument(req, req.body.document, client.id);
      await prisma.revenueClient.update({
        where: { id: client.id },
        data: clientData(req),
      });
      res.redirect("/crm");
    } catch (err) {
      res.status(400).render("revenues/client-form", {
        title: "Editar Cliente",
        formAction: `/crm/clientes/${client.id}`,
        backPath: "/crm",
        client: {
          ...client,
          ...req.body,
          createdAtLabel: formatDateLabel(client.createdAt),
        },
        deleteAction: `/crm/clientes/${client.id}/excluir`,
        error: err.message || "Erro ao salvar cliente.",
        currentPath: "/crm",
      });
    }
  });

  router.post("/crm/clientes/:id/excluir", requireAuth, requirePermission("admin.crm"), async (req, res) => {
    const client = await prisma.revenueClient.findFirst({
      where: {
        id: Number(req.params.id),
        ...clientScope(req),
      },
    });

    if (!client) return res.status(404).send("Cliente não encontrado.");

    await prisma.revenueClient.update({
      where: { id: client.id },
      data: { deletedAt: new Date() },
    });

    res.redirect("/crm");
  });

  return router;
};
