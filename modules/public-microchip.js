const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { sendStatusEmail } = require("../utils/mailer");
const { baseSeo, organizationSchema } = require("../utils/seo");
const { formatCpf, formatPhone } = require("../utils/format");

const CAT_BREEDS = [
  "Abissínio", "Aegean", "American Bobtail", "American Curl", "American Shorthair",
  "American Wirehair", "Arabian Mau", "Asian", "Australian Mist", "Balinês",
  "Bengal", "Birman", "Bombay", "British Longhair", "British Shorthair",
  "Burmese", "Burmilla", "Chartreux", "Chausie", "Cornish Rex", "Cymric",
  "Devon Rex", "Donskoy", "Egyptian Mau", "European Shorthair", "Exotic Shorthair",
  "German Rex", "Havana Brown", "Himalayan", "Japanese Bobtail", "Khao Manee",
  "Korat", "Kurilian Bobtail", "LaPerm", "Lykoi", "Maine Coon", "Manx",
  "Munchkin", "Nebelung", "Norwegian Forest Cat", "Ocicat", "Oriental Longhair",
  "Oriental Shorthair", "Persa", "Peterbald", "Pixiebob", "RagaMuffin",
  "Ragdoll", "Russian Blue", "Savannah", "Scottish Fold", "Selkirk Rex",
  "Siamês", "Siberian", "Singapura", "Snowshoe", "Somali", "Sphynx",
  "Thai", "Tonkinese", "Toyger", "Turkish Angora", "Turkish Van",
  "Sem Raça Definida", "Não Encontrado na Lista",
];

const DOG_BREEDS = [
  "Affenpinscher", "Afghan Hound", "Airedale Terrier", "Akita", "American Bully",
  "American Staffordshire Terrier", "Basenji", "Basset Hound", "Beagle",
  "Bearded Collie", "Bernese Mountain Dog", "Bichon Frisé", "Bloodhound",
  "Border Collie", "Boston Terrier", "Boxer", "Braco Alemão", "Buldogue Francês",
  "Buldogue Inglês", "Bull Terrier", "Cane Corso", "Cavalier King Charles Spaniel",
  "Chihuahua", "Chow Chow", "Cocker Spaniel Americano", "Cocker Spaniel Inglês",
  "Collie", "Dachshund", "Dálmata", "Dobermann", "Dogo Argentino",
  "Dogue Alemão", "Dogue de Bordeaux", "Fila Brasileiro", "Fox Terrier",
  "Golden Retriever", "Husky Siberiano", "Jack Russell Terrier", "Labrador Retriever",
  "Lhasa Apso", "Maltês", "Mastiff", "Pastor Alemão", "Pastor Australiano",
  "Pastor Belga", "Pastor de Shetland", "Pequinês", "Pinscher", "Pit Bull",
  "Poodle", "Pug", "Rottweiler", "Samoieda", "Schnauzer", "Setter Irlandês",
  "Shar Pei", "Shiba Inu", "Shih Tzu", "Spitz Alemão", "Terra Nova",
  "Weimaraner", "Welsh Corgi Cardigan", "Welsh Corgi Pembroke", "West Highland White Terrier",
  "Whippet", "Yorkshire Terrier", "Sem Raça Definida", "Não Encontrado na Lista",
];

const STATUS_LABELS = {
  ACTIVE: "Ativo",
  MISSING: "Desaparecido",
  DECEASED: "Óbito",
  DELETED: "Cadastro excluído",
};

function normalizeMicrochip(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatMicrochip(value) {
  const digits = normalizeMicrochip(value);
  return digits.replace(/(\d{3})(?=\d)/g, "$1.").replace(/\.$/, "");
}

function parseDateValue(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

function uploadsRoot() {
  return process.env.UPLOADS_DIR || path.join(__dirname, "..", "public", "uploads");
}

function buildUpload() {
  const uploadDir = path.join(uploadsRoot(), "microchips");
  fs.mkdirSync(uploadDir, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
      },
    }),
    limits: { files: 5, fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!String(file.mimetype || "").startsWith("image/")) {
        return cb(new Error("Envie apenas arquivos de imagem."));
      }
      return cb(null, true);
    },
  });
}

