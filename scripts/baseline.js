// Infraestrutura de testes de comparação (baseline) para as Netlify Functions.
// Chama os handlers in-process (sem servidor) e normaliza/compra respostas.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { isDeepStrictEqual } = require("util");
const bcrypt = require("bcryptjs");

const BASELINE_DIR = path.join(__dirname, "..", "tests", "baseline");

const TEST_USER = {
  name: "Baseline Tester",
  email: "baseline-tester@buildflow.local",
  role: "Admin",
  password: () => "bf-test-" + Math.random().toString(36).slice(2, 10),
};

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Normalização determinística: IDs/datas voláteis viram placeholders,
// números são arredondados para centavos, arrays ordenados por conteúdo.
function normalize(value) {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value)) return String(value);
    return Math.round(value * 100) / 100;
  }
  if (t === "string") {
    if (OBJECT_ID_RE.test(value)) return "«oid»";
    if (ISO_RE.test(value)) return "«iso»";
    if (DATE_ONLY_RE.test(value)) return "«date»";
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((v) => normalize(v))
      .sort((a, b) => {
        const sa = JSON.stringify(a);
        const sb = JSON.stringify(b);
        return sa < sb ? -1 : sa > sb ? 1 : 0;
      });
  }
  if (t === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = normalize(value[key]);
    }
    return out;
  }
  return value;
}

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

// Comparação com dois modos:
//  - strict:  valores normalizados devem ser idênticos (dados estáveis)
//  - subset:  (default do structural) todo elemento/chave do baseline deve
//             existir no atual com o mesmo formato; elementos EXTRAS são
//             permitidos (dados novos de produção não contam como regressão)
function compareResponses(actual, expected, mode = "strict") {
  const issues = [];

  if (actual.status !== expected.status) {
    issues.push({ path: "status", expected: expected.status, actual: actual.status });
  }

  const a = normalize(actual.body);
  const e = normalize(expected.body);

  function walk(aVal, eVal, p) {
    if (aVal === null || eVal === null || aVal === undefined || eVal === undefined) {
      if (aVal !== eVal) issues.push({ path: p, expected: eVal, actual: aVal });
      return;
    }
    if (Array.isArray(eVal) || Array.isArray(aVal)) {
      if (!Array.isArray(aVal) || !Array.isArray(eVal)) {
        issues.push({ path: p, expected: typeOf(eVal), actual: typeOf(aVal) });
        return;
      }
      if (mode === "subset") {
        // Cada elemento esperado deve existir no atual (novos dados são OK)
        const used = new Set();
        for (const eItem of eVal) {
          const idx = aVal.findIndex((aItem, i) => {
            if (used.has(i)) return false;
            return JSON.stringify(aItem) === JSON.stringify(eItem);
          });
          if (idx === -1) {
            issues.push({ path: `${p}[?]`, expected: eItem, actual: "<não encontrado>" });
          } else {
            used.add(idx);
          }
        }
      } else {
        if (aVal.length !== eVal.length) {
          issues.push({ path: p + ".length", expected: eVal.length, actual: aVal.length });
        }
        const len = Math.min(aVal.length, eVal.length);
        for (let i = 0; i < len; i++) walk(aVal[i], eVal[i], `${p}[${i}]`);
      }
      return;
    }
    if (typeof eVal === "object" && typeof aVal === "object") {
      for (const k of Object.keys(eVal)) {
        if (!(k in aVal)) {
          issues.push({ path: `${p}.${k}`, expected: "<presente>", actual: "<ausente>" });
        } else {
          walk(aVal[k], eVal[k], p ? `${p}.${k}` : k);
        }
      }
      if (mode === "strict") {
        for (const k of Object.keys(aVal)) {
          if (!(k in eVal)) {
            issues.push({ path: `${p}.${k}`, expected: "<ausente>", actual: "<presente>" });
          }
        }
      }
      return;
    }
    if (!isDeepStrictEqual(aVal, eVal)) {
      issues.push({ path: p || "<raiz>", expected: eVal, actual: aVal });
    }
  }

  walk(a, e, "");
  return issues;
}

async function getDb() {
  const { getDb } = require("../src/lib/mongodb");
  return getDb();
}

