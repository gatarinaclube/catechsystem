const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const ejs = require("ejs");
const { PDFDocument } = require("pdf-lib");
const mailer = require("../utils/mailer");
const emails = [];
let failingRecipient = null;
mailer.sendStatusEmail = async (message) => {
  emails.push(message);
  if (message.to === failingRecipient) throw new Error("SMTP indisponível");
};
const helpers = require("../utils/associationApplication");
const declaration = require("../utils/associationDeclaration");

function applicationFixture() {
  const user = {
    id: 42, name: "Maria <Teste>", email: "maria@example.com", cpf: "000.000.000-00",
    country: "Brasil", clubs: "Gatarina (Pedido de Associação)", hasFifeCattery: "YES",
    fifeCatteryName: "Gatil Teste", password: "NEVER_INCLUDE_PASSWORD", emailVerificationToken: "SECRET_TOKEN",
  };
  return { user, application: { id: 7, userId: 42, submittedAt: new Date("2026-10-23T15:30:00Z"), ...helpers.createApplicationSnapshot(user) } };
}

test("aceite exige as duas declarações enviadas pelo formulário", () => {
  for (const body of [{}, { agree1: "on" }, { agree2: "on" }, { agree1: "false", agree2: "on" }, { agree1: ["on"], agree2: "on" }]) {
    assert.equal(helpers.hasAssociationConsent(body), false);
  }
  assert.equal(helpers.hasAssociationConsent({ agree1: "on", agree2: "on" }), true);
});

test("snapshot preserva dados e aceite e exclui credenciais", async () => {
  const { user, application } = applicationFixture();
  user.name = "Nome alterado";
  assert.equal(application.data.name, "Maria <Teste>");
  assert.equal(application.declaration.acceptances.length, 2);
  assert.ok(application.declaration.acceptances.every((item) => item.accepted));
  assert.equal(application.data.password, undefined);
  assert.equal(application.data.emailVerificationToken, undefined);
  const pdf = await helpers.generateApplicationPdf(application);
  assert.ok((await PDFDocument.load(pdf)).getPageCount() > 0);
  const html = await ejs.renderFile(path.join(__dirname, "../views/users/association-application.ejs"), {
    application, userDetail: user, ...helpers,
  });
  assert.ok(html.includes("23/10/2026, 12:30:00 (Brasília)"));
  assert.ok(html.includes("Maria &lt;Teste&gt;"));
  assert.ok(html.includes("/users/42/association.pdf"));
  assert.ok(!html.includes("NEVER_INCLUDE_PASSWORD"));
});

test("falha de uma cópia não impede a outra e a tentativa seguinte envia só a pendente", async () => {
  const { application } = applicationFixture();
  const prisma = { associationApplication: { update: async ({ data }) => Object.assign(application, data) } };
  emails.length = 0;
  failingRecipient = application.data.email;
  await helpers.sendApplicationCopies(prisma, application);
  assert.deepEqual(emails.map((message) => message.to), [application.data.email, "contato@gatarina.com.br"]);
  assert.equal(application.memberCopySentAt, null);
  assert.equal(application.memberCopyError, "SMTP indisponível");
  assert.ok(application.clubCopySentAt instanceof Date);
  assert.ok(emails.every((message) => message.attachments[0].content.subarray(0, 4).toString() === "%PDF"));
  assert.ok(emails[0].html.includes("Maria &lt;Teste&gt;"));
  assert.ok(!emails[0].html.includes("SECRET_TOKEN"));
  failingRecipient = null;
  emails.length = 0;
  await helpers.sendApplicationCopies(prisma, application);
  assert.deepEqual(emails.map((message) => message.to), [application.data.email]);
  assert.ok(application.memberCopySentAt instanceof Date);
  assert.equal(application.memberCopyError, null);
});

