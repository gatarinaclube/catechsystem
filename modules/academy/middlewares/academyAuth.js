const { getAcademyContext } = require("../services/academyService");

function requireAcademySession() {
  return (req, res, next) => {
    if (!req.session?.userId) {
      return res.redirect("/academy/login");
    }
    return next();
  };
}

function requireAcademyAdmin(prisma) {
  return async (req, res, next) => {
    const academy = await getAcademyContext(prisma, req);
    if (!academy.isAdmin) {
      return res.status(403).send("Acesso restrito ao administrador da Academy.");
    }
    res.locals.academy = academy;
    return next();
  };
}

module.exports = {
  requireAcademySession,
  requireAcademyAdmin,
};
