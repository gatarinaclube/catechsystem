const express = require("express");
const publicControllerFactory = require("./controllers/publicController");
const memberControllerFactory = require("./controllers/memberController");
const adminControllerFactory = require("./controllers/adminController");
const {
  requireAcademySession,
  requireAcademyAdmin,
} = require("./middlewares/academyAuth");

module.exports = (prisma) => {
  const router = express.Router();
  const publicController = publicControllerFactory(prisma);
  const memberController = memberControllerFactory(prisma);
  const adminController = adminControllerFactory(prisma);
  const academySession = requireAcademySession();
  const academyAdmin = requireAcademyAdmin(prisma);

  router.get("/academy", publicController.home);
  router.get("/academy/sobre", publicController.about);
  router.get("/academy/planos", publicController.plans);
  router.get("/academy/conteudos", publicController.contents);
  router.get("/academy/faq", publicController.faq);
  router.get("/academy/login", publicController.loginForm);
  router.post("/academy/login", publicController.login);
  router.get("/academy/cadastro", publicController.registerForm);
  router.post("/academy/cadastro", publicController.register);

  router.get("/academy/app", academySession, memberController.dashboard);
  router.get("/academy/app/biblioteca", academySession, memberController.library);
  router.get("/academy/app/favoritos", academySession, memberController.favorites);
  router.get("/academy/app/aulas/:slug", academySession, memberController.lesson);
  router.post("/academy/app/aulas/:id/concluir", academySession, memberController.toggleComplete);
  router.post("/academy/app/aulas/:id/favorito", academySession, memberController.toggleFavorite);

  router.get("/academy/admin", academySession, academyAdmin, adminController.dashboard);
  router.post("/academy/admin/categorias", academySession, academyAdmin, adminController.createCategory);
  router.post("/academy/admin/categorias/:id", academySession, academyAdmin, adminController.updateCategory);
  router.post("/academy/admin/categorias/:id/excluir", academySession, academyAdmin, adminController.deleteCategory);
  router.post("/academy/admin/modulos", academySession, academyAdmin, adminController.createModule);
  router.post("/academy/admin/modulos/:id", academySession, academyAdmin, adminController.updateModule);
  router.post("/academy/admin/modulos/:id/excluir", academySession, academyAdmin, adminController.deleteModule);
  router.post("/academy/admin/aulas", academySession, academyAdmin, adminController.createLesson);
  router.post("/academy/admin/aulas/:id", academySession, academyAdmin, adminController.updateLesson);
  router.post("/academy/admin/aulas/:id/excluir", academySession, academyAdmin, adminController.deleteLesson);
  router.post("/academy/admin/planos", academySession, academyAdmin, adminController.createPlan);
  router.post("/academy/admin/planos/:id", academySession, academyAdmin, adminController.updatePlan);
  router.post("/academy/admin/planos/:id/excluir", academySession, academyAdmin, adminController.deletePlan);
  router.post("/academy/admin/usuarios", academySession, academyAdmin, adminController.createEnrollment);
  router.post("/academy/admin/usuarios/:id", academySession, academyAdmin, adminController.updateEnrollment);

  return router;
};
