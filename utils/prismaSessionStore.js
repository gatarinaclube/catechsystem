const session = require("express-session");
const crypto = require("crypto");

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

class PrismaSessionStore extends session.Store {
  constructor(prisma, { cleanupIntervalMs = 60 * 60 * 1000 } = {}) {
    super();
    this.prisma = prisma;
    if (cleanupIntervalMs) {
      this.cleanupTimer = setInterval(() => {
        prisma.webSession.deleteMany({ where: { expiresAt: { lte: new Date() } } })
          .catch((err) => console.error("Erro ao limpar sessões expiradas:", err.message));
      }, cleanupIntervalMs);
      this.cleanupTimer.unref();
    }
  }

  expiresAt(data) {
    return data.cookie?.expires ? new Date(data.cookie.expires) : new Date(Date.now() + SESSION_TTL_MS);
  }

  get(sid, callback) {
    this.prisma.webSession.findUnique({ where: { sid } }).then((row) => {
      callback(null, row && row.expiresAt > new Date() ? row.data : null);
    }, callback);
  }

  set(sid, data, callback = () => {}) {
    const values = { data: JSON.parse(JSON.stringify(data)), expiresAt: this.expiresAt(data) };
    this.prisma.webSession.upsert({ where: { sid }, create: { sid, ...values }, update: values })
      .then(() => callback(null), callback);
  }

  touch(sid, data, callback = () => {}) {
    this.prisma.webSession.updateMany({ where: { sid }, data: { expiresAt: this.expiresAt(data) } })
      .then(() => callback(null), callback);
  }

  destroy(sid, callback = () => {}) {
    this.prisma.webSession.deleteMany({ where: { sid } }).then(() => callback(null), callback);
  }

  all(callback) {
    this.prisma.webSession.findMany({ where: { expiresAt: { gt: new Date() } }, select: { data: true } })
      .then((rows) => callback(null, rows.map((row) => row.data)), callback);
  }

  close() { clearInterval(this.cleanupTimer); }
}

async function loadSessionSecret(prisma, env = process.env) {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  // Stable across restarts and instances, even when no environment secret was configured.
  const key = "auth.sessionSecret";
  const result = await prisma.systemSetting.upsert({
    where: { key }, create: { key, value: crypto.randomBytes(48).toString("hex") }, update: {},
  });
  if (!result.value) throw new Error("Chave de sessão não configurada.");
  return result.value;
}

function createPersistentSessionMiddleware(prisma) {
  const store = new PrismaSessionStore(prisma);
  let pending;
  return async (req, res, next) => {
    try {
      if (!pending) pending = loadSessionSecret(prisma).then((secret) => session({
        secret, store, resave: false, saveUninitialized: false, rolling: true,
        cookie: { httpOnly: true, sameSite: "lax", secure: "auto", maxAge: SESSION_TTL_MS },
      }));
      const middleware = await pending;
      middleware(req, res, next);
    } catch (err) {
      pending = null;
      next(err);
    }
  };
}

module.exports = { PrismaSessionStore, loadSessionSecret, createPersistentSessionMiddleware, SESSION_TTL_MS };
