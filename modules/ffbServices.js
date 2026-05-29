// modules/ffbServices.js
const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const { sendStatusEmail } = require("../utils/mailer");
const { canViewAllData } = require("../utils/access");
const { getFileUploadLimit, validateFilesForRole } = require("../utils/planLimits");

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanText(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function appUrl(route = "") {
  const baseUrl = (process.env.APP_URL || "https://catechsystem.com.br").replace(/\/$/, "");
  return `${baseUrl}${route}`;
}

function serviceStatusLabel(status) {
  return {
    ENVIADO_GATARINA: "Enviado para Gatarina",
    COM_PENDENCIA: "Com Pendência",
    ENVIADO_FFB: "Enviado para FFB",
    RECEBIDO_FFB: "Recebido pela FFB",
    ENVIADO_ASSOCIADO: "Enviado para Associado",
  }[status] || status;
}

function parseDateInput(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const normalized = value.trim().slice(-10);
  const [year, month, day] = normalized.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
}

function parseOptionalInt(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : null;
}

function normalizeKittenRows(kittens) {
  if (Array.isArray(kittens)) {
    return kittens;
  }

  if (kittens && typeof kittens === "object") {
    return Object.keys(kittens)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => kittens[key]);
  }

  return [];
}

function getLitterIdFromService(service) {
  if (service?.litterId) {
    return service.litterId;
  }

  const match = String(service?.description || "").match(/#(\d+)/);
  return match ? Number(match[1]) : null;
}

function latestStatus(service) {
  return service?.statuses?.[0] || null;
}

function isServicePendingCorrection(service) {
  return latestStatus(service)?.status === "COM_PENDENCIA";
}

const UPLOADS_ROOT =
  process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");

function ensureUploadDir(folder) {
  const dir = path.join(UPLOADS_ROOT, folder);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

const correctionStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folders = {
      externalOwnerAuthorization: "litters",
      authorizationFile: "transfer-authorization",
      transferAuthorizationFile: "pedigree-homologation",
      certificatesFiles: "title-certificates",
      attachments: "second-copy",
    };
    cb(null, ensureUploadDir(folders[file.fieldname] || "services"));
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`);
  },
});

const correctionUpload = multer({
  storage: correctionStorage,
  limits: { fileSize: getFileUploadLimit("ADMIN").bytes },
});

function uploadedPath(file, folder) {
  return file ? `/uploads/${folder}/${file.filename}` : null;
}

function parseJsonArray(value) {
  try {
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}


module.exports = (prisma, requireAuth, requireAdmin) => {
  const router = express.Router();

  function serviceScope(req) {
    return canViewAllData(req.session?.userRole) ? {} : { userId: req.session.userId };
  }

  async function ensureServiceAccess(req, serviceId) {
    const service = await prisma.serviceRequest.findFirst({
      where: { id: serviceId, ...serviceScope(req) },
      select: { id: true },
    });
    return Boolean(service);
  }

  async function notifyUserStatusChange(service, newStatus, pendingNote = "") {
    if (!service?.user?.email) return;

    try {
      const correctionRoute =
        newStatus === "COM_PENDENCIA"
          ? `/my-services/${service.id}/correct`
          : `/my-services/${service.id}`;
      const pendenciaHtml =
        newStatus === "COM_PENDENCIA"
          ? `<p style="color:#b91c1c;"><strong>Pendência:</strong> ${escapeHtml(pendingNote)}</p>`
          : "";

      await sendStatusEmail({
        to: service.user.email,
        subject: `CaTech: atualização no seu serviço #${service.id}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height:1.4;">
            <h2>Atualização do Serviço</h2>
            <p><strong>Código:</strong> ${service.id}</p>
            <p><strong>Tipo:</strong> ${escapeHtml(service.type || "-")}</p>
            <p><strong>Novo status:</strong> ${escapeHtml(serviceStatusLabel(newStatus))}</p>
            ${pendenciaHtml}
            <p><a href="${appUrl(correctionRoute)}">Abrir serviço no CaTech</a></p>
          </div>
        `,
      });
    } catch (mailErr) {
      console.error("⚠️ Erro ao enviar e-mail de status:", mailErr);
    }
  }

  async function findUserCorrectionService(req, serviceId) {
    return prisma.serviceRequest.findFirst({
      where: {
        id: serviceId,
        userId: req.session.userId,
      },
      include: {
        statuses: { orderBy: { createdAt: "desc" } },
        litter: { include: { kittens: { orderBy: { index: "asc" } } } },
        transferRequest: true,
        titleHomologation: true,
        pedigreeHomologation: true,
        catteryRegistration: true,
        secondCopyRequest: true,
      },
    });
  }

  router.get(
    "/my-services/:id/correct",
    requireAuth,
    async (req, res) => {
      try {
        const serviceId = Number(req.params.id);
        const service = await findUserCorrectionService(req, serviceId);

        if (!service) {
          return res.status(404).send("Serviço não encontrado.");
        }

        if (!isServicePendingCorrection(service)) {
          return res.redirect(`/my-services/${service.id}`);
        }

        const cats = await prisma.cat.findMany({
          where: { ownerId: req.session.userId },
          orderBy: { name: "asc" },
        });

        return res.render("services/correct-service", {
          user: req.user || req.session.user,
          currentPath: "/my-services",
          service,
          pendingStatus: latestStatus(service),
          cats,
        });
      } catch (err) {
        console.error("Erro ao abrir correção de serviço:", err);
        return res.status(500).send("Erro ao abrir correção do serviço");
      }
    }
  );

  router.post(
    "/my-services/:id/correct",
    requireAuth,
    correctionUpload.fields([
      { name: "externalOwnerAuthorization", maxCount: 1 },
      { name: "authorizationFile", maxCount: 1 },
      { name: "transferAuthorizationFile", maxCount: 1 },
      { name: "certificatesFiles", maxCount: 12 },
      { name: "attachments", maxCount: 5 },
    ]),
    async (req, res) => {
      try {
        const serviceId = Number(req.params.id);
        const service = await findUserCorrectionService(req, serviceId);

        if (!service) {
          return res.status(404).send("Serviço não encontrado.");
        }

        if (!isServicePendingCorrection(service)) {
          return res.redirect(`/my-services/${service.id}`);
        }

        const uploadedFiles = Object.values(req.files || {}).flat();
        validateFilesForRole(uploadedFiles, req.session?.userRole);

        const description = cleanText(req.body.description) || service.description;
        const serviceData = { description, status: "ENVIADO_GATARINA" };

        if (service.type === "Registro de Ninhada" && service.litter) {
          const litterBirthDate = parseDateInput(req.body.litterBirthDate);
          const litterCount = parseOptionalInt(req.body.litterCount);
          const authFile = uploadedPath(
            req.files?.externalOwnerAuthorization?.[0],
            "litters"
          );

          await prisma.litter.update({
            where: { id: service.litter.id },
            data: {
              maleName: cleanText(req.body.maleName),
              maleBreed: cleanText(req.body.maleBreed),
              maleEms: cleanText(req.body.maleEms),
              maleMicrochip: req.body.maleMicrochip
                ? String(req.body.maleMicrochip).replace(/\D/g, "").slice(0, 15)
                : null,
              maleFfbLo: cleanText(req.body.maleFfbLo),
              maleOwnership: req.body.maleOwnership === "NOT_OWNER" ? "NOT_OWNER" : "OWNER",
              externalOwnerName: cleanText(req.body.externalOwnerName),
              externalOwnerEmail: cleanText(req.body.externalOwnerEmail),
              externalOwnerCpf: cleanText(req.body.externalOwnerCpf),
              externalOwnerPhone: cleanText(req.body.externalOwnerPhone),
              externalOwnerCattery: cleanText(req.body.externalOwnerCattery),
              ...(authFile ? { externalOwnerAuthorization: authFile } : {}),
              femaleName: cleanText(req.body.femaleName),
              femaleBreed: cleanText(req.body.femaleBreed),
              femaleEms: cleanText(req.body.femaleEms),
              femaleMicrochip: req.body.femaleMicrochip
                ? String(req.body.femaleMicrochip).replace(/\D/g, "").slice(0, 15)
                : null,
              femaleFfbLo: cleanText(req.body.femaleFfbLo),
              catteryName: cleanText(req.body.catteryName),
              catteryCountry: cleanText(req.body.catteryCountry),
              litterCount,
              litterBirthDate,
              historyNotes: cleanText(req.body.historyNotes),
            },
          });

          const kittenRows = normalizeKittenRows(req.body.kittens);
          for (let i = 0; i < kittenRows.length; i++) {
            const row = kittenRows[i];
            if (!row) continue;

            await prisma.litterKitten.updateMany({
              where: { litterId: service.litter.id, index: i + 1 },
              data: {
                name: cleanText(row.name),
                breed: cleanText(row.breed),
                emsEyes: cleanText(row.emsEyes),
                sex: cleanText(row.sex),
                microchip: row.microchip
                  ? String(row.microchip).replace(/\D/g, "").slice(0, 15)
                  : null,
                breeding: cleanText(row.breeding),
              },
            });
          }
        }

        if (service.type === "Transferência de Propriedade" && service.transferRequest) {
          const authFile = uploadedPath(
            req.files?.authorizationFile?.[0],
            "transfer-authorization"
          );

          await prisma.transferRequest.update({
            where: { serviceRequestId: service.id },
            data: {
              oldOwnerName: cleanText(req.body.oldOwnerName) || service.transferRequest.oldOwnerName,
              newOwnerName: cleanText(req.body.newOwnerName) || service.transferRequest.newOwnerName,
              breedingStatus: cleanText(req.body.breedingStatus) || service.transferRequest.breedingStatus,
              memberType: cleanText(req.body.memberType),
              address: cleanText(req.body.address),
              district: cleanText(req.body.district),
              city: cleanText(req.body.city),
              state: cleanText(req.body.state),
              cep: cleanText(req.body.cep),
              email: cleanText(req.body.email),
              phone: cleanText(req.body.phone),
              ...(authFile ? { authorizationFile: authFile } : {}),
            },
          });
        }

        if (service.type === "Homologação de Títulos" && service.titleHomologation) {
          const certificates = parseJsonArray(req.body.certificatesJson || service.titleHomologation.certificatesJson);
          const certFiles = req.files?.certificatesFiles || [];

          certFiles.forEach((file, index) => {
            if (!certificates[index]) certificates[index] = {};
            certificates[index].file = uploadedPath(file, "title-certificates");
          });

          await prisma.titleHomologation.update({
            where: { serviceRequestId: service.id },
            data: {
              requestedTitle: cleanText(req.body.requestedTitle) || service.titleHomologation.requestedTitle,
              certificatesJson: JSON.stringify(certificates),
            },
          });
        }

        if (service.type === "Homologação de Pedigree" && service.pedigreeHomologation) {
          await prisma.pedigreeHomologation.update({
            where: { serviceRequestId: service.id },
            data: {
              homologationType:
                cleanText(req.body.homologationType) ||
                service.pedigreeHomologation.homologationType,
            },
          });
        }

        if (service.type === "Registro de Gatil" && service.catteryRegistration) {
          await prisma.catteryRegistration.update({
            where: { serviceRequestId: service.id },
            data: {
              nameOption1: cleanText(req.body.nameOption1) || service.catteryRegistration.nameOption1,
              nameOption2: cleanText(req.body.nameOption2),
              nameOption3: cleanText(req.body.nameOption3),
              numberOfCats:
                parseOptionalInt(req.body.numberOfCats) ||
                service.catteryRegistration.numberOfCats,
              breedsJson: JSON.stringify(
                Array.isArray(req.body.breeds)
                  ? req.body.breeds.filter(Boolean)
                  : String(req.body.breeds || "")
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean)
              ),
            },
          });
        }

        if (service.type === "Segunda Via e Alterações" && service.secondCopyRequest) {
          const existingAttachments = parseJsonArray(service.secondCopyRequest.attachmentsJson);
          const newAttachments = (req.files?.attachments || []).map((file) =>
            uploadedPath(file, "second-copy")
          );

          await prisma.secondCopyRequest.update({
            where: { serviceRequestId: service.id },
            data: {
              requestType: cleanText(req.body.requestType) || service.secondCopyRequest.requestType,
              details: cleanText(req.body.details),
              newValue: cleanText(req.body.newValue),
              attachmentsJson: JSON.stringify([...existingAttachments, ...newAttachments]),
            },
          });
        }

        await prisma.serviceRequest.update({
          where: { id: service.id },
          data: serviceData,
        });

        await prisma.serviceStatus.create({
          data: {
            serviceId: service.id,
            status: "ENVIADO_GATARINA",
            pendingNote: "Correção enviada pelo usuário.",
          },
        });

        return res.redirect(`/my-services/${service.id}`);
      } catch (err) {
        console.error("Erro ao salvar correção de serviço:", err);
        return res
          .status(err.code === "UPLOAD_LIMIT" ? 400 : 500)
          .send(err.code === "UPLOAD_LIMIT" ? err.message : "Erro ao salvar correção do serviço");
      }
    }
  );

  // ============================================================
  // EDITAR serviço FFB (somente ADMIN) - GET
  // ============================================================
router.get(
  "/ffb-services/:id/edit",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {

      const serviceId = parseInt(req.params.id, 10);

      if (!(await ensureServiceAccess(req, serviceId))) {
        return res.status(403).send("Você não tem acesso a este serviço.");
      }

      const service = await prisma.serviceRequest.findUnique({
  where: { id: serviceId },
  include: {
    user: true,
    transferRequest: true,
    statuses: { orderBy: { createdAt: "desc" } },
  },
});


      if (!service) {
        return res.status(404).send("Serviço não encontrado.");
      }
      

      // ============================================================
      // CASO 1: SERVIÇO DE TRANSFERÊNCIA
      // ============================================================
      if (service.type === "Transferência de Propriedade") {

  const transfer = service.transferRequest;

  const cat = transfer
    ? await prisma.cat.findUnique({
        where: { id: transfer.catId },
      })
    : null;

  return res.render("ffb-services/edit-transfer", {
    user: req.session.user,
    service,
    transfer,
    cat,                 // 🔹 DADOS DO GATO
    currentPath: "/ffb-services",
  });
}

      // ============================================================
      // CASO 2: MAPA DE NINHADA (LÓGICA EXISTENTE)
      // ============================================================

      let litter = null;
      let kittens = [];
      let sire = null;
      let dam = null;

      const litterId = getLitterIdFromService(service);

      if (litterId) {
          litter = await prisma.litter.findUnique({
            where: { id: litterId },
            include: {
              kittens: { orderBy: { index: "asc" } },
            },
          });

          if (litter) {
            kittens = litter.kittens || [];

            if (litter.maleMicrochip) {
              sire = await prisma.cat.findFirst({
                where: { microchip: litter.maleMicrochip },
              });
            }

            if (litter.femaleMicrochip) {
              dam = await prisma.cat.findFirst({
                where: { microchip: litter.femaleMicrochip },
              });
            }
          }
      }

      res.render("ffb-services/edit", {
        user: req.session.user,
        service,
        litter,
        kittens,
        sire,
        dam,
        currentPath: "/ffb-services",
      });
    } catch (err) {
      console.error("Erro ao carregar edição do serviço FFB:", err);
      res.status(500).send("Erro ao carregar edição do serviço FFB");
    }
  }
);



// ============================================================
// ALTERAR STATUS DO SERVIÇO FFB (POST)
// ============================================================
router.post(
  "/ffb-services/:id/edit",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!(await ensureServiceAccess(req, id))) {
        return res.status(403).send("Você não pode editar este serviço.");
      }

      const service = await prisma.serviceRequest.findUnique({
        where: { id },
        include: { transferRequest: true, user: true },
      });

      if (!service) {
        return res.status(404).send("Serviço não encontrado.");
      }

      const pendingNote = cleanText(req.body.pendingNote);

      if (req.body.status === "COM_PENDENCIA" && !pendingNote) {
        return res.status(400).send("Informe o que está pendente.");
      }

// ===============================
// BUSCAR NINHADA PELO ID
// ===============================
let litter = null;
const litterId = getLitterIdFromService(service);

if (litterId) {
    litter = await prisma.litter.findUnique({
      where: { id: litterId },
    });
}


      // =====================================
      // TRANSFERÊNCIA DE PROPRIEDADE
      // =====================================
      if (service.type === "Transferência de Propriedade") {
        await prisma.serviceRequest.update({
          where: { id },
          data: {
            description: req.body.description,
            status: req.body.status,
          },
        });

        if (req.body.status) {
          await prisma.serviceStatus.create({
            data: {
              serviceId: id,
              status: req.body.status,
              pendingNote: req.body.status === "COM_PENDENCIA" ? pendingNote : null,
            },
          });

          await notifyUserStatusChange(service, req.body.status, pendingNote);
        }

        return res.redirect("/ffb-services");
      }

      // =====================================
      // MAPA DE NINHADA - DADOS GERAIS
      // =====================================
      const litterBirthDate = parseDateInput(req.body.litterBirthDate);
      const litterCount = parseOptionalInt(req.body.litterCount);

      if (litter) {
        if (!cleanText(req.body.catteryName)) {
          return res.status(400).send("Informe o nome do gatil.");
        }

        if (!litterBirthDate) {
          return res.status(400).send("Informe a data de nascimento da ninhada.");
        }

        if (!Number.isInteger(litterCount) || litterCount < 1 || litterCount > 9) {
          return res.status(400).send("Informe um número de filhotes entre 1 e 9.");
        }

        await prisma.litter.update({
          where: { id: litter.id },
          data: {
            maleName: cleanText(req.body.maleName),
            maleBreed: cleanText(req.body.maleBreed),
            maleEms: cleanText(req.body.maleEms),
            maleMicrochip: req.body.maleMicrochip
              ? String(req.body.maleMicrochip).replace(/\D/g, "").slice(0, 15)
              : null,
            maleFfbLo: cleanText(req.body.maleFfbLo),
            maleOwnership: req.body.maleOwnership === "NOT_OWNER" ? "NOT_OWNER" : "OWNER",
            externalOwnerName: cleanText(req.body.externalOwnerName),
            externalOwnerEmail: cleanText(req.body.externalOwnerEmail),
            externalOwnerCpf: cleanText(req.body.externalOwnerCpf),
            externalOwnerPhone: cleanText(req.body.externalOwnerPhone),
            externalOwnerCattery: cleanText(req.body.externalOwnerCattery),
            femaleName: cleanText(req.body.femaleName),
            femaleBreed: cleanText(req.body.femaleBreed),
            femaleEms: cleanText(req.body.femaleEms),
            femaleMicrochip: req.body.femaleMicrochip
              ? String(req.body.femaleMicrochip).replace(/\D/g, "").slice(0, 15)
              : null,
            femaleFfbLo: cleanText(req.body.femaleFfbLo),
            catteryCountry: cleanText(req.body.litterCountry),
            catteryName: cleanText(req.body.catteryName),
            litterCount,
            litterBirthDate,
            historyNotes: cleanText(req.body.kittensGeneralObs),
          },
        });

        const linkedKittens = await prisma.litterKitten.findMany({
          where: {
            litterId: litter.id,
            kittenCatId: { not: null },
          },
          select: { kittenCatId: true },
        });
        const linkedCatIds = linkedKittens
          .map((kitten) => kitten.kittenCatId)
          .filter(Boolean);

        if (linkedCatIds.length) {
          await prisma.cat.updateMany({
            where: { id: { in: linkedCatIds } },
            data: { birthDate: litterBirthDate },
          });
        }
      }

      // =====================================
// ATUALIZAR FILHOTES (EMS, RAÇA, ETC)
// =====================================
const kittenRows = normalizeKittenRows(req.body.kittens);

if (litter && kittenRows.length) {
  for (let i = 0; i < kittenRows.length; i++) {
    const k = kittenRows[i];
    if (!k) continue;

    if (!cleanText(k.breed)) {
      return res.status(400).send(`Informe a raça do filhote ${i + 1}.`);
    }

    if (!cleanText(k.emsEyes)) {
      return res.status(400).send(`Informe a cor/EMS do filhote ${i + 1}.`);
    }

    if (!cleanText(k.sex)) {
      return res.status(400).send(`Informe o sexo do filhote ${i + 1}.`);
    }

    const microchip = k.microchip
      ? String(k.microchip).replace(/\D/g, "").slice(0, 15)
      : null;

    const updatedKitten = await prisma.litterKitten.updateMany({
      where: {
        litterId: litter.id,
        index: i + 1, // ⚠️ índice no banco começa em 1
      },
      data: {
        name: cleanText(k.name),
        breed: cleanText(k.breed),
        emsEyes: cleanText(k.emsEyes),
        sex: cleanText(k.sex),
        microchip,
        breeding: k.breeding || null,
      },
    });

    if (updatedKitten.count > 0) {
      const litterKitten = await prisma.litterKitten.findFirst({
        where: { litterId: litter.id, index: i + 1 },
        select: { kittenCatId: true },
      });

      if (litterKitten?.kittenCatId) {
        const catData = {
          birthDate: litterBirthDate,
          gender: cleanText(k.sex),
          breed: cleanText(k.breed),
          emsCode: cleanText(k.emsEyes),
          microchip,
        };

        if (cleanText(k.name)) {
          catData.name = cleanText(k.name);
        }

        await prisma.cat.update({
          where: { id: litterKitten.kittenCatId },
          data: catData,
        });
      }
    }
  }
}

      // =====================================
      // MAPA DE NINHADA (mantém lógica antiga)
      // =====================================
      await prisma.serviceRequest.update({
        where: { id },
        data: {
          description: req.body.description,
          status: req.body.status,
          ...(litter ? { litterId: litter.id } : {}),
        },
      });

      if (req.body.status) {
        await prisma.serviceStatus.create({
          data: {
            serviceId: id,
            status: req.body.status,
            pendingNote: req.body.status === "COM_PENDENCIA" ? pendingNote : null,
          },
        });

        await notifyUserStatusChange(service, req.body.status, pendingNote);
      }

      return res.redirect("/ffb-services");
    } catch (err) {
      console.error("Erro ao salvar edição de Serviço FFB:", err);
      res.status(500).send("Erro ao salvar edição de Serviço FFB");
    }
  }
);

// ============================================================
// ATUALIZAR STATUS DO SERVIÇO FFB (POST RÁPIDO + E-MAIL)
// ============================================================
router.post(
  "/ffb-services/:id/status",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const serviceId = Number(req.params.id);
      const { newStatus, pendingNote } = req.body;

      if (!serviceId || !newStatus) {
        return res.status(400).send("Dados inválidos");
      }

      if (!(await ensureServiceAccess(req, serviceId))) {
        return res.status(403).send("Você não tem acesso a este serviço.");
      }

      // 🔹 Buscar serviço + usuário (para e-mail)
      const service = await prisma.serviceRequest.findUnique({
        where: { id: serviceId },
        include: { user: true },
      });

      if (!service) {
        return res.status(404).send("Serviço não encontrado.");
      }

      // 🔹 Tratar pendência
      const note =
        typeof pendingNote === "string" ? pendingNote.trim() : "";

      if (newStatus === "COM_PENDENCIA" && !note) {
        return res.status(400).send("Informe o que está pendente.");
      }

      // 🔹 Criar histórico
      await prisma.serviceStatus.create({
        data: {
          serviceId,
          status: newStatus,
          pendingNote: newStatus === "COM_PENDENCIA" ? note : null,
        },
      });

      // 🔹 Atualizar status principal
      await prisma.serviceRequest.update({
        where: { id: serviceId },
        data: { status: newStatus },
      });

      // 🔹 Envio de e-mail (não pode quebrar o fluxo)
      if (service.user?.email) {
        try {
          const statusLabel = {
            ENVIADO_GATARINA: "Enviado para Gatarina",
            COM_PENDENCIA: "Com Pendência",
            ENVIADO_FFB: "Enviado para FFB",
            RECEBIDO_FFB: "Recebido pela FFB",
            ENVIADO_ASSOCIADO: "Enviado para Associado",
          }[newStatus] || newStatus;

          const subject = `CaTech: atualização no seu serviço #${serviceId}`;

          const pendenciaHtml =
            newStatus === "COM_PENDENCIA"
              ? `<p style="color:#b91c1c;"><strong>Pendência:</strong> ${escapeHtml(
                  note
                )}</p>`
              : "";

          const html = `
            <div style="font-family: Arial, sans-serif; line-height:1.4;">
              <h2>Atualização do Serviço</h2>
              <p><strong>Código:</strong> ${serviceId}</p>
              <p><strong>Tipo:</strong> ${escapeHtml(service.type || "-")}</p>
              <p><strong>Novo status:</strong> ${escapeHtml(statusLabel)}</p>
              ${pendenciaHtml}
              <p>
                Acompanhe em:
                <a href="${appUrl(newStatus === "COM_PENDENCIA" ? `/my-services/${serviceId}/correct` : `/my-services/${serviceId}`)}">
                  ${appUrl(newStatus === "COM_PENDENCIA" ? `/my-services/${serviceId}/correct` : `/my-services/${serviceId}`)}
                </a>
              </p>
            </div>
          `;

          await sendStatusEmail({
            to: service.user.email,
            subject,
            html,
          });
        } catch (mailErr) {
          console.error("⚠️ Erro ao enviar e-mail de status:", mailErr);
        }
      }

      return res.redirect("/ffb-services");
    } catch (err) {
      console.error("Erro ao atualizar status FFB:", err);
      return res.status(500).send("Erro ao atualizar status");
    }
  }
);




