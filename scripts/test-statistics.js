const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ejs = require("ejs");
const { buildStatistics, parseHistoryInput, formatMoney } = require("../utils/statistics");
const { buildAccessContext, userCan } = require("../utils/access");
const now = new Date("2026-11-20T12:00:00Z");

test("conta filhotes vinculados uma vez, avulsos, sexo e óbitos sem repetir totais", () => {
  const { rows, undatedLitters, undatedKittens } = buildStatistics({
    litters: [{ litterBirthDate: "2025-01-01", litterCount: 3, maleCount: 2, femaleCount: 1,
      deadCount: 1, deadAtBirthCount: 1, kittens: [{ sex: "M", deceased: true, kittenCat: { deceased: true } }, { sex: "F" }, { sex: "F" }] },
      { litterBirthDate: null }],
    standaloneKittens: [{ birthDate: "2025-12-31", gender: "M", deceased: true }, { birthDate: null }],
  }, now);
  const row = rows[0];
  assert.equal(row.litterCount, 1);
  assert.equal(row.kittenCount, 4);
  assert.equal(row.maleCount, 2);
  assert.equal(row.femaleCount, 2);
  assert.equal(row.deaths, 2);
  assert.equal(undatedLitters, 1);
  assert.equal(undatedKittens, 1);
});

test("calcula receitas pagas e despesas por competência, exclui parcelas em aberto, canceladas e futuras", () => {
  const result = buildStatistics({
    revenues: [{ parcelDataJson: JSON.stringify([
      { date: "2025-12-31", paid: true, amountCents: 10000 },
      { date: "2026-01-01", paid: true, amountCents: 20000 },
      { date: "2026-02-01", paid: false, amountCents: 30000 },
      { date: "2026-02-02", paid: true, canceled: true, amountCents: 40000 },
      { date: "2026-12-01", paid: true, amountCents: 50000 },
    ]) }, { parcelDataJson: "null" }, { parcelDataJson: "inválido" }],
    expenses: [{ competenceDate: "2025-01-01", amountCents: 3000 },
      { competenceDate: "2026-03-01", amountCents: 11000 },
      { competenceDate: "2026-12-01", amountCents: 99999 }],
  }, now);
  assert.equal(result.rows[0].revenueCents, 10000);
  assert.equal(result.rows[0].expenseCents, 3000);
  assert.equal(result.rows[1].revenueCents, 20000);
  assert.equal(result.rows[1].expenseCents, 11000);
  assert.equal(result.rows[1].expensePerMonthCents, 1000);
  assert.equal(result.rows[1].costPerKittenCents, null);
});

test("histórico substitui os totais do mesmo ano e não inventa sexo ou óbitos", () => {
  const result = buildStatistics({
    litters: [{ litterBirthDate: "2024-01-01", litterCount: 5, maleCount: 3, femaleCount: 2, deadCount: 1 }],
    history: [{ year: 2024, litterCount: 4, kittenCount: 20, revenueCents: 120000, expenseCents: 60000 },
      { year: 2023, litterCount: 2, kittenCount: 10, revenueCents: 100000, expenseCents: 50000 }],
  }, now);
  const row = result.rows.find((entry) => entry.year === 2024);
  assert.equal(row.litterCount, 4);
  assert.equal(row.kittenCount, 20);
  assert.equal(row.maleCount, 0);
  assert.equal(row.femaleCount, 0);
  assert.equal(row.unknownCount, 20);
  assert.equal(row.deaths, 1);
  assert.equal(row.revenuePerMonthCents, 10000);
  assert.equal(row.costPerKittenCents, 3000);
  assert.equal(row.revenuePerKittenCents, 6000);
  assert.equal(result.rows[0].deaths, null);
  assert.equal(result.rows.find((entry) => entry.year === 2025).kittenCount, 0);
});

test("médias usam 12 meses ou os meses do ano atual, respeitando o fuso de São Paulo", () => {
  const result = buildStatistics({ standaloneKittens: [
    { birthDate: "2025-01-01", gender: "M" },
    { birthDate: "2026-01-01", gender: "F" },
  ] }, new Date("2026-02-01T01:00:00Z"));
  assert.equal(result.current.month, 1);
  assert.equal(result.rows[0].kittensPerMonth, 1 / 12);
  assert.equal(result.rows[1].kittensPerMonth, 1);
});

test("valida anos anteriores, quantidades inteiras e valores monetários brasileiros", () => {
  const valid = { year: "2025", litterCount: "10", kittenCount: "40", revenue: "1.234,56", expense: "100,5" };
  assert.deepEqual(parseHistoryInput(valid, now), { year: 2025, litterCount: 10, kittenCount: 40, revenueCents: 123456, expenseCents: 10050 });
  for (const patch of [{ year: "2026" }, { year: "2027" }, { year: "1899" }, { kittenCount: "-1" },
    { litterCount: "1.5" }, { expense: "1.23" }, { revenue: "1e3" }, { expense: "" },
    { revenue: "21.474.836,48" }, { kittenCount: "2147483648" }]) {
    assert.throws(() => parseHistoryInput({ ...valid, ...patch }, now));
  }
});