test("registro rejeita aceite ausente e grava solicitação junto com o usuário", async () => {
  let register;
  let createArgs;
  const source = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const context = {
    app: { use() {}, get() {}, post(route, handler) { if (route === "/register") register = handler; } },
    associationDeclaration: declaration,
    hasAssociationConsent: helpers.hasAssociationConsent,
    createApplicationSnapshot: helpers.createApplicationSnapshot,
    sendApplicationCopies: async () => {},
    normalizeCountry: (value) => value,
    documentLabelForCountry: () => "CPF/CNPJ",
    isValidDocumentForCountry: () => true,
    formatPhone: (value) => value,
    formatDocumentForCountry: (value) => value,
    bcrypt: { hash: async () => "HASH" },
    createEmailVerificationToken: () => ({ tokenHash: "HASH_TOKEN", token: "TOKEN", expiresAt: new Date() }),
    ROLES: { ASSOCIADO_A: "ASSOCIADO_A" },
    prisma: { user: { findUnique: async () => null, create: async (args) => { createArgs = args; return { id: 42, ...args.data }; } } },
    notifyNewUser: async () => {}, notifyUserRegistrationConfirmation: async () => {}, sendEmailVerification: async () => {}, console,
  };
  vm.runInNewContext(source.slice(source.indexOf('// ---------- CADASTRO DE USUÁRIO ----------'), source.indexOf('app.get("/associacao/pagamento"')), context);
  let status = 200;
  const res = { status(value) { status = value; return this; }, render() {}, send(message) { throw new Error(message); } };
  await register({ body: {} }, res);
  assert.equal(status, 400);
  assert.equal(createArgs, undefined);
  await register({ body: { name: "Maria", cpf: "00000000000", email: "MARIA@example.com", password: "abc", confirmPassword: "abc", agree1: "on", agree2: "on", country: "Brasil" } }, res);
  assert.equal(createArgs.data.associationApplication.create.data.email, "maria@example.com");
  assert.equal(createArgs.data.associationApplication.create.data.password, undefined);
  assert.equal(createArgs.include.associationApplication, true);
});

test("PDF e reenvio são exclusivos do administrador", async () => {
  const { application } = applicationFixture();
  let calls = 0;
  const prisma = { associationApplication: { findUnique: async () => { calls++; return application; } } };
  const pass = (req, res, next) => next();
  const router = require("../modules/users")(prisma, pass, () => pass);
  for (const routePath of ["/users/:id/association.pdf", "/users/:id/association/resend"]) {
    const route = router.stack.find((layer) => layer.route?.path === routePath).route;
    const handler = route.stack.at(-1).handle;
    let status = 200;
    const res = { status(value) { status = value; return this; }, send() {}, set() {} };
    await handler({ session: { userRole: "ASSOCIADO_A" }, params: { id: "42" } }, res);
    assert.equal(status, 403);
    assert.equal(calls, 0);
    await handler({ session: { userRole: "ADMIN" }, params: { id: "abc" } }, res);
    assert.equal(status, 400);
    assert.equal(calls, 0);
  }
  const route = router.stack.find((layer) => layer.route?.path === "/users/:id/association.pdf").route;
  const headers = {};
  let pdf;
  await route.stack.at(-1).handle({ session: { userRole: "ADMIN" }, params: { id: "42" } }, {
    set(key, value) { headers[key] = value; }, send(value) { pdf = value; },
  });
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(headers["Content-Type"], "application/pdf");
  assert.ok((await PDFDocument.load(pdf)).getPageCount() > 0);
});

test("formulário publica os mesmos textos armazenados e usuários antigos ficam sem aceite presumido", async () => {
  const html = await ejs.renderFile(path.join(__dirname, "../views/register.ejs"), { error: null, success: null, associationDeclaration: declaration });
  assert.ok(html.includes('name="agree1" required'));
  assert.ok(html.includes('name="agree2" required'));
  for (const text of declaration.acceptances) assert.ok(html.includes(text));
  const legacy = await ejs.renderFile(path.join(__dirname, "../views/users/association-application.ejs"), { application: null });
  assert.ok(legacy.includes("não possuem comprovante de aceite"));
  assert.ok(!legacy.includes("association.pdf"));
});
