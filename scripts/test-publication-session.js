const assert = require("node:assert/strict");
const { test } = require("node:test");
const { PrismaSessionStore, loadSessionSecret } = require("../utils/prismaSessionStore");
const { publish } = require("./publish");

function database() {
  const rows = new Map();
  let setting;
  return {
    webSession: {
      findUnique: async ({ where }) => rows.get(where.sid) || null,
      upsert: async ({ where, create, update }) => rows.set(where.sid, rows.has(where.sid) ? { ...rows.get(where.sid), ...update } : create),
      deleteMany: async ({ where }) => {
        if (where.sid) rows.delete(where.sid);
      },
      updateMany: async ({ where, data }) => { if (rows.has(where.sid)) Object.assign(rows.get(where.sid), data); },
      findMany: async ({ where }) => [...rows.values()].filter((row) => row.expiresAt > where.expiresAt.gt),
    },
    systemSetting: { upsert: async ({ create }) => { setting ||= create; return setting; } },
  };
}

function call(store, method, ...args) {
  return new Promise((resolve, reject) => store[method](...args, (err, value) => err ? reject(err) : resolve(value)));
}

test("sessão e chave sobrevivem à recriação do servidor", async () => {
  const prisma = database();
  const first = new PrismaSessionStore(prisma, { cleanupIntervalMs: 0 });
  const secret = await loadSessionSecret(prisma, {});
  await call(first, "set", "session-id", { userId: 7, userRole: "PREMIUM", cookie: { expires: new Date(Date.now() + 86400000) } });
  first.close();
  const restarted = new PrismaSessionStore(prisma, { cleanupIntervalMs: 0 });
  assert.equal((await call(restarted, "get", "session-id")).userId, 7);
  assert.equal(await loadSessionSecret(prisma, {}), secret);
  assert.ok(secret.length >= 64);
  assert.equal(await loadSessionSecret(prisma, { SESSION_SECRET: "configured-secret" }), "configured-secret");
});

test("sessões expiradas são rejeitadas e logout remove a sessão persistida", async () => {
  const store = new PrismaSessionStore(database(), { cleanupIntervalMs: 0 });
  await call(store, "set", "expired", { userId: 7, cookie: { expires: new Date(Date.now() - 1000) } });
  assert.equal(await call(store, "get", "expired"), null);
  await call(store, "set", "active", { userId: 8, cookie: {} });
  assert.equal((await call(store, "all")).length, 1);
  await call(store, "destroy", "active");
  assert.equal(await call(store, "get", "active"), null);
  assert.equal((await call(store, "all")).length, 0);
});

test("touch renova validade sem sobrescrever dados e erros do banco são propagados", async () => {
  const prisma = database();
  const store = new PrismaSessionStore(prisma, { cleanupIntervalMs: 0 });
  await call(store, "set", "id", { userId: 7, cookie: { expires: new Date(Date.now() - 1000) } });
  await call(store, "touch", "id", { userId: 999, cookie: { expires: new Date(Date.now() + 10000) } });
  assert.equal((await call(store, "get", "id")).userId, 7);
  prisma.webSession.findUnique = async () => { throw new Error("database unavailable"); };
  await assert.rejects(call(store, "get", "id"), /database unavailable/);
});

test("publicação valida antes de commit e push, sem executar migrações locais", () => {
  const calls = [];
  publish("26.11-002", (command, args) => {
    calls.push([command, args]);
    return args.includes("--cached") ? "server.js\n" : "";
  });
  const commitIndex = calls.findIndex(([, args]) => args[0] === "commit");
  const testIndex = calls.findIndex(([, args]) => args[0] === "--test");
  assert.ok(testIndex >= 0 && testIndex < commitIndex);
  assert.deepEqual(calls[commitIndex][1], ["commit", "-m", "26.11-002"]);
  assert.deepEqual(calls.at(-1), ["git", ["push"]]);
  assert.ok(!calls.some(([, args]) => args.includes("migrate")));
});

test("falha na validação impede commit e push; nova tentativa pode enviar commit existente", () => {
  const calls = [];
  assert.throws(() => publish("teste", (command, args) => {
    calls.push(args);
    if (args[0] === "--test") throw new Error("test failure");
    return "";
  }), /test failure/);
  assert.ok(!calls.some((args) => ["add", "commit", "push"].includes(args[0])));
  calls.length = 0;
  publish("teste", (command, args) => { calls.push(args); return ""; });
  assert.ok(!calls.some((args) => args[0] === "commit"));
  assert.deepEqual(calls.at(-1), ["push"]);
});
