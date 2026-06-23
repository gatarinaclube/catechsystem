const express = require("express");
const { HELP_SECTIONS } = require("../utils/helpContent");

module.exports = (requireAuth) => {
  const router = express.Router();

  router.get("/ajuda", requireAuth, (req, res) => {
    res.render("help/index", {
      user: req.user,
      currentPath: "/ajuda",
      sections: HELP_SECTIONS,
    });
  });

  return router;
};
