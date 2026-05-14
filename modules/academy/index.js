const express = require("express");
const publicControllerFactory = require("./controllers/publicController");
const memberControllerFactory = require("./controllers/memberController");
const adminControllerFactory = require("./controllers/adminController");
const expertControllerFactory = require("./controllers/expertController");
const {
  requireAcademySession,
  requireAcademyAccess,
  requireAcademyAdmin,
  requireAcademyContributor,
} = require("./middlewares/academyAuth");
const { createAcademyUpload } = require("./middlewares/academyUpload");

module.exports = (prisma) => {
  const router = express.Router();
  const publicController = publicControllerFactory(prisma);
  const memberController = memberControllerFactory(prisma);
  const adminController = adminControllerFactory(prisma);
  const expertController = expertControllerFactory(prisma);
  const academySession = requireAcademySession();
  const academyAccess = requireAcademyAccess(prisma);
  const academyAdmin = requireAcademyAdmin(prisma);
  const academyContributor = requireAcademyContributor(prisma);
  const academyUpload = createAcademyUpload();

  router.get("/academy", publicController.home);
  router.get("/academy/sobre", publicController.about);
  router.get("/academy/planos", publicController.plans);
  router.get("/academy/conteudos", publicController.contents);
  router.get("/academy/faq", publicController.faq);
  router.get("/academy/sitemap.xml", publicController.sitemap);
  router.get("/academy/robots.txt", publicController.robots);
  router.get("/academy/login", publicController.loginForm);
  router.post("/academy/login", publicController.login);
  router.get("/academy/cadastro", publicController.registerForm);
  router.post("/academy/cadastro", publicController.register);

  router.get("/academy/app", academySession, academyAccess, memberController.dashboard);
  router.get("/academy/app/biblioteca", academySession, academyAccess, memberController.library);
  router.get("/academy/app/favoritos", academySession, academyAccess, memberController.favorites);
  router.get("/academy/app/certificados", academySession, academyAccess, memberController.certificates);
  router.get("/academy/app/aulas/:slug", academySession, academyAccess, memberController.lesson);
  router.post("/academy/app/aulas/:id/concluir", academySession, academyAccess, memberController.toggleComplete);
  router.post("/academy/app/aulas/:id/favorito", academySession, academyAccess, memberController.toggleFavorite);

  router.get("/academy/especialista", academySession, academyContributor, expertController.dashboard);
  router.get("/academy/especialista/aulas/nova", academySession, academyContributor, expertController.newLesson);
  router.post("/academy/especialista/aulas", academySession, academyContributor, expertController.createLesson);
  router.get("/academy/especialista/aulas/:id", academySession, academyContributor, expertController.editLesson);
  router.post("/academy/especialista/aulas/:id", academySession, academyContributor, expertController.updateLesson);
  router.post("/academy/especialista/aulas/:id/midia", academySession, academyContributor, academyUpload.single("file"), expertController.uploadLessonMedia);

  router.get("/academy/admin", academySession, academyAdmin, adminController.dashboard);
  router.post("/academy/admin/seed", academySession, academyAdmin, adminController.seedFoundation);
  router.get("/academy/admin/midia", academySession, academyAdmin, adminController.mediaLibrary);
  router.post("/academy/admin/midia", academySession, academyAdmin, academyUpload.single("file"), adminController.uploadMedia);
  router.post("/academy/admin/midia/:id", academySession, academyAdmin, adminController.updateMedia);
  router.post("/academy/admin/midia/:id/excluir", academySession, academyAdmin, adminController.deleteMedia);
  router.post("/academy/admin/categorias", academySession, academyAdmin, adminController.createCategory);
  router.post("/academy/admin/categorias/:id", academySession, academyAdmin, adminController.updateCategory);
  router.post("/academy/admin/categorias/:id/excluir", academySession, academyAdmin, adminController.deleteCategory);
  router.post("/academy/admin/autores", academySession, academyAdmin, adminController.createAuthor);
  router.post("/academy/admin/autores/:id", academySession, academyAdmin, adminController.updateAuthor);
  router.post("/academy/admin/autores/:id/excluir", academySession, academyAdmin, adminController.deleteAuthor);
  router.post("/academy/admin/modulos", academySession, academyAdmin, adminController.createModule);
  router.post("/academy/admin/modulos/:id", academySession, academyAdmin, adminController.updateModule);
  router.post("/academy/admin/modulos/:id/excluir", academySession, academyAdmin, adminController.deleteModule);
  router.get("/academy/admin/aulas/:id/editor", academySession, academyAdmin, adminController.editLesson);
  router.post("/academy/admin/aulas/:id/editor", academySession, academyAdmin, adminController.saveLessonEditor);
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
