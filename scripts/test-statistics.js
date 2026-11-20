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
  assert.equal(row.kittenCount, 3);
  assert.equal(row.kittensPerLitter, 3);
  assert.equal(row.maleCount, 1);
  assert.equal(row.femaleCount, 2);
  assert.equal(row.deaths, 1);
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
  assert.equal(result.rows[1].kittensPerLitter, null);
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
  assert.equal(row.kittensPerLitter, 5);
  assert.equal(row.maleCount, null);
  assert.equal(row.femaleCount, null);
  assert.equal(row.unknownCount, 20);
  assert.equal(row.deaths, null);
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

test("mortalidade anual usa vivos mais óbitos, inclusive 100%, sem dividir por zero", () => {
  const { rows } = buildStatistics({ history: [
    { year: 2025, litterCount: 10, kittenCount: 80, maleDeathCount: 12, femaleDeathCount: 8, revenueCents: 0, expenseCents: 0 },
    { year: 2024, litterCount: 1, kittenCount: 0, maleDeathCount: 2, femaleDeathCount: 3, revenueCents: 0, expenseCents: 0 },
    { year: 2023, litterCount: 0, kittenCount: 0, maleDeathCount: 0, femaleDeathCount: 0, revenueCents: 0, expenseCents: 0 },
    { year: 2022, litterCount: 1, kittenCount: 5, maleDeathCount: null, femaleDeathCount: 1, revenueCents: 0, expenseCents: 0 },
    { year: 2021, litterCount: 1, kittenCount: 5, maleDeathCount: 0, femaleDeathCount: 0, revenueCents: 0, expenseCents: 0 },
  ] }, now);
  const year = (value) => rows.find((row) => row.year === value);
  assert.equal(year(2025).bornCount, 100);
  assert.equal(year(2025).deaths, 20);
  assert.equal(year(2025).mortalityPercent, 20);
  assert.equal(year(2024).mortalityPercent, 100);
  assert.equal(year(2023).mortalityPercent, null);
  assert.equal(year(2022).bornCount, null);
  assert.equal(year(2022).mortalityPercent, null);
  assert.equal(year(2021).mortalityPercent, 0);
});

test("óbitos automáticos vêm apenas das ninhadas, sem somar flags ou gatos avulsos", () => {
  const { rows } = buildStatistics({ litters: [
    { litterBirthDate: "2025-03-01", litterCount: 6, deadCount: 2, deadAtBirthCount: 1, deadAfterBirthCount: 1,
      deadAtBirthMaleCount: 1, deadAfterBirthFemaleCount: 1,
      kittens: Array.from({ length: 6 }, () => ({ deceased: true, kittenCat: { deceased: true } })) },
    { litterBirthDate: "2025-04-01", litterCount: 4, deadCount: null, deadAtBirthCount: 1, deadAfterBirthCount: 1 },
  ], standaloneKittens: [{ birthDate: "2025-01-01", deceased: true }] }, now);
  assert.equal(rows[0].deaths, 4);
  assert.equal(rows[0].maleDeathCount, 1);
  assert.equal(rows[0].femaleDeathCount, 1);
  assert.equal(rows[0].bornCount, 14);
  assert.equal(rows[0].mortalityPercent, 4 / 14 * 100);
});

test("valida anos anteriores, quantidades inteiras e valores monetários brasileiros", () => {
  const valid = { year: "2025", litterCount: "10", kittenCount: "40", revenue: "1.234,56", expense: "100,5" };
  assert.deepEqual(parseHistoryInput(valid, now), { year: 2025, litterCount: 10, kittenCount: 40, maleCount: null, femaleCount: null, maleDeathCount: null, femaleDeathCount: null, revenueCents: 123456, expenseCents: 10050 });
  const withDeaths = parseHistoryInput({ ...valid, maleDeathCount: "0", femaleDeathCount: "4" }, now);
  assert.equal(withDeaths.maleDeathCount, 0);
  assert.equal(withDeaths.femaleDeathCount, 4);
  for (const patch of [{ year: "2026" }, { year: "2027" }, { year: "1899" }, { kittenCount: "-1" },
    { litterCount: "1.5" }, { expense: "1.23" }, { revenue: "1e3" }, { expense: "" },
    { revenue: "21.474.836,48" }, { kittenCount: "2147483648" },
    { maleDeathCount: "-1" }, { femaleDeathCount: "1.5" }, { femaleDeathCount: "2147483648" }]) {
    assert.throws(() => parseHistoryInput({ ...valid, ...patch }, now));
  }
});

function makeRouter(prisma) {
  const pass = (req, res, next) => next();
  const permission = (key) => (req, res, next) => userCan(req.session.userRole, key) ? next() : res.status(403).send("Negado");
  return require("../modules/statistics")(prisma, pass, permission);
}

test("novo ano calcula o total por sexo; edição preserva o total e rejeita somas diferentes", () => {
  const body = { year: "2025", litterCount: "5", kittenCount: "999", maleCount: "8", femaleCount: "12", revenue: "200", expense: "100" };
  const created = parseHistoryInput(body, now);
  assert.equal(created.kittenCount, 20);
  assert.equal(created.maleCount, 8);
  const edited = parseHistoryInput(body, now, { kittenCount: 20 });
  assert.equal(edited.kittenCount, 20);
  assert.throws(() => parseHistoryInput({ ...body, femaleCount: "11" }, now, { kittenCount: 20 }), /total já registrado: 20/);
  assert.throws(() => parseHistoryInput({ ...body, femaleCount: "" }, now), /Preencha machos e fêmeas juntos/);
  assert.throws(() => parseHistoryInput({ ...body, maleCount: "-1" }, now));
  assert.throws(() => parseHistoryInput({ ...body, maleCount: "2147483647", femaleCount: "1" }, now));
  const row = buildStatistics({ history: [{ ...edited, maleDeathCount: 0, femaleDeathCount: 0 }] }, now).rows[0];
  assert.equal(row.maleCount, 8);
  assert.equal(row.femaleCount, 12);
  assert.equal(row.unknownCount, 0);
});

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
  prisma.statisticsHistory.findUnique = async () => null;
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

