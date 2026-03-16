// modules/ffbServices.js
const express = require("express");
const { sendStatusEmail } = require("../utils/mailer");

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


module.exports = (prisma, requireAuth, requireAdmin) => {
  const router = express.Router();

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

      const service = await prisma.serviceRequest.findUnique({
  where: { id: serviceId },
  include: {
    user: true,
    transferRequest: true,
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

      if (service.description) {
        const match = service.description.match(/#(\d+)/);
        if (match) {
          const litterId = parseInt(match[1], 10);

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

      const service = await prisma.serviceRequest.findUnique({
        where: { id },
        include: { transferRequest: true },
      });

      if (!service) {
        return res.status(404).send("Serviço não encontrado.");
      }

      // ===============================
// LEITURA DOS FILHOTES DO FORM
// ===============================
const kittens = req.body.kittens || [];

// ===============================
// BUSCAR NINHADA PELO ID
// ===============================
let litter = null;

if (service.description) {
  const match = service.description.match(/#(\d+)/);
  if (match) {
    const litterId = Number(match[1]);
    litter = await prisma.litter.findUnique({
      where: { id: litterId },
    });
  }
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
            },
          });
        }

        return res.redirect("/ffb-services");
      }

      // =====================================
// ATUALIZAR FILHOTES (EMS, RAÇA, ETC)
// =====================================
if (litter && Array.isArray(kittens)) {
  for (let i = 0; i < kittens.length; i++) {
    const k = kittens[i];
    if (!k) continue;

    await prisma.litterKitten.updateMany({
      where: {
        litterId: litter.id,
        index: i + 1, // ⚠️ índice no banco começa em 1
      },
      data: {
        name: k.name || null,
        breed: k.breed || null,
        emsEyes: k.emsEyes || null, // 🔥 AQUI ESTAVA O PROBLEMA
        sex: k.sex || null,
        microchip: k.microchip
          ? k.microchip.replace(/\D/g, "").slice(0, 15)
          : null,
        breeding: k.breeding || null,
      },
    });
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
        },
      });

      if (req.body.status) {
        await prisma.serviceStatus.create({
          data: {
            serviceId: id,
            status: req.body.status,
          },
        });
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
                <a href="https://catechsystem.com.br/my-services/${serviceId}">
                  https://catechsystem.com.br/my-services/${serviceId}
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
