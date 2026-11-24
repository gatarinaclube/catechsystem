const assert = require("node:assert/strict");
const { test } = require("node:test");
const { PassThrough } = require("node:stream");
const { once } = require("node:events");
const { inflateSync } = require("node:zlib");
const path = require("node:path");
const ejs = require("ejs");
const { PDFDocument, PDFRawStream } = require("pdf-lib");
const { buildAccessContext } = require("../utils/access");

function fixture() {
  const calls = [];
  const parcels = [
    { number: 1, date: "2025-12-10", refundDate: "2026-11-24", paid: true, canceled: true, amountCents: 100000, paymentAccount: "Conta da parcela" },
    { number: 2, date: "2026-11-01", refundDate: "2026-11-24", paid: false, canceled: true, amountCents: 900000 },
    { number: 3, date: "2026-11-01", refundDate: "2026-11-24", paid: true, canceled: false, amountCents: 900000 },
    { number: 4, date: "2026-11-01", paid: true, canceled: true, amountCents: 900000 },
    { number: 5, date: "2026-11-01", refundDate: "2026-10-24", paid: true, canceled: true, amountCents: 900000 },
  ];
  const revenue = { id: 10, installments: 5, paymentAccount: "Conta da venda",
    client: { fullName: "Cliente <Teste>" }, kitten: { name: "Filhote Teste" },
    note: "Observação original", get parcelDataJson() { return JSON.stringify(parcels); },
  };
  const data = {
    quickLaunchEntry: [{ id: 1, competenceDate: new Date("2026-11-02"), amountCents: 10000, paymentMethod: "Conta da parcela", category: "Ração" }],
    financialTransfer: [{ id: 2, transferDate: new Date("2026-11-03"), amountCents: 20000, fromAccount: "Conta da parcela", toAccount: "Outra conta" }],
    revenueEntry: [revenue], financialAccountSetting: [], quickLaunchOption: [{ name: "Conta da parcela" }, { name: "Conta da venda" }],
  };
  const prisma = Object.fromEntries(Object.entries(data).map(([model, rows]) => [model, {
    findMany: async (query) => {
      calls.push([model, query]);
      if (model === "quickLaunchEntry" && query.where.paymentMethod) return rows.filter((row) => row.paymentMethod === query.where.paymentMethod);
      if (model === "financialTransfer" && query.where.fromAccount) return rows.filter((row) => row.fromAccount === query.where.fromAccount);
      return rows;
    },
  }]));
  const pass = (req, res, next) => next();
  const router = require("../modules/reports")(prisma, pass, () => pass);
  const request = (query = {}) => ({ session: { userId: 7, userRole: "PREMIUM" }, user: { name: "Teste", role: "PREMIUM" }, query: { month: "2026-11", ...query } });
  const handler = (url) => router.stack.find((layer) => layer.route?.path === url).route.stack.at(-1).handle;
  async function screen(query) {
    let view;
    await handler("/reports/expenses")(request(query), { render: (template, locals) => { view = { template, ...locals }; } });
    return view;
  }
  return { screen, request, handler, calls, parcels };
}

test("Despesas inclui estorno na data e conta da parcela, com observação e total", async () => {
  const { screen, calls } = fixture();
  const view = await screen();
  assert.equal(view.rows.length, 3);
  const refund = view.rows.find((row) => row.category === "Estorno de venda");
  assert.equal(refund.amountCents, 100000);
  assert.equal(refund.paymentMethod, "Conta da parcela");
  assert.equal(refund.dateLabel, "24/11/2026");
  assert.equal(refund.supplier, "Cliente <Teste>");
  assert.ok(refund.note.includes("Estorno do valor por cancelamento da venda."));
  assert.ok(refund.note.includes("Observação original"));
  assert.ok(refund.note.includes("Venda #10. Parcela 1 / 5."));
  assert.equal(view.totalLabel.replace(/\s/g, ""), "R$1.300,00");
  for (const [model, query] of calls) {
    if (model !== "quickLaunchOption") assert.equal(query.where.ownerId, 7);
  }
  const html = await ejs.renderFile(path.join(__dirname, "../views/reports/expenses.ejs"), { ...view, access: buildAccessContext("PREMIUM") });
  assert.ok(html.includes("Estorno do valor por cancelamento da venda."));
  assert.ok(html.includes("Cliente &lt;Teste&gt;"));
});

test("filtros de conta e período respeitam o estorno e a conta alternativa da parcela", async () => {
  const { screen, parcels } = fixture();
  assert.equal((await screen({ account: "Conta da venda" })).rows.length, 0);
  assert.equal((await screen({ account: "Conta da parcela" })).rows.filter((row) => row.category === "Estorno de venda").length, 1);
  const outside = await screen({ periodType: "custom", startDate: "2026-11-01", endDate: "2026-11-23" });
  assert.equal(outside.rows.filter((row) => row.category === "Estorno de venda").length, 0);
  delete parcels[0].paymentAccount;
  assert.equal((await screen({ account: "Conta da venda" })).rows[0].paymentMethod, "Conta da venda");
});

test("consultas repetidas não duplicam estorno e desfazer o cancelamento remove a saída", async () => {
  const { screen, parcels } = fixture();
  assert.equal((await screen()).rows.length, 3);
  assert.equal((await screen()).rows.length, 3);
  parcels[0].canceled = false;
  assert.equal((await screen()).rows.length, 2);
});

test("PDF de Despesas contém o mesmo estorno, observação e total da tela", async () => {
  const { handler, request } = fixture();
  const res = new PassThrough();
  const chunks = [];
  const headers = {};
  res.setHeader = (key, value) => { headers[key] = value; };
  res.on("data", (chunk) => chunks.push(chunk));
  const finished = once(res, "end");
  await handler("/reports/expenses/pdf")(request(), res);
  await finished;
  assert.equal(headers["Content-Type"], "application/pdf");
  const pdf = await PDFDocument.load(Buffer.concat(chunks));
  assert.ok(pdf.getPageCount() > 0);
  const text = pdf.context.enumerateIndirectObjects().flatMap(([, object]) => {
    if (!(object instanceof PDFRawStream)) return [];
    const stream = inflateSync(object.getContents()).toString("latin1");
    return [...stream.matchAll(/<([0-9a-f]+)>/gi)].map((match) => Buffer.from(match[1], "hex").toString("latin1"));
  }).join("");
  assert.ok(text.includes("Estorno de venda"));
  assert.ok(text.includes("Estorno do valor por cancelamento da venda."));
  assert.ok(text.includes("1.300,00"));
});
