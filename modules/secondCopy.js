const express = require("express");
const multer = require("multer");
const path = require("path");

module.exports = (prisma, requireAuth) => {
  const router = express.Router();

  const storage = multer.diskStorage({
  destination: (req, file, cb) => {
  cb(null, path.join("public", "uploads", "second-copy"));
},

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = file.originalname
      .replace(/\s+/g, "_")
      .replace(/[^\w.-]/g, "");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({ storage });

  // FORM
router.get("/services/segunda-via-alteracoes", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const role = req.session.userRole;

    const cats = await prisma.cat.findMany({
      where: role === "ADMIN" ? {} : { ownerId: userId },
      orderBy: { name: "asc" },
    });

    return res.render("service-forms/second-copy-alterations", {
      user: req.user,          // já vem do middleware
      cats,
      currentPath: req.path,
    });
  } catch (err) {
    console.error("Erro ao abrir Segunda Via / Alterações:", err);
    return res.status(500).send("Erro ao abrir formulário");
  }
});


  // SUBMIT
  router.post(
    "/services/segunda-via-alteracoes",
    requireAuth,
    upload.array("attachments", 5),
    async (req, res) => {
      const { catId, requestType, details, newValue } = req.body;

// ✅ GARANTIR QUE details e newValue SEJAM STRING (não array)
const detailsStr = Array.isArray(details)
  ? details.filter(Boolean).join("\n")
  : (details || null);

const newValueStr = Array.isArray(newValue)
  ? newValue.filter(Boolean).join(" | ")
  : (newValue || null);


      const userId = req.session.userId;

      const service = await prisma.serviceRequest.create({
        data: {
          userId,
          type: "Segunda Via e Alterações",
          description: requestType,
        },
      });

      await prisma.serviceStatus.create({
        data: {
          serviceId: service.id,
          status: "ENVIADO_GATARINA",
        },
      });

      await prisma.secondCopyRequest.create({
        data: {
          serviceRequestId: service.id,
          catId: catId ? Number(catId) : null,
          requestType,
          details: detailsStr,
          newValue: newValueStr,
          attachmentsJson: JSON.stringify(
  (req.files || []).map(f => `/uploads/second-copy/${f.filename}`)
),
        },
      });

      res.redirect("/my-services");
    }
  );

  return router;
};
