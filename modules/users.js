// modules/users.js
const express = require("express");

module.exports = (prisma, requireAuth) => {
  const router = express.Router();

  // Helper igual aos outros módulos
  function getAuthInfo(req) {
    const userId = req.session?.userId || null;
    const role = req.session?.userRole || "USER";
    const isAdmin = role === "ADMIN";
    return { userId, role, isAdmin };
  }

  // --------- LISTA DE USUÁRIOS (apenas ADMIN) ---------
  router.get("/users", requireAuth, async (req, res) => {
    const { userId, isAdmin } = getAuthInfo(req);

    if (!isAdmin) {
      return res
        .status(403)
        .send("Acesso restrito apenas para administradores.");
    }

    try {
      // Usuário logado (para o sidebar)
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
      });

      // Todos os usuários cadastrados
      const allUsers = await prisma.user.findMany({
        orderBy: { name: "asc" },
      });

      const activeUsers = [];
      const newUsers = [];
      const inactiveUsers = [];

      allUsers.forEach((u) => {
        const status = u.approvalStatus || "INDEFERIDO";

        if (status === "DEFERIDO") {
          activeUsers.push(u);
        } else if (status === "RESTRICOES") {
          inactiveUsers.push(u);
        } else {
          newUsers.push(u);
        }
      });

      res.render("users/list", {
        user: currentUser,
        activeUsers,
        newUsers,
        inactiveUsers,
        currentPath: req.path,
      });
    } catch (err) {
      console.error("Erro ao listar usuários:", err);
      res.status(500).send("Erro ao listar usuários");
    }
  });

  // --------- DETALHES DO USUÁRIO (apenas ADMIN) ---------
  router.get("/users/:id", requireAuth, async (req, res) => {
    const { userId, isAdmin } = getAuthInfo(req);
    const targetId = Number(req.params.id);

    if (!isAdmin) {
      return res
        .status(403)
        .send("Acesso restrito apenas para administradores.");
    }

    try {
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
      });

      const userDetail = await prisma.user.findUnique({
        where: { id: targetId },
      });

      if (!userDetail) {
        return res.status(404).send("Usuário não encontrado.");
      }

      const logs = []; // por enquanto vazio

      res.render("users/show", {
        user: currentUser,
        userDetail,
        logs,
        currentPath: req.path,
      });
    } catch (err) {
      console.error("Erro ao carregar usuário:", err);
      res.status(500).send("Erro ao carregar usuário");
    }
  });

// --------- ATUALIZAR DADOS + STATUS / OBSERVAÇÕES DO USUÁRIO ---------
router.post("/users/:id", requireAuth, async (req, res) => {
  const { isAdmin } = getAuthInfo(req);
  const targetId = Number(req.params.id);

  if (!isAdmin) {
    return res
      .status(403)
      .send("Acesso restrito apenas para administradores.");
  }

  try {
    const {
      name,
      email,
      cpf,
      address,
      city,
      cep,
      state,
      country,
      phones,
      clubs,
      role,
      approvalStatus,
      adminNotes,

      // 🔹 CAMPOS DO GATIL FIFe
      hasFifeCattery,
      fifeCatteryName,
    } = req.body;

    // Normaliza status para os 3 valores definidos
    let finalStatus = "INDEFERIDO";
    if (approvalStatus === "DEFERIDO") {
      finalStatus = "DEFERIDO";
    } else if (approvalStatus === "RESTRICOES") {
      finalStatus = "RESTRICOES";
    }

    await prisma.user.update({
      where: { id: targetId },
      data: {
        name,
        email,
        cpf,
        address,
        city,
        cep,
        state,
        country,
        phones,
        clubs,
        role: role || "USER",
        approvalStatus: finalStatus,
        adminNotes: adminNotes || null,

        // 🔹 SALVANDO GATIL
        hasFifeCattery: hasFifeCattery || "NO",
        fifeCatteryName:
          hasFifeCattery === "YES" ? fifeCatteryName : null,
      },
    });

    res.redirect(`/users/${targetId}`);
  } catch (err) {
    console.error("Erro ao atualizar usuário:", err);
    res.status(500).send("Erro ao atualizar usuário");
  }
});

  return router;
};