function readPhones(body) {
  const numbers = Array.isArray(body.phoneNumber) ? body.phoneNumber : [body.phoneNumber];
  const types = Array.isArray(body.phoneType) ? body.phoneType : [body.phoneType];
  return numbers
    .map((number, index) => ({
      number: formatPhone(number),
      type: String(types[index] || "Celular").trim(),
    }))
    .filter((phone) => phone.number);
}

function publicViewPayload(req, extra = {}) {
  const seo = baseSeo({
    title: "Cadastro e Busca de Microchip para Animais - CaTech System",
    description: "Consulte microchips cadastrados e registre cães, gatos e outros animais com identificação permanente. Dados do tutor ficam protegidos e o contato é intermediado pelo administrador.",
    path: "/microchip",
    image: "/logos/catech-icon.png",
    keywords: [
      "cadastro de microchip",
      "buscar microchip",
      "microchip animal",
      "microchip gato",
      "microchip cachorro",
      "animal perdido",
      "identificação animal",
    ],
  });
  return {
    title: seo.title,
    seo,
    structuredData: [
      organizationSchema(),
      {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "Cadastro Público de Microchip CaTech",
        url: seo.canonicalUrl,
        applicationCategory: "PetCareApplication",
        description: seo.description,
      },
    ],
    catBreeds: CAT_BREEDS,
    dogBreeds: DOG_BREEDS,
    statusLabels: STATUS_LABELS,
    formatMicrochip,
    dateInputValue,
    parseJsonArray,
    ownerAnimals: [],
    editingAnimal: null,
    searchResult: null,
    contactMicrochip: "",
    message: req.query.msg || null,
    error: req.query.error || null,
    ...extra,
  };
}

async function duplicateExists(prisma, microchip, currentId = null) {
  const publicRegistration = await prisma.publicMicrochipRegistration.findFirst({
    where: {
      microchip,
      ...(currentId ? { NOT: { id: currentId } } : {}),
    },
    select: { id: true },
  });

  if (publicRegistration) return true;

  const internalCat = await prisma.cat.findFirst({
    where: { microchip },
    select: { id: true },
  });

  return Boolean(internalCat);
}

function normalizePublicEntry(registration) {
  return {
    id: `public-${registration.id}`,
    source: "PUBLIC",
    href: `/admin/microchips/${registration.id}`,
    ownerName: registration.ownerName,
    ownerEmail: registration.ownerEmail,
    animalName: registration.animalName,
    microchip: registration.microchip,
    status: registration.status,
    updatedAt: registration.updatedAt || registration.createdAt,
  };
}

function normalizeInternalCatEntry(cat) {
  return {
    id: `cat-${cat.id}`,
    source: "INTERNAL",
    href: `/admin/microchips/gato/${cat.id}`,
    ownerName: cat.owner?.name || "Usuário não identificado",
    ownerEmail: cat.owner?.email || "",
    animalName: cat.name,
    microchip: cat.microchip,
    status: cat.deceased ? "DECEASED" : "ACTIVE",
    updatedAt: cat.createdAt,
  };
}

