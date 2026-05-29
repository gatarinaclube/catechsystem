const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { Prisma } = require("@prisma/client");
const { sendStatusEmail } = require("../utils/mailer");

const EVENT_KEY = "gatarina-show-2026";
const PUBLIC_PATH = "/fotosgatarina2026";

function uploadsDir() {
  const root = process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");
  return path.join(root, "gatarina-show-2026");
}

function ensureUploadsDir() {
  const dir = uploadsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createUpload() {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, ensureUploadsDir()),
      filename: (req, file, cb) => {
        const base = path.basename(file.originalname || "foto.jpg", path.extname(file.originalname || ""));
        const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
        const safeBase = base
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9_-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 48) || "foto";
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeBase}${ext}`);
      },
    }),
    limits: { fileSize: 6 * 1024 * 1024, files: 120 },
    fileFilter: (req, file, cb) => {
      const allowed = ["image/jpeg", "image/png", "image/webp"];
      cb(allowed.includes(file.mimetype) ? null : new Error("Envie imagens em JPG, PNG ou WEBP."), allowed.includes(file.mimetype));
    },
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMoney(cents) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(cents || 0) / 100);
}

function photoUnitPriceCents(quantity) {
  if (quantity <= 0) return 0;
  if (quantity === 1) return 5000;
  if (quantity <= 3) return 3500;
  if (quantity <= 5) return 3000;
  return 2000;
}

function photoTotalCents(quantity) {
  if (quantity <= 0) return 0;
  if (quantity === 1) return 5000;
  if (quantity <= 3) return quantity * 3500;
  if (quantity <= 5) return quantity * 3000;
  return 15000 + ((quantity - 5) * 2000);
}

function photoPriceTable() {
  return [
    { label: "1 foto", value: formatMoney(5000) },
    { label: "2-3 fotos", value: `${formatMoney(3500)} cada` },
    { label: "4-5 fotos", value: `${formatMoney(3000)} cada` },
    { label: "A partir da 6ª foto", value: `${formatMoney(2000)} por foto extra` },
  ];
}

function splitEmails(value) {
  return String(value || "")
    .split(/[;,]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

async function getAdminRecipients(prisma) {
  const configured = splitEmails(process.env.ADMIN_NOTIFICATION_EMAILS || process.env.ADMIN_EMAIL);
  if (configured.length) return configured;

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { email: true },
  });
  return admins.map((admin) => admin.email).filter(Boolean);
}

async function getConfig(prisma) {
  const rows = await prisma.$queryRaw`
    SELECT "eventKey", "title", "priceCents", "published", "contactEmail", "watermarkLogoPath"
    FROM "GatarinaPhotoGalleryConfig"
    WHERE "eventKey" = ${EVENT_KEY}
    LIMIT 1
  `;

  return rows[0] || {
    eventKey: EVENT_KEY,
    title: "Gatarina Show 2026",
    priceCents: 3000,
    published: true,
    contactEmail: "",
    watermarkLogoPath: "",
  };
}

async function saveConfig(prisma, body) {
  const title = String(body.title || "Gatarina Show 2026").trim();
  const published = body.published === "on";
  const contactEmail = String(body.contactEmail || "").trim();

  await prisma.$executeRaw`
    INSERT INTO "GatarinaPhotoGalleryConfig" ("eventKey", "title", "priceCents", "published", "contactEmail", "updatedAt")
    VALUES (${EVENT_KEY}, ${title}, 3000, ${published}, ${contactEmail || null}, CURRENT_TIMESTAMP)
    ON CONFLICT ("eventKey") DO UPDATE SET
      "title" = EXCLUDED."title",
      "published" = EXCLUDED."published",
      "contactEmail" = EXCLUDED."contactEmail",
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}

