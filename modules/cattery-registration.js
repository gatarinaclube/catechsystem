const express = require("express");

module.exports = (prisma, requireAuth) => {
  const router = express.Router();

  function getAuthInfo(req) {
    const userId = req.session.userId;
    const role = req.session.userRole || "USER";
    const isAdmin = role === "ADMIN";
    return { userId, isAdmin };
  }

  // ============================
  // FORMULÁRIO
  // ============================
  router.get("/services/cattery-registration", requireAuth, async (req, res) => {
    try {
      res.render("service-forms/cattery-registration", {
        user: req.user,
        currentPath: req.path,
      });
    } catch (err) {
      console.error("Erro ao abrir Registro de Gatil:", err);
      res.status(500).send("Erro ao abrir formulário");
    }
  });

  // ============================
  // SUBMISSÃO
  // ============================
  router.post("/services/cattery-registration", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;

      const {
        nameOption1,
        nameOption2,
        nameOption3,
        numberOfCats,
        breeds,
      } = req.body;

      await prisma.serviceRequest.create({
        data: {
          userId,
          type: "Registro de Gatil",
          description: `Registro de Gatil - ${nameOption1}`,
          status: "ENVIADO_GATARINA",
          statuses: {
            create: { status: "ENVIADO_GATARINA" },
          },
          catteryRegistration: {
            create: {
              nameOption1,
              nameOption2: nameOption2 || null,
              nameOption3: nameOption3 || null,
              numberOfCats: Number(numberOfCats),
              breedsJson: JSON.stringify(
                Array.isArray(breeds) ? breeds : [breeds]
              ),
            },
          },
        },
      });

      res.redirect("/my-services");
    } catch (err) {
      console.error("Erro ao salvar Registro de Gatil:", err);
      res.status(500).send("Erro ao enviar Registro de Gatil");
    }
  });

  return router;
};