async function buildAdminMicrochipEntries(prisma, query) {
  const q = String(query || "").trim();
  const qDigits = normalizeMicrochip(q);
  const hasQuery = Boolean(q);

  const publicWhere = hasQuery
    ? {
        OR: [
          { ownerName: { contains: q, mode: "insensitive" } },
          { ownerEmail: { contains: q, mode: "insensitive" } },
          { microchip: { contains: qDigits || q } },
          { animalName: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const catWhere = hasQuery
    ? {
        microchip: { not: null },
        OR: [
          ...(qDigits ? [{ microchip: { contains: qDigits } }] : []),
          { name: { contains: q, mode: "insensitive" } },
          { owner: { is: { name: { contains: q, mode: "insensitive" } } } },
          { owner: { is: { email: { contains: q, mode: "insensitive" } } } },
        ],
      }
    : { microchip: { not: null } };

  const [publicRows, internalCats] = await Promise.all([
    prisma.publicMicrochipRegistration.findMany({
      where: publicWhere,
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.cat.findMany({
      where: catWhere,
      include: { owner: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return [
    ...publicRows.map(normalizePublicEntry),
    ...internalCats.map(normalizeInternalCatEntry),
  ].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

function registrationDataFromBody(body, passwordHash, photos) {
  const species = String(body.species || "").trim();
  const breed = species === "Outro" ? "" : String(body.breed || "").trim();

  return {
    microchip: normalizeMicrochip(body.microchip),
    animalName: String(body.animalName || "").trim(),
    sex: String(body.sex || "").trim() || null,
    species,
    breed: breed || null,
    customBreed: species === "Outro" ? String(body.customBreed || "").trim() || null : null,
    birthDate: parseDateValue(body.birthDate),
    color: String(body.color || "").trim() || null,
    size: String(body.size || "").trim() || null,
    ownerName: String(body.ownerName || "").trim(),
    ownerCpf: formatCpf(body.ownerCpf) || null,
    ownerBirthDate: parseDateValue(body.ownerBirthDate),
    ownerStreet: String(body.ownerStreet || "").trim() || null,
    ownerNumber: String(body.ownerNumber || "").trim() || null,
    ownerNeighborhood: String(body.ownerNeighborhood || "").trim() || null,
    ownerCity: String(body.ownerCity || "").trim() || null,
    ownerState: String(body.ownerState || "").trim() || null,
    ownerCep: String(body.ownerCep || "").replace(/\D/g, "") || null,
    ownerEmail: String(body.ownerEmail || "").trim().toLowerCase(),
    ownerEmailOptional: String(body.ownerEmailOptional || "").trim().toLowerCase() || null,
    phonesJson: JSON.stringify(readPhones(body)),
    photosJson: JSON.stringify(photos),
    ...(passwordHash ? { passwordHash } : {}),
  };
}

function validateRegistration(body, isEdit = false) {
  const microchip = normalizeMicrochip(body.microchip);
  const errors = [];

  if (!microchip || microchip.length !== 15) errors.push("O microchip deve ter exatamente 15 dígitos.");
  if (!String(body.animalName || "").trim()) errors.push("Informe o nome do animal.");
  if (!String(body.species || "").trim()) errors.push("Informe a espécie.");
  if (!String(body.ownerName || "").trim()) errors.push("Informe o nome completo do proprietário.");
  if (!String(body.ownerEmail || "").trim()) errors.push("Informe o e-mail principal.");
  if (!readPhones(body).length) errors.push("Informe ao menos um telefone.");

  if (!isEdit || body.password || body.passwordRepeat) {
    if (!body.password || String(body.password).length < 6) {
      errors.push("A senha deve ter ao menos 6 caracteres.");
    }
    if (body.password !== body.passwordRepeat) {
      errors.push("A repetição da senha não confere.");
    }
  }

  return errors;
}

async function sendRegistrationEmail(registration, plainPassword) {
  const phones = parseJsonArray(registration.phonesJson);
  const photos = parseJsonArray(registration.photosJson);

  await sendStatusEmail({
    to: registration.ownerEmail,
    subject: "Confirmação de cadastro de microchip",
    html: `
      <div style="font-family:Arial,sans-serif;color:#1f2933;line-height:1.6">
        <h2>Cadastro de microchip confirmado</h2>
        <p>Recebemos o cadastro do animal no sistema público de microchip do CaTech System.</p>
        <h3>Dados do animal</h3>
        <p><strong>Nome:</strong> ${escapeHtml(registration.animalName)}</p>
        <p><strong>Microchip:</strong> ${formatMicrochip(registration.microchip)}</p>
        <p><strong>Espécie:</strong> ${escapeHtml(registration.species)}</p>
        <p><strong>Raça:</strong> ${escapeHtml(registration.breed || registration.customBreed || "")}</p>
        <p><strong>Sexo:</strong> ${escapeHtml(registration.sex || "")}</p>
        <p><strong>Data de nascimento:</strong> ${escapeHtml(dateInputValue(registration.birthDate) || "")}</p>
        <p><strong>Cor:</strong> ${escapeHtml(registration.color || "")}</p>
        <p><strong>Tamanho:</strong> ${escapeHtml(registration.size || "")}</p>
        <h3>Proprietário</h3>
        <p><strong>Nome:</strong> ${escapeHtml(registration.ownerName)}</p>
        <p><strong>CPF:</strong> ${escapeHtml(registration.ownerCpf || "")}</p>
        <p><strong>Data de nascimento:</strong> ${escapeHtml(dateInputValue(registration.ownerBirthDate) || "")}</p>
        <p><strong>E-mail principal:</strong> ${escapeHtml(registration.ownerEmail)}</p>
        <p><strong>E-mail opcional:</strong> ${escapeHtml(registration.ownerEmailOptional || "")}</p>
        <p><strong>Telefones:</strong> ${escapeHtml(phones.map((phone) => `${phone.type}: ${phone.number}`).join(" | "))}</p>
        <p><strong>Endereço:</strong> ${escapeHtml([
          registration.ownerStreet,
          registration.ownerNumber,
          registration.ownerNeighborhood,
          registration.ownerCity,
          registration.ownerState,
          registration.ownerCep,
        ].filter(Boolean).join(", "))}</p>
        <p><strong>Fotos cadastradas:</strong> ${photos.length}</p>
        <h3>Acesso para edição</h3>
        <p>Entre em <a href="${escapeHtml(process.env.APP_URL || "https://catechsystem.com.br")}/microchip">Cadastro de Microchip</a> com:</p>
        <p><strong>Login:</strong> ${escapeHtml(registration.ownerEmail)}</p>
        <p><strong>Senha cadastrada:</strong> ${escapeHtml(plainPassword)}</p>
      </div>
    `,
  });
}

async function renderOwnerArea(req, prisma, extra = {}) {
  const ownerEmail = req.session.microchipOwnerEmail;
  const ownerAnimals = ownerEmail
    ? await prisma.publicMicrochipRegistration.findMany({
        where: { ownerEmail, status: { not: "DELETED" } },
        orderBy: { updatedAt: "desc" },
      })
    : [];

  return publicViewPayload(req, { ownerAnimals, ...extra });
}

module.exports = function publicMicrochipRouterFactory(prisma, requireAuth, requirePermission) {
  const router = express.Router();
  const upload = buildUpload();

  router.get("/microchip", async (req, res, next) => {
    try {
      let editingAnimal = null;
      if (req.query.edit && req.session.microchipOwnerEmail) {
        editingAnimal = await prisma.publicMicrochipRegistration.findFirst({
          where: {
            id: Number(req.query.edit),
            ownerEmail: req.session.microchipOwnerEmail,
            status: { not: "DELETED" },
          },
        });
      }

      res.render("microchip/index", await renderOwnerArea(req, prisma, { editingAnimal }));
    } catch (err) {
      next(err);
    }
  });

  router.post("/microchip/buscar", async (req, res, next) => {
    try {
      const microchip = normalizeMicrochip(req.body.microchip);
      if (microchip.length !== 15) {
        return res.render("microchip/index", await renderOwnerArea(req, prisma, {
          searchResult: "invalid",
          contactMicrochip: req.body.microchip || "",
          error: "Informe um número de microchip com 15 dígitos.",
        }));
      }

      const found = await prisma.publicMicrochipRegistration.findFirst({
        where: { microchip, status: { not: "DELETED" } },
        select: { id: true },
      });
      const internalCat = found ? null : await prisma.cat.findFirst({
        where: { microchip },
        select: { id: true },
      });

      return res.render("microchip/index", await renderOwnerArea(req, prisma, {
        searchResult: found || internalCat ? "found" : "not-found",
        contactMicrochip: microchip,
      }));
    } catch (err) {
      next(err);
    }
  });

  router.post("/microchip/contato", async (req, res, next) => {
    try {
      const microchip = normalizeMicrochip(req.body.microchip);
      const name = String(req.body.name || "").trim();
      const phone = formatPhone(req.body.phone);
      const email = String(req.body.email || "").trim();
      const subject = String(req.body.subject || "").trim();
      const message = String(req.body.message || "").trim();

      if (!microchip || !name || !phone || !email || !subject) {
        return res.redirect("/microchip?error=Preencha os dados de contato para enviar a mensagem.");
      }

      const registration = await prisma.publicMicrochipRegistration.findFirst({
        where: { microchip },
        select: { id: true, animalName: true, ownerName: true },
      });
      const internalCat = registration ? null : await prisma.cat.findFirst({
        where: { microchip },
        include: { owner: { select: { name: true, email: true } } },
      });

      await prisma.publicMicrochipContact.create({
        data: {
          registrationId: registration?.id || null,
          microchip,
          name,
          phone,
          email,
          subject,
          message,
        },
      });

      await sendStatusEmail({
        to: process.env.MICROCHIP_ADMIN_EMAIL || "contato@gatarina.com.br",
        subject: `Contato sobre microchip ${formatMicrochip(microchip)}`,
        html: `
          <div style="font-family:Arial,sans-serif;color:#1f2933;line-height:1.6">
            <h2>Contato sobre animal encontrado</h2>
            <p><strong>Microchip:</strong> ${formatMicrochip(microchip)}</p>
            <p><strong>Cadastro:</strong> ${
              registration
                ? escapeHtml(`${registration.animalName} - ${registration.ownerName}`)
                : internalCat
                  ? escapeHtml(`${internalCat.name} - ${internalCat.owner?.name || "cadastro interno"}`)
                  : "Não localizado na tabela pública"
            }</p>
            <p><strong>Nome:</strong> ${escapeHtml(name)}</p>
            <p><strong>Telefone:</strong> ${escapeHtml(phone)}</p>
            <p><strong>E-mail:</strong> ${escapeHtml(email)}</p>
            <p><strong>Assunto:</strong> ${escapeHtml(subject)}</p>
            <p><strong>Mensagem:</strong><br>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
          </div>
        `,
      });

      return res.redirect("/microchip?msg=Mensagem enviada ao administrador.");
    } catch (err) {
      next(err);
    }
  });

  router.post("/microchip/cadastrar", upload.array("photos", 5), async (req, res, next) => {
    try {
      const errors = validateRegistration(req.body);
      const microchip = normalizeMicrochip(req.body.microchip);

      if (!errors.length && await duplicateExists(prisma, microchip)) {
        errors.push("Este número de microchip já está cadastrado no sistema.");
      }

      if (errors.length) {
        return res.render("microchip/index", await renderOwnerArea(req, prisma, {
          error: errors.join(" "),
        }));
      }

      const photos = (req.files || []).map((file) => `/uploads/microchips/${file.filename}`);
      const passwordHash = await bcrypt.hash(req.body.password, 10);
      const registration = await prisma.publicMicrochipRegistration.create({
        data: registrationDataFromBody(req.body, passwordHash, photos),
      });

      try {
        await sendRegistrationEmail(registration, req.body.password);
      } catch (emailErr) {
        console.error("Erro ao enviar confirmação de microchip:", emailErr);
      }

      req.session.microchipOwnerEmail = registration.ownerEmail;
      return res.redirect("/microchip?msg=Cadastro realizado com sucesso.");
    } catch (err) {
      next(err);
    }
  });

  router.post("/microchip/login", async (req, res, next) => {
    try {
      const email = String(req.body.email || "").trim().toLowerCase();
      const password = String(req.body.password || "");
      const registration = await prisma.publicMicrochipRegistration.findFirst({
        where: { ownerEmail: email, status: { not: "DELETED" } },
        orderBy: { createdAt: "asc" },
      });

      if (!registration || !(await bcrypt.compare(password, registration.passwordHash))) {
        return res.redirect("/microchip?error=E-mail ou senha inválidos.");
      }

      req.session.microchipOwnerEmail = email;
      return res.redirect("/microchip?msg=Acesso liberado.");
    } catch (err) {
      next(err);
    }
  });

  router.post("/microchip/sair", (req, res) => {
    delete req.session.microchipOwnerEmail;
    res.redirect("/microchip");
  });

  router.post("/microchip/editar/:id", upload.array("photos", 5), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const current = await prisma.publicMicrochipRegistration.findFirst({
        where: { id, ownerEmail: req.session.microchipOwnerEmail || "" },
      });

      if (!current) return res.status(403).send("Acesso negado.");

      const errors = validateRegistration(req.body, true);
      const microchip = normalizeMicrochip(req.body.microchip);
      if (!errors.length && await duplicateExists(prisma, microchip, id)) {
        errors.push("Este número de microchip já está cadastrado no sistema.");
      }

      if (errors.length) {
        return res.render("microchip/index", await renderOwnerArea(req, prisma, {
          editingAnimal: current,
          error: errors.join(" "),
        }));
      }

      const currentPhotos = req.body.replacePhotos === "YES" ? [] : parseJsonArray(current.photosJson);
      const newPhotos = (req.files || []).map((file) => `/uploads/microchips/${file.filename}`);
      const photos = [...currentPhotos, ...newPhotos].slice(0, 5);
      const passwordHash = req.body.password ? await bcrypt.hash(req.body.password, 10) : null;
      const status = ["ACTIVE", "MISSING", "DECEASED", "DELETED"].includes(req.body.status)
        ? req.body.status
        : current.status;

      const data = {
        ...registrationDataFromBody(req.body, passwordHash, photos),
        status,
      };

      const updated = await prisma.publicMicrochipRegistration.update({
        where: { id },
        data,
      });

      req.session.microchipOwnerEmail = updated.ownerEmail;
      return res.redirect("/microchip?msg=Cadastro atualizado com sucesso.");
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/admin/microchips",
    requireAuth,
    requirePermission("admin.microchips"),
    async (req, res, next) => {
      try {
        const q = String(req.query.q || "").trim();
        const registrations = await buildAdminMicrochipEntries(prisma, q);

        res.render("microchip/admin-list", {
          user: req.user,
          currentPath: req.path,
          registrations,
          query: q,
          statusLabels: STATUS_LABELS,
          formatMicrochip,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/admin/microchips/:id",
    requireAuth,
    requirePermission("admin.microchips"),
    async (req, res, next) => {
      try {
        const registration = await prisma.publicMicrochipRegistration.findUnique({
          where: { id: Number(req.params.id) },
        });

        if (!registration) return res.status(404).send("Cadastro não encontrado.");
        const contacts = await prisma.publicMicrochipContact.findMany({
          where: { microchip: registration.microchip },
          orderBy: { createdAt: "desc" },
        });

        res.render("microchip/admin-detail", {
          user: req.user,
          currentPath: "/admin/microchips",
          registration: { ...registration, ownerCpf: formatCpf(registration.ownerCpf) },
          contacts,
          phones: parseJsonArray(registration.phonesJson),
          photos: parseJsonArray(registration.photosJson),
          statusLabels: STATUS_LABELS,
          formatMicrochip,
          dateInputValue,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/admin/microchips/gato/:id",
    requireAuth,
    requirePermission("admin.microchips"),
    async (req, res, next) => {
      try {
        const cat = await prisma.cat.findUnique({
          where: { id: Number(req.params.id) },
          include: {
            owner: { select: { id: true, name: true, email: true, role: true } },
            currentOwnerClient: true,
            litterKitten: { include: { litter: true } },
          },
        });

        if (!cat) return res.status(404).send("Gato não encontrado.");

        const contacts = cat.microchip
          ? await prisma.publicMicrochipContact.findMany({
              where: { microchip: cat.microchip },
              orderBy: { createdAt: "desc" },
            })
          : [];

        res.render("microchip/admin-cat-detail", {
          user: req.user,
          currentPath: "/admin/microchips",
          cat,
          contacts,
          statusLabels: STATUS_LABELS,
          formatMicrochip,
          dateInputValue,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
};
