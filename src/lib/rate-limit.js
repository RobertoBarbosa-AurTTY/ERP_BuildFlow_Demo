// Rate limiting para ambiente serverless usando MongoDB (TTL index).
// Em serverless não há memória compartilhada; a coleção rate_limits com
// índice TTL em expiresAt funciona em qualquer tier do Atlas.
const { getDb } = require("./mongodb");

const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const DEFAULT_MAX = 10;

let indexEnsured = false;

async function ensureIndex(db) {
  if (indexEnsured) return;
  await db
    .collection("rate_limits")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    .catch(() => {});
  indexEnsured = true;
}

function getClientIp(event) {
  const headers = event.headers || {};
  const fwd = headers["x-forwarded-for"] || headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return headers["client-ip"] || headers["cf-connecting-ip"] || "local";
}

// Conta atômica de tentativas. Retorna { allowed, remaining, retryAfterMs }.
async function checkRateLimit(key, options = {}) {
  const { max = DEFAULT_MAX, windowMs = DEFAULT_WINDOW_MS } = options;
  const db = await getDb();
  await ensureIndex(db);

  const col = db.collection("rate_limits");
  const now = Date.now();

  // Janela deslizante: reinicia se o registro estiver fora da janela
  await col.deleteMany({ key, windowStart: { $lt: new Date(now - windowMs) } });

  const res = await col.findOneAndUpdate(
    { key },
    {
      $inc: { count: 1 },
      $setOnInsert: { windowStart: new Date(now) },
      $set: { expiresAt: new Date(now + windowMs) },
    },
    { upsert: true, returnDocument: "after" },
  );

  const count = res.value ? res.value.count : 1;
  if (count > max) {
    return { allowed: false, remaining: 0, retryAfterMs: windowMs };
  }
  return { allowed: true, remaining: max - count, retryAfterMs: 0 };
}

// Conveniência: se excedeu o limite, retorna a resposta 429 pronta (ou null).
async function rateLimit(event, route, options) {
  const ip = getClientIp(event);
  const result = await checkRateLimit(`${ip}:${route}`, options);
  if (!result.allowed) {
    return {
      statusCode: 429,
      headers: { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) },
      body: JSON.stringify({ message: "Muitas tentativas. Aguarde alguns minutos." }),
    };
  }
  return null;
}

module.exports = { checkRateLimit, rateLimit, getClientIp };