// ============================================================
// LISTAR TODOS OS SERVIÇOS FFB
// ============================================================
router.get(
  "/ffb-services",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const services = await prisma.serviceRequest.findMany({
  where: serviceScope(req),
  orderBy: { createdAt: "desc" },
  include: {
    user: true,
    statuses: { orderBy: { createdAt: "desc" } },
    transferRequest: true,
    secondCopyRequest: {
      include: {
        cat: true,
      },
    },
  },
});

// ===============================
// MAPA DE NOMES – SEGUNDA VIA
// ===============================
const secondCopyLabels = {
  PEDIGREE_SECOND_COPY: "Segunda Via de Pedigree",
  TITLE_DIPLOMA_SECOND_COPY: "Segunda Via de Título",
  OWNERSHIP_DOC_SECOND_COPY: "Segunda Via de Propriedade",
  CHANGE_TO_NOT_BREEDING: "Mudança de For Breeding para Not For Breeding",
  CHANGE_TO_BREEDING: "Mudança de Not For Breeding para For Breeding",
  CHANGE_COLOR: "Mudança de Cor",
  FIX_MICROCHIP: "Correção de Microchip",
  FIX_SEX: "Correção de Sexo",
  CATTERY_SECOND_COPY: "Segunda Via de Registro de Gatil",
  OTHER: "Outros",
};

for (const s of services) {
  if (s.type === "Segunda Via e Alterações" && s.secondCopyRequest) {
    const label =
      secondCopyLabels[s.secondCopyRequest.requestType] ||
      s.secondCopyRequest.requestType;

    const catName = s.secondCopyRequest.cat?.name;

    s.description = catName
      ? `${label} - Gato: ${catName}`
      : label;
  }
}

      res.render("ffb-services/index", {
        user: req.session.user,
        services,
        currentPath: "/ffb-services",
      });
    } catch (err) {
      console.error("Erro ao carregar serviços FFB:", err);
      res.status(500).send("Erro ao carregar serviços FFB");
    }
  }
);

// ============================================================
// SALVAR MALOTE DO SERVIÇO
// ============================================================
router.post(
  "/ffb-services/:id/malote",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const serviceId = Number(req.params.id);
      const { malote } = req.body;

      if (!serviceId) {
        return res.status(400).json({
          ok: false,
          error: "ID do serviço inválido.",
        });
      }

      if (!(await ensureServiceAccess(req, serviceId))) {
        return res.status(403).json({
          ok: false,
          error: "Você não tem acesso a este serviço.",
        });
      }

      const maloteValue =
        typeof malote === "string" ? malote.trim() : "";

      await prisma.serviceRequest.update({
        where: { id: serviceId },
        data: {
          malote: maloteValue || null,
        },
      });

      return res.json({
        ok: true,
        malote: maloteValue,
      });
    } catch (err) {
      console.error("Erro ao salvar malote:", err);
      return res.status(500).json({
        ok: false,
        error: "Erro ao salvar malote.",
      });
    }
  }
);

  return router;
};
