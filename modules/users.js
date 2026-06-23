// modules/users.js
const express = require("express");
const { ROLES, getRoleLabel, normalizeRole, isAdminRole } = require("../utils/access");
const { formatCpfCnpj, formatPhone } = require("../utils/format");

module.exports = (prisma, requireAuth, requirePermission) => {
  const router = express.Router();
  const roleOptions = [
    { value: ROLES.PREMIUM, label: getRoleLabel(ROLES.PREMIUM) },
    { value: ROLES.ASSOCIADO_PREMIUM, label: getRoleLabel(ROLES.ASSOCIADO_PREMIUM) },
    { value: ROLES.MASTER, label: getRoleLabel(ROLES.MASTER) },
    { value: ROLES.ASSOCIADO_A, label: getRoleLabel(ROLES.ASSOCIADO_A) },
    { value: ROLES.BASIC, label: getRoleLabel(ROLES.BASIC) },
    { value: ROLES.ASSOCIADO_B, label: getRoleLabel(ROLES.ASSOCIADO_B) },
    { value: ROLES.CATBREED, label: getRoleLabel(ROLES.CATBREED) },
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

      const userGroups = [
        { key: "admin", title: getRoleLabel(ROLES.ADMIN), users: [] },
        { key: "premium", title: getRoleLabel(ROLES.PREMIUM), users: [] },
        { key: "associado_premium", title: getRoleLabel(ROLES.ASSOCIADO_PREMIUM), users: [] },
        { key: "master", title: getRoleLabel(ROLES.MASTER), users: [] },
        { key: "associado_a", title: getRoleLabel(ROLES.ASSOCIADO_A), users: [] },
        { key: "basic", title: getRoleLabel(ROLES.BASIC), users: [] },
        { key: "associado_b", title: getRoleLabel(ROLES.ASSOCIADO_B), users: [] },
        { key: "catbreed", title: getRoleLabel(ROLES.CATBREED), users: [] },
        { key: "inactive", title: "Inativo", users: [] },
      ];
      const groupByRole = new Map(
        userGroups
          .filter((group) => group.key !== "inactive")
          .map((group) => [group.key.toUpperCase(), group])
      );
      const inactiveGroup = userGroups.find((group) => group.key === "inactive");

      allUsers.forEach((u) => {
        const normalizedRole = normalizeRole(u.role);
        const userWithRole = {
          ...u,
          role: normalizedRole,
          roleLabel: getRoleLabel(normalizedRole),
        };
        const status = u.approvalStatus || "INDEFERIDO";

        if (status === "RESTRICOES") {
          inactiveGroup.users.push(userWithRole);
        } else {
          const group = groupByRole.get(normalizedRole) || groupByRole.get(ROLES.BASIC);
          group.users.push(userWithRole);
        }
      });

      const trialUsers = allUsers
        .filter((u) => u.accountOrigin === "NON_ASSOCIATE" && u.subscriptionStatus === "TRIALING")
        .map((u) => ({
          ...u,
          role: normalizeRole(u.role),
          roleLabel: getRoleLabel(normalizeRole(u.role)),
        }))
        .sort((a, b) => {
          const aTime = a.trialEndsAt ? new Date(a.trialEndsAt).getTime() : Number.MAX_SAFE_INTEGER;
          const bTime = b.trialEndsAt ? new Date(b.trialEndsAt).getTime() : Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        });

      res.render("users/list", {
        user: currentUser,
        userGroups,
        trialUsers,
        roleOptions,
        approvalOptions,
        currentPath: req.path,
      });
    } catch (err) {
      console.error("Erro ao listar usuários:", err);
      res.status(500).send("Erro ao listar usuários");
    }
  });

  // --------- VISUALIZAR SISTEMA COMO USUÁRIO ---------
  router.post("/users/:id/view-as", requireAuth, requirePermission("admin.users"), async (req, res) => {
    const { userId, isAdmin } = getAuthInfo(req);
    const targetId = Number(req.params.id);

    if (!isAdmin) {
      return res.status(403).send("Acesso restrito apenas para administradores.");
    }

    if (!Number.isFinite(targetId) || targetId <= 0 || targetId === userId) {
      return res.redirect("/users");
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true, approvalStatus: true },
    });

    if (!targetUser) {
      return res.status(404).send("Usuário não encontrado.");
    }

    req.session.adminViewAs = {
      adminId: userId,
      adminRole: ROLES.ADMIN,
      targetId: targetUser.id,
      startedAt: new Date().toISOString(),
    };
    req.session.userId = targetUser.id;
    req.session.userRole = normalizeRole(targetUser.role);

    return res.redirect("/dashboard");
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

      let userDetail = await prisma.user.findUnique({
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
      accountOrigin,
      selectedPlan,
      subscriptionStatus,
      trialEndsAt,

      // 🔹 CAMPOS DO GATIL FIFe
      hasFifeCattery,
      fifeCatteryName,
    } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

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

    const emailOwner = normalizedEmail
      ? await prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true },
        })
      : null;

    if (emailOwner && emailOwner.id !== targetId) {
      return res.status(400).send("Este e-mail já está sendo usado por outro usuário.");
    }

    await prisma.user.update({
      where: { id: targetId },
      data: {
        name,
        email: normalizedEmail,
        cpf: formatCpfCnpj(cpf),
        address,
        city,
        cep,
        state,
        country,
        phones: formatPhone(phones),
        clubs,
        role: isAdmin ? normalizeRole(role) || ROLES.BASIC : existingUser?.role || ROLES.PREMIUM,
        approvalStatus: isAdmin ? finalStatus : existingUser?.approvalStatus || "DEFERIDO",
        adminNotes: isAdmin ? adminNotes || null : undefined,
        accountOrigin: isAdmin ? accountOrigin || null : undefined,
        selectedPlan: isAdmin ? selectedPlan || null : undefined,
        subscriptionStatus: isAdmin ? subscriptionStatus || null : undefined,
        trialEndsAt: isAdmin && trialEndsAt ? new Date(`${trialEndsAt}T23:59:59`) : isAdmin ? null : undefined,
        planActivatedAt: isAdmin && subscriptionStatus === "ACTIVE" ? new Date() : undefined,

        // 🔹 SALVANDO GATIL
        hasFifeCattery: hasFifeCattery || "NO",
        fifeCatteryName:
          hasFifeCattery === "YES" ? fifeCatteryName : null,
      },
    });

    res.redirect(`/users/${targetId}`);
  } catch (err) {
    console.error("Erro ao atualizar usuário:", err);
    if (err.code === "P2002") {
      return res.status(400).send("Este e-mail já está sendo usado por outro usuário.");
    }
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