test("renderiza a página e os oito gráficos, inclusive com histórico vazio", async () => {
  const stats = buildStatistics({}, now);
  const locals = {
    user: { role: "PREMIUM", name: "Teste", email: "teste@example.com" }, access: buildAccessContext("PREMIUM"),
    currentPath: "/reports/statistics", stats, rows: stats.rows, selectedYear: null,
    history: [], historyForm: {}, error: null, saved: false, removed: false, formatMoney,
    number: (value) => value === null ? "Sem dados" : String(value),
  };
  const html = await ejs.renderFile(path.join(__dirname, "../views/reports/statistics.ejs"), locals);
  assert.equal((html.match(/data-chart=/g) || []).length, 8);
  assert.ok(html.includes("Nenhum ano anterior informado"));
  assert.ok(html.includes("/reports/statistics/history"));
  // Exercise the actual chart code with a small DOM, catching errors in chart creation.
  class Node {
    constructor() { this.children = []; this.style = {}; this.dataset = {}; this.value = ""; }
    setCustomValidity(message) { this.validationMessage = message; }
    setAttribute(key, value) { this[key] = value; }
    getAttribute(key) { return this[key]; }
    appendChild(child) { this.children.push(child); }
    append(...children) { this.children.push(...children); }
    addEventListener() {}
  }
  const charts = ["kittens", "monthly-kittens", "deaths", "mortality", "finance", "monthly-finance", "per-kitten", "per-litter"].map((key) => {
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
  assert.equal(charts[6].children[0].textContent, "Sem dados para este gráfico. Consulte a tabela para os demais indicadores.");
  assert.equal(charts[7].children[0].textContent, "Sem dados para este gráfico. Consulte a tabela para os demais indicadores.");
});

test("Editar carrega valores antigos e novos, preservando os demais dados ao completar óbitos", async () => {
  const entry = { id: 3, year: 2024, litterCount: 5, kittenCount: 20,
    revenueCents: 123456, expenseCents: 98765, maleDeathCount: null, femaleDeathCount: 0 };
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { value: "", listeners: {},
      addEventListener(event, callback) { this.listeners[event] = callback; },
      scrollIntoView() {}, focus() {}, setCustomValidity(message) { this.validationMessage = message; },
    });
    return nodes.get(id);
  }
  const button = node("edit");
  button.dataset = { editHistory: "3" };
  node("statistics-data").textContent = JSON.stringify({ rows: [], history: [entry] });
  const document = { getElementById: node,
    querySelectorAll: (selector) => selector === "[data-edit-history]" ? [button] : [],
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/js/statistics.js"), "utf8"), { document, Intl });
  button.listeners.click();
  assert.equal(node("history-form").open, true);
  assert.equal(node("history-year").value, 2024);
  assert.equal(node("history-kittenCount").value, 20);
  assert.equal(node("history-maleDeathCount").value, "");
  assert.equal(node("history-femaleDeathCount").value, 0);
  assert.equal(node("history-revenue").value, "1.234,56");
  assert.equal(node("history-kittenCount").readOnly, true);
  node("history-maleCount").value = "8";
  node("history-femaleCount").value = "11";
  node("history-femaleCount").listeners.input();
  assert.equal(node("history-kittenCount").value, 20);
  assert.ok(node("history-femaleCount").validationMessage.includes("20"));
  node("history-femaleCount").value = "12";
  node("history-femaleCount").listeners.input();
  assert.equal(node("history-femaleCount").validationMessage, "");
  node("history-year").value = "2023";
  node("history-year").listeners.input();
  node("history-maleCount").value = "5";
  node("history-maleCount").listeners.input();
  assert.equal(node("history-kittenCount").value, 17);
  node("history-year").value = "2024";
  node("history-maleCount").value = "8";
  node("history-year").listeners.input();
  assert.equal(node("history-kittenCount").value, 20);
  node("history-maleDeathCount").value = "2";
  const body = Object.fromEntries(["year", "litterCount", "kittenCount", "maleCount", "femaleCount", "maleDeathCount", "femaleDeathCount", "revenue", "expense"]
    .map((field) => [field, node(`history-${field}`).value]));
  let update;
  const router = makeRouter({ statisticsHistory: { findUnique: async () => entry, upsert: async (query) => { update = query; } } });
  await invoke(router, "/reports/statistics/history", "post", { session: { userId: 7, userRole: "PREMIUM" }, body }, { redirect() {} });
  assert.equal(update.update.maleCount, 8);
  assert.equal(update.update.femaleCount, 12);
  assert.equal(update.update.maleDeathCount, 2);
  assert.equal(update.update.femaleDeathCount, 0);
  assert.equal(update.update.kittenCount, entry.kittenCount);
  assert.equal(update.update.litterCount, entry.litterCount);
  assert.equal(update.update.revenueCents, entry.revenueCents);
  assert.equal(update.update.expenseCents, entry.expenseCents);
});
