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
      ownerId: req.session?.userId || null,
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
      error: null,
      currentPath: "/crm",
    });
  });

  router.post("/crm/clientes/novo", requireAuth, requirePermission("admin.crm"), async (req, res) => {
    try {
      await prisma.revenueClient.create({ data: clientData(req) });
      res.redirect("/crm");
    } catch (err) {
      res.status(400).render("revenues/client-form", {
        title: "Novo Cliente",
        formAction: "/crm/clientes/novo",
        backPath: "/crm",
        error: err.message || "Erro ao salvar cliente.",
        currentPath: "/crm",
      });
    }
  });

  return router;
};