async function saveWatermarkLogo(prisma, logoPath) {
  await prisma.$executeRaw`
    INSERT INTO "GatarinaPhotoGalleryConfig" ("eventKey", "title", "priceCents", "published", "watermarkLogoPath", "updatedAt")
    VALUES (${EVENT_KEY}, 'Gatarina Show 2026', 3000, true, ${logoPath}, CURRENT_TIMESTAMP)
    ON CONFLICT ("eventKey") DO UPDATE SET
      "watermarkLogoPath" = EXCLUDED."watermarkLogoPath",
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}

async function listPhotos(prisma) {
  return prisma.$queryRaw`
    SELECT "id", "code", "filePath", "originalName", "sortOrder", "active", "createdAt"
    FROM "GatarinaPhoto"
    WHERE "eventKey" = ${EVENT_KEY}
    ORDER BY "sortOrder" ASC, "id" ASC
  `;
}

async function listPublicPhotos(prisma) {
  return prisma.$queryRaw`
    SELECT "id", "code", "filePath"
    FROM "GatarinaPhoto"
    WHERE "eventKey" = ${EVENT_KEY}
      AND "active" = true
    ORDER BY "sortOrder" ASC, "id" ASC
  `;
}

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();
  const upload = createUpload();

  router.get(PUBLIC_PATH, async (req, res, next) => {
    try {
      const config = await getConfig(prisma);
      if (!config.published) return res.status(404).send("Galeria indisponível.");

      res.render("gatarina-show/public", {
        config: {
          ...config,
          priceTable: photoPriceTable(),
        },
        photos: await listPublicPhotos(prisma),
        success: req.query.ok === "1",
        error: null,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post(`${PUBLIC_PATH}/solicitar`, async (req, res, next) => {
    try {
      const config = await getConfig(prisma);
      const selectedIds = Array.isArray(req.body.photoIds)
        ? req.body.photoIds
        : [req.body.photoIds].filter(Boolean);
      const ids = selectedIds.map((id) => Number(id)).filter(Number.isInteger);

      if (!ids.length) {
        return res.status(400).render("gatarina-show/public", {
          config: { ...config, priceTable: photoPriceTable() },
          photos: await listPublicPhotos(prisma),
          success: false,
          error: "Selecione pelo menos uma foto.",
        });
      }

      const name = String(req.body.name || "").trim();
      const email = String(req.body.email || "").trim().toLowerCase();
      const phone = String(req.body.phone || "").trim();
      const note = String(req.body.note || "").trim();

      if (!name || !email) {
        return res.status(400).render("gatarina-show/public", {
          config: { ...config, priceTable: photoPriceTable() },
          photos: await listPublicPhotos(prisma),
          success: false,
          error: "Informe nome e e-mail.",
        });
      }

      const photos = await prisma.$queryRaw`
        SELECT "id", "code", "filePath"
        FROM "GatarinaPhoto"
        WHERE "eventKey" = ${EVENT_KEY}
          AND "active" = true
          AND "id" IN (${Prisma.join(ids)})
        ORDER BY "sortOrder" ASC, "id" ASC
      `;

      if (!photos.length) {
        return res.status(400).render("gatarina-show/public", {
          config: { ...config, priceTable: photoPriceTable() },
          photos: await listPublicPhotos(prisma),
          success: false,
          error: "As fotos selecionadas não estão disponíveis.",
        });
      }

      const selectedJson = JSON.stringify(photos.map((photo) => ({
        id: Number(photo.id),
        code: photo.code,
        filePath: photo.filePath,
      })));
      const unitPriceCents = photoUnitPriceCents(photos.length);
      const totalCents = photoTotalCents(photos.length);

      await prisma.$executeRaw`
        INSERT INTO "GatarinaPhotoRequest" (
          "eventKey", "customerName", "customerEmail", "customerPhone", "note",
          "selectedPhotosJson", "quantity", "unitPriceCents", "totalCents", "updatedAt"
        )
        VALUES (
          ${EVENT_KEY}, ${name}, ${email}, ${phone || null}, ${note || null},
          ${selectedJson}, ${photos.length}, ${unitPriceCents}, ${totalCents}, CURRENT_TIMESTAMP
        )
      `;

      const to = splitEmails(config.contactEmail);
      const recipients = to.length ? to : await getAdminRecipients(prisma);
      try {
        if (recipients.length) {
          const photoList = photos.map((photo) => `<li>${escapeHtml(photo.code)}</li>`).join("");
          await sendStatusEmail({
            to: recipients.join(","),
            subject: "Pedido de fotos em alta qualidade - Gatarina Show 2026",
            html: `
              <p><strong>Cliente:</strong> ${escapeHtml(name)}</p>
              <p><strong>E-mail:</strong> ${escapeHtml(email)}</p>
              <p><strong>Telefone:</strong> ${escapeHtml(phone || "-")}</p>
              <p><strong>Quantidade:</strong> ${photos.length}</p>
              <p><strong>Valor unitário:</strong> ${formatMoney(unitPriceCents)}</p>
              <p><strong>Total estimado:</strong> ${formatMoney(totalCents)}</p>
              ${note ? `<p><strong>Observação:</strong> ${escapeHtml(note)}</p>` : ""}
              <p><strong>Fotos solicitadas:</strong></p>
              <ul>${photoList}</ul>
            `,
          });
        }
      } catch (mailErr) {
        console.error("Erro ao enviar e-mail do pedido de fotos:", mailErr);
      }

      res.redirect(`${PUBLIC_PATH}?ok=1`);
    } catch (err) {
      next(err);
    }
  });

  router.get("/admin/fotos-gatarina-2026", requireAuth, requirePermission("admin.gatarinaPhotos"), async (req, res, next) => {
    try {
      const config = await getConfig(prisma);
      const photos = await listPhotos(prisma);
      const requests = await prisma.$queryRaw`
        SELECT "id", "customerName", "customerEmail", "customerPhone", "quantity", "totalCents", "status", "createdAt"
        FROM "GatarinaPhotoRequest"
        WHERE "eventKey" = ${EVENT_KEY}
        ORDER BY "createdAt" DESC
        LIMIT 30
      `;

      res.render("gatarina-show/admin", {
        user: req.user,
        currentPath: "/admin/fotos-gatarina-2026",
        config: {
          ...config,
          priceTable: photoPriceTable(),
        },
        photos,
        requests,
        publicPath: PUBLIC_PATH,
        success: req.query.ok || null,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/fotos-gatarina-2026/config", requireAuth, requirePermission("admin.gatarinaPhotos"), async (req, res, next) => {
    try {
      await saveConfig(prisma, req.body);
      res.redirect("/admin/fotos-gatarina-2026?ok=config");
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/admin/fotos-gatarina-2026/logo",
    requireAuth,
    requirePermission("admin.gatarinaPhotos"),
    (req, res, next) => {
      upload.single("watermarkLogo")(req, res, (err) => {
        if (err) return next(err);
        return next();
      });
    },
    async (req, res, next) => {
      try {
        if (!req.file) return res.redirect("/admin/fotos-gatarina-2026");
        await saveWatermarkLogo(prisma, `/uploads/gatarina-show-2026/${req.file.filename}`);
        res.redirect("/admin/fotos-gatarina-2026?ok=logo");
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/admin/fotos-gatarina-2026/upload",
    requireAuth,
    requirePermission("admin.gatarinaPhotos"),
    (req, res, next) => {
      upload.array("photos", 120)(req, res, (err) => {
        if (err) return next(err);
        return next();
      });
    },
    async (req, res, next) => {
      try {
        const currentMaxRows = await prisma.$queryRaw`
          SELECT COALESCE(MAX("sortOrder"), 0)::integer AS "max"
          FROM "GatarinaPhoto"
          WHERE "eventKey" = ${EVENT_KEY}
        `;
        let sortOrder = Number(currentMaxRows[0]?.max || 0);

        for (const file of req.files || []) {
          sortOrder += 1;
          const code = `GS2026-${String(sortOrder).padStart(4, "0")}`;
          const filePath = `/uploads/gatarina-show-2026/${file.filename}`;
          await prisma.$executeRaw`
            INSERT INTO "GatarinaPhoto" ("eventKey", "code", "filePath", "originalName", "sizeBytes", "sortOrder", "updatedAt")
            VALUES (${EVENT_KEY}, ${code}, ${filePath}, ${file.originalname || null}, ${file.size || null}, ${sortOrder}, CURRENT_TIMESTAMP)
          `;
        }

        res.redirect("/admin/fotos-gatarina-2026?ok=upload");
      } catch (err) {
        next(err);
      }
    }
  );

  router.post("/admin/fotos-gatarina-2026/fotos/:id/toggle", requireAuth, requirePermission("admin.gatarinaPhotos"), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      await prisma.$executeRaw`
        UPDATE "GatarinaPhoto"
        SET "active" = NOT "active",
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id}
          AND "eventKey" = ${EVENT_KEY}
      `;
      res.redirect("/admin/fotos-gatarina-2026?ok=photo");
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/fotos-gatarina-2026/fotos/:id/delete", requireAuth, requirePermission("admin.gatarinaPhotos"), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const rows = await prisma.$queryRaw`
        SELECT "filePath"
        FROM "GatarinaPhoto"
        WHERE "id" = ${id}
          AND "eventKey" = ${EVENT_KEY}
        LIMIT 1
      `;
      await prisma.$executeRaw`
        DELETE FROM "GatarinaPhoto"
        WHERE "id" = ${id}
          AND "eventKey" = ${EVENT_KEY}
      `;

      const relativePath = rows[0]?.filePath?.replace(/^\/uploads\/+/, "");
      if (relativePath) {
        const absPath = path.join(process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads"), relativePath);
        fs.promises.unlink(absPath).catch(() => {});
      }

      res.redirect("/admin/fotos-gatarina-2026?ok=photo");
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/fotos-gatarina-2026/fotos/delete-selected", requireAuth, requirePermission("admin.gatarinaPhotos"), async (req, res, next) => {
    try {
      const selectedIds = Array.isArray(req.body.photoIds)
        ? req.body.photoIds
        : [req.body.photoIds].filter(Boolean);
      const ids = selectedIds.map((id) => Number(id)).filter(Number.isInteger);

      if (!ids.length) {
        return res.redirect("/admin/fotos-gatarina-2026");
      }

      const rows = await prisma.$queryRaw`
        SELECT "filePath"
        FROM "GatarinaPhoto"
        WHERE "eventKey" = ${EVENT_KEY}
          AND "id" IN (${Prisma.join(ids)})
      `;

      await prisma.$executeRaw`
        DELETE FROM "GatarinaPhoto"
        WHERE "eventKey" = ${EVENT_KEY}
          AND "id" IN (${Prisma.join(ids)})
      `;

      for (const row of rows) {
        const relativePath = row.filePath?.replace(/^\/uploads\/+/, "");
        if (relativePath) {
          const absPath = path.join(process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads"), relativePath);
          fs.promises.unlink(absPath).catch(() => {});
        }
      }

      res.redirect("/admin/fotos-gatarina-2026?ok=bulk-delete");
    } catch (err) {
      next(err);
    }
  });

  return router;
};
