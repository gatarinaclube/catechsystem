// modules/services.js
const express = require("express");

module.exports = (prisma, requireAuth) => {
  const router = express.Router();

  // PÁGINA PRINCIPAL DE SERVIÇOS (já existia ou algo parecido)
  router.get("/services", requireAuth, async (req, res) => {
    res.render("services/index", {
      user: req.user,
      currentPath: "/services",
    });
  });

  // ✅ NOVA ROTA: MEUS SERVIÇOS
  router.get("/my-services", requireAuth, async (req, res) => {
    const services = await prisma.serviceRequest.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });

    res.render("services/my-services", {
      user: req.user,
      currentPath: "/my-services",
      services,
    });
  });
  // ✅ ROTA ADMIN: Editar Serviço FFB
  router.get("/ffb-services/:id/edit", requireAuth, async (req, res) => {
    if (req.user.role !== "ADMIN") {
      return res.status(403).send("Acesso negado");
    }

    const service = await prisma.serviceRequest.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        user: true,
        litter: {
          include: {
            kittens: true,
            male: true,
            female: true,
          },
        },
        statuses: true,
      },
    });

    if (!service) return res.status(404).send("Serviço não encontrado");

    res.render("ffb-services/edit", {
      user: req.user,
      service,
      currentPath: "/ffb-services",
    });
  });
  // ✅ ROTA ADMIN: Salvar alterações
  router.post("/ffb-services/:id/edit", requireAuth, async (req, res) => {
    if (req.user.role !== "ADMIN") {
      return res.status(403).send("Acesso negado");
    }

    const id = Number(req.params.id);

    await prisma.serviceRequest.update({
      where: { id },
      data: {
        type: req.body.type,
        description: req.body.description,
        status: req.body.status,
      },
    });

    res.redirect("/ffb-services");
  });

  return router;
};
