const express = require("express");
const multer = require("multer");

module.exports = (prisma, requireAuth) => {
  const router = express.Router();

  // ============================
  // FORMULÁRIO
  // ============================
  router.get("/services/pedigree-homologation", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;

      const role = req.session.userRole;

const cats = await prisma.cat.findMany({
  where: role === "ADMIN" ? {} : { ownerId: userId },
  orderBy: { name: "asc" },
});


      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      return res.render("service-forms/pedigree-homologation", {
        user,
        currentPath: req.path,
        cats,
      });
    } catch (err) {
      console.error("Erro ao abrir Homologação de Pedigree:", err);
      return res.status(500).send("Erro ao abrir formulário");
    }
  });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads");
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${unique}-${file.originalname}`);
  },
});

const upload = multer({ storage });

  // ============================
  // SUBMISSÃO
  // ============================
router.post(
  "/services/pedigree-homologation",
  requireAuth,
  upload.single("transferAuthorizationFile"),
  async (req, res) => {

      try {
        console.log("🔥 ENTROU NO POST DE HOMOLOGAÇÃO DE PEDIGREE 🔥");
        console.log("DEBUG userId:", req.session.userId);
        console.log("DEBUG body:", req.body);

        const userId = req.session.userId;
        const {
  catId,
  homologationType,
  ownershipDeclaration,
  transferDecision,
  breedingStatus,
  newOwnerName,
  oldOwnerName
} = req.body;


        // ----------------------------
        // VALIDAÇÕES
        // ----------------------------
        if (!catId || !homologationType) {
          throw new Error("Tipo de homologação não informado.");
        }

        // ----------------------------
        // BUSCAR GATO
        // ----------------------------
        const cat = await prisma.cat.findUnique({
          where: { id: Number(catId) },
        });

const role = req.session.userRole;

if (!cat) {
  throw new Error("Gato inválido para homologação.");
}

if (role !== "ADMIN" && cat.ownerId !== userId) {
  throw new Error("Você não tem permissão para homologar este gato.");
}


        if (!cat.pedigreeFile) {
          throw new Error(
            "O gato selecionado não possui pedigree anexado no cadastro."
          );
        }

        // ----------------------------
        // CRIAR SERVICE REQUEST
        // ----------------------------
        const service = await prisma.serviceRequest.create({
          data: {
            userId,
            type: "Homologação de Pedigree",
            description: `Homologação de pedigree do gato ${cat.name}`,
            status: "ENVIADO_GATARINA",
          },
        });

if (
  ownershipDeclaration === "NOT_OWNER" &&
  transferDecision === "REQUEST_TRANSFER"
) {
  let authorizationFilePath = null;

  if (req.file) {
    authorizationFilePath = `/uploads/${req.file.filename}`;
  }

  const transferService = await prisma.serviceRequest.create({
    data: {
      userId,
      type: "Transferência de Propriedade",
      description: `Transferência solicitada via Homologação de Pedigree`,
    },
  });

  await prisma.serviceStatus.create({
    data: {
      serviceId: transferService.id,
      status: "ENVIADO_GATARINA",
    },
  });

  await prisma.transferRequest.create({
    data: {
      serviceRequestId: transferService.id,
      catId: Number(catId),
      breedingStatus,
      oldOwnerName,
      newOwnerName,
      memberType: "FIFE",
      authorizationFile: authorizationFilePath,
    },
  });
}


        console.log("✅ ServiceRequest criado:", service.id);

        // ----------------------------
        // STATUS INICIAL
        // ----------------------------
        await prisma.serviceStatus.create({
          data: {
            serviceId: service.id,
            status: "ENVIADO_GATARINA",
          },
        });

        console.log("✅ Status criado");

        // ----------------------------
        // PEDIGREE HOMOLOGATION
        // ----------------------------
        await prisma.pedigreeHomologation.create({
          data: {
            serviceRequestId: service.id,
            catId: cat.id,
            homologationType,
          },
        });

        console.log("✅ PedigreeHomologation criada");

        return res.redirect("/my-services");
      } catch (err) {
        console.error("❌ ERRO HOMOLOGAÇÃO PEDIGREE:", err.message);

        const userId = req.session.userId;

        const cats = await prisma.cat.findMany({
          where: { ownerId: userId },
          orderBy: { name: "asc" },
        });

        const user = await prisma.user.findUnique({
          where: { id: userId },
        });

        return res.render("service-forms/pedigree-homologation", {
          user,
          currentPath: req.path,
          cats,
          error: err.message,
        });
      }
    }
  );

  return router;
};
