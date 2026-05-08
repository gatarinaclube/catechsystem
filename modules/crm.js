const express = require("express");
const { canViewAllData } = require("../utils/access");

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();

  function clientScope(req) {
    if (canViewAllData(req.session?.userRole)) return {};
    return {
      OR: [
        { ownerId: req.session?.userId || null },
        { ownerId: null },
      ],
    };
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

  router.get("/crm", requireAuth, requirePermission("admin.crm"), async (req, res) => {
    const clients = await prisma.revenueClient.findMany({
      where: clientScope(req),
      orderBy: { fullName: "asc" },
    });

    res.render("crm/index", {
      user: req.user,
      clients,
      currentPath: "/crm",
    });
  });

  router.get("/crm/clientes/novo", requireAuth, requirePermission("admin.crm"), (req, res) => {
    res.render("revenues/client-form", {
      title: "Novo Cliente",
      formAction: "/crm/clientes/novo",
      backPath: "/crm",
      client: null,
      error: null,
      currentPath: "/crm",
    });
  });

  router.post("/crm/clientes/novo", requireAuth, requirePermission("admin.crm"), async (req, res) => {
    try {
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
      client,
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
        client: { ...client, ...req.body },
        error: err.message || "Erro ao salvar cliente.",
        currentPath: "/crm",
      });
    }
  });

  return router;
};