async function ensureTestUser(db) {
  const users = db.collection("users");
  const password = TEST_USER.password();
  const hashed = await bcrypt.hash(password, 10);
  await users.updateOne(
    { email: TEST_USER.email },
    {
      $set: {
        name: TEST_USER.name,
        role: "Admin",
        permissions: ["all"],
        password: hashed,
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
  return password;
}

async function removeTestUser(db) {
  const users = db.collection("users");
  await users.deleteOne({ email: TEST_USER.email });
}

async function login(db) {
  const password = await ensureTestUser(db);
  const { handler } = require("../netlify/functions/auth-login");
  const res = await handler({
    httpMethod: "POST",
    headers: {},
    body: JSON.stringify({ email: TEST_USER.email, password }),
  });
  const body = JSON.parse(res.body);
  if (res.statusCode !== 200 || !body.token) {
    throw new Error(`Falha no login do baseline: ${res.statusCode} ${res.body}`);
  }
  return body.token;
}

async function callHandler(handlerName, method, query, body, authToken) {
  const mod = require(`../netlify/functions/${handlerName}`);
  if (typeof mod.handler !== "function") {
    throw new Error(`Function ${handlerName} não exporta handler`);
  }
  const headers = {};
  if (authToken) headers.cookie = `token=${authToken}`;
  const event = {
    httpMethod: method,
    headers,
    queryStringParameters: query || {},
    body: body ? JSON.stringify(body) : null,
  };
  const res = await mod.handler(event, {});
  let parsedBody = null;
  try {
    parsedBody = JSON.parse(res.body);
  } catch {
    parsedBody = res.body;
  }
  return { status: res.statusCode, body: parsedBody };
}

const ENDPOINTS = [
  { name: "auth-me", handler: "auth-me", mode: "structural" },
  { name: "products-list", handler: "products", query: { limit: "5" }, mode: "structural" },
  { name: "products-search", handler: "products", query: { search: "cimento", limit: "5" }, mode: "strict" },
  { name: "sales-list", handler: "sales", query: { limit: "3" }, mode: "structural" },
  { name: "sales-summary", handler: "sales", query: { summary: "true" }, mode: "structural" },
  { name: "payables-list", handler: "accounts-payable", query: { limit: "all" }, mode: "structural" },
  { name: "payables-summary", handler: "accounts-payable", query: { summary: "true" }, mode: "structural" },
  { name: "dashboard-month", handler: "dashboard", query: { period: "month", tzOffset: "-180" }, mode: "structural" },
  { name: "dashboard-day", handler: "dashboard", query: { period: "day", tzOffset: "-180" }, mode: "structural" },
  { name: "categories", handler: "categories", mode: "strict" },
  { name: "units", handler: "units", mode: "strict" },
  { name: "warehouse-addresses", handler: "warehouse-addresses", mode: "strict" },
  { name: "stock-movements", handler: "stock-movements", query: { limit: "5" }, mode: "structural" },
  { name: "caixas", handler: "caixas", query: { limit: "5" }, mode: "structural" },
  { name: "retiradas", handler: "retiradas-caixa", query: { limit: "5" }, mode: "structural" },
  { name: "financial-month", handler: "financial-report", query: { period: "month", tzOffset: "-180" }, mode: "structural" },
  { name: "customers-list", handler: "customers", query: { limit: "5" }, mode: "structural" },
  { name: "receivables-list", handler: "accounts-receivable", query: { limit: "all" }, mode: "structural" },
  { name: "receivables-summary", handler: "accounts-receivable", query: { summary: "true" }, mode: "structural" },
];

function baselinePath(name) {
  return path.join(BASELINE_DIR, `${name}.json`);
}

function saveBaseline(name, response) {
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
  const payload = { capturedAt: new Date().toISOString(), response };
  fs.writeFileSync(baselinePath(name), JSON.stringify(payload, null, 2));
}

function loadBaseline(name) {
  const file = baselinePath(name);
  if (!fs.existsSync(file)) return null;
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  return payload.response;
}

async function runAllCaptures(authToken) {
  const results = {};
  for (const ep of ENDPOINTS) {
    const res = await callHandler(ep.handler, "GET", ep.query, null, authToken);
    results[ep.name] = { ...res, mode: ep.mode };
  }
  return results;
}
module.exports = {
  BASELINE_DIR,
  TEST_USER,
  normalize,
  compareResponses,
  getDb,
  ensureTestUser,
  removeTestUser,
  login,
  callHandler,
  ENDPOINTS,
  saveBaseline,
  loadBaseline,
  runAllCaptures,
};
