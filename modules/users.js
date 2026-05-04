// modules/users.js
const express = require("express");
const { ROLES, getRoleLabel, normalizeRole, isAdminRole } = require("../utils/access");

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();
  const roleOptions = [
    { value: ROLES.BASIC, label: getRoleLabel(ROLES.BASIC) },
    { value: ROLES.MASTER, label: getRoleLabel(ROLES.MASTER) },
    { value: ROLES.PREMIUM, label: getRoleLabel(ROLES.PREMIUM) },
    { value: ROLES.ADMIN, label: getRoleLabel(ROLES.ADMIN) },
  ];
  const approvalOptions = [
    { value: "INDEFERIDO", label: "Novo cadastro" },
    { value: "DEFERIDO", label: "Ativo" },
    { value: "RESTRICOES", label: "Restrição" },
  ];

  // Helper igual aos outros módulos
  function getAuthInfo(req) {
    const userId = req.session?.userId || null;
    const role = normalizeRole(req.session?.userRole);
    const isAdmin = isAdminRole(role);
    return { userId, role, isAdmin };
  }

  // --------- LISTA DE USUÁRIOS ---------
  router.get("/users", requireAuth, requirePermission("admin.users"), async (req, res) => {
    const { userId, isAdmin } = getAuthInfo(req);

    try {
      // Usuário logado (para o sidebar)
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
      });

      // Todos os usuários cadastrados
      const allUsers = await prisma.user.findMany({
        where: isAdmin ? {} : { id: userId },
        orderBy: { name: "asc" },
      });

      const activeUsers = [];
      const newUsers = [];
      const inactiveUsers = [];

      allUsers.forEach((u) => {
        const normalizedRole = normalizeRole(u.role);
        const userWithRole = {
          ...u,
          role: normalizedRole,
          roleLabel: getRoleLabel(normalizedRole),
        };
        const status = u.approvalStatus || "INDEFERIDO";

        if (status === "DEFERIDO") {
          activeUsers.push(userWithRole);
        } else if (status === "RESTRICOES") {
          inactiveUsers.push(userWithRole);
        } else {
          newUsers.push(userWithRole);
        }
      });

      res.render("users/list", {
        user: currentUser,
        activeUsers,
        newUsers,
        inactiveUsers,
        roleOptions,
        approvalOptions,
        currentPath: req.path,
      });
    } catch (err) {
      console.error("Erro ao listar usuários:", err);
      res.status(500).send("Erro ao listar usuários");
    }
  });

  // --------- DETALHES DO USUÁRIO ---------
  router.get("/users/:id", requireAuth, requirePermission("admin.users"), async (req, res) => {
    const { userId, isAdmin } = getAuthInfo(req);
    const targetId = Number(req.params.id);

    if (!isAdmin && targetId !== userId) {
      return res.status(403).send("Você não tem acesso a este usuário.");
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
        userDetail: {
          ...userDetail,
          role: normalizeRole(userDetail.role),
          roleLabel: getRoleLabel(userDetail.role),
        },
        logs,
        roleOptions,
        currentPath: req.path,
      });
    } catch (err) {
      console.error("Erro ao carregar usuário:", err);
      res.status(500).send("Erro ao carregar usuário");
    }
  });

// --------- ATUALIZAR DADOS + STATUS / OBSERVAÇÕES DO USUÁRIO ---------
router.post("/users/:id", requireAuth, requirePermission("admin.users"), async (req, res) => {
  const { userId, isAdmin } = getAuthInfo(req);
  const targetId = Number(req.params.id);

  if (!isAdmin && targetId !== userId) {
    return res.status(403).send("Você não pode editar este usuário.");
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

    const existingUser = await prisma.user.findUnique({
      where: { id: targetId },
      select: { role: true, approvalStatus: true },
    });

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
        role: isAdmin ? normalizeRole(role) || ROLES.BASIC : existingUser?.role || ROLES.PREMIUM,
        approvalStatus: isAdmin ? finalStatus : existingUser?.approvalStatus || "DEFERIDO",
        adminNotes: isAdmin ? adminNotes || null : undefined,

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

router.post(
  "/users/:id/quick-update",
  requireAuth,
  requirePermission("admin.users"),
  async (req, res) => {
    const { isAdmin, userId } = getAuthInfo(req);
    const targetId = Number(req.params.id);

    if (!isAdmin) {
      return res.status(403).send("Acesso restrito apenas para administradores.");
    }

    try {
      const targetUser = await prisma.user.findUnique({
        where: { id: targetId },
      });

      if (!targetUser) {
        return res.status(404).send("Usuário não encontrado.");
      }

      let finalStatus = "INDEFERIDO";
      if (req.body.approvalStatus === "DEFERIDO") {
        finalStatus = "DEFERIDO";
      } else if (req.body.approvalStatus === "RESTRICOES") {
        finalStatus = "RESTRICOES";
      }

      const nextRole = normalizeRole(req.body.role) || ROLES.BASIC;

      // Evita que o último admin ativo se remova do perfil administrativo sem querer.
      if (targetId === userId && nextRole !== ROLES.ADMIN) {
        const adminCount = await prisma.user.count({
          where: { role: ROLES.ADMIN, approvalStatus: "DEFERIDO" },
        });

        if (adminCount <= 1) {
          return res
            .status(400)
            .send("Mantenha pelo menos um administrador ativo no sistema.");
        }
      }

      await prisma.user.update({
        where: { id: targetId },
        data: {
          role: nextRole,
          approvalStatus: finalStatus,
        },
      });

      res.redirect("/users");
    } catch (err) {
      console.error("Erro na atualização rápida do usuário:", err);
      res.status(500).send("Erro ao atualizar usuário");
    }
  }
);

  return router;
};