function makeRouter(prisma) {
  const pass = (req, res, next) => next();
  const permission = (key) => (req, res, next) => userCan(req.session.userRole, key) ? next() : res.status(403).send("Negado");
  return require("../modules/statistics")(prisma, pass, permission);
}

async function invoke(router, routePath, method, req, res) {
  const route = router.stack.find((layer) => layer.route?.path === routePath && layer.route.methods[method]).route;
  async function step(index) {
    const layer = route.stack[index];
    if (layer) return layer.handle(req, res, () => step(index + 1));
  }
  return step(0);
}

test("Premium tem acesso, outros planos são barrados, consultas e alterações isolam o proprietário", async () => {
  const reads = [];
  let upsert, deletion, view;
  const prisma = Object.fromEntries(["litter", "cat", "revenueEntry", "quickLaunchEntry", "statisticsHistory"].map((model) => [model, {
    findMany: async (query) => { reads.push([model, query]); return []; },
  }]));
  prisma.statisticsHistory.upsert = async (query) => { upsert = query; };
  prisma.statisticsHistory.deleteMany = async (query) => { deletion = query; };
  const router = makeRouter(prisma);
  let status;
  const res = { status(value) { status = value; return this; }, set() {}, send() {}, redirect() {}, render(template, data) { view = data; } };
  for (const userRole of ["BASIC", "MASTER", "ASSOCIADO_A", "ASSOCIADO_B"]) {
    await invoke(router, "/reports/statistics", "get", { session: { userId: 7, userRole }, query: {} }, res);
    assert.equal(status, 403);
  }
  assert.equal(reads.length, 0);
  for (const userRole of ["PREMIUM", "ASSOCIADO_PREMIUM", "ADMIN"]) {
    await invoke(router, "/reports/statistics", "get", { session: { userId: 7, userRole }, query: {}, user: {} }, res);
    assert.equal(status, 200);
  }
  assert.ok(reads.every(([, query]) => query.where.ownerId === 7));
  assert.deepEqual(reads.find(([model]) => model === "cat")[1].where.litterKitten, { is: null });
  assert.ok(view.rows.length);
  await invoke(router, "/reports/statistics/history", "post", { session: { userId: 7, userRole: "PREMIUM" }, body: {
    ownerId: "999", year: "2000", litterCount: "2", kittenCount: "8", revenue: "200", expense: "100",
  } }, res);
  assert.equal(upsert.create.ownerId, 7);
  assert.deepEqual(upsert.where.ownerId_year, { ownerId: 7, year: 2000 });
  await invoke(router, "/reports/statistics/history/:id/delete", "post", { session: { userId: 7, userRole: "PREMIUM" }, params: { id: "999" } }, res);
  assert.deepEqual(deletion.where, { id: 999, ownerId: 7 });
});

test("renderiza a página e os seis gráficos, inclusive com histórico vazio", async () => {
  const stats = buildStatistics({}, now);
  const locals = {
    user: { role: "PREMIUM", name: "Teste", email: "teste@example.com" }, access: buildAccessContext("PREMIUM"),
    currentPath: "/reports/statistics", stats, rows: stats.rows, selectedYear: null,
    history: [], historyForm: {}, error: null, saved: false, removed: false, formatMoney,
    number: (value) => value === null ? "Sem dados" : String(value),
  };
  const html = await ejs.renderFile(path.join(__dirname, "../views/reports/statistics.ejs"), locals);
  assert.equal((html.match(/data-chart=/g) || []).length, 6);
  assert.ok(html.includes("Nenhum ano anterior informado"));
  assert.ok(html.includes("/reports/statistics/history"));
  // Exercise the actual chart code with a small DOM, catching errors in chart creation.
  class Node {
    constructor() { this.children = []; this.style = {}; this.dataset = {}; }
    setAttribute(key, value) { this[key] = value; }
    getAttribute(key) { return this[key]; }
    appendChild(child) { this.children.push(child); }
    append(...children) { this.children.push(...children); }
    addEventListener() {}
  }
  const charts = ["kittens", "monthly-kittens", "deaths", "finance", "monthly-finance", "per-kitten"].map((key) => {
    const node = new Node(); node.dataset.chart = key; return node;
  });
  const json = new Node(); json.textContent = JSON.stringify({ rows: stats.rows, history: [] });
  const document = {
    getElementById(id) { return id === "statistics-data" ? json : new Node(); },
    createElementNS: () => new Node(), createElement: () => new Node(), createTextNode: () => new Node(),
    querySelectorAll: (selector) => selector === "[data-chart]" ? charts : [],
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/js/statistics.js"), "utf8"), { document, Intl, window: {} });
  assert.ok(charts.every((chart) => chart.children.length > 0));
  assert.equal(charts[5].children[0].textContent, "Sem dados para este gráfico. Consulte a tabela para os demais indicadores.");
});
