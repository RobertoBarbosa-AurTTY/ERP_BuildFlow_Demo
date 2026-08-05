// Drill-down do DRE (financial-detail) contra o banco real (somente leitura).
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });
const b = require("../../scripts/baseline");

let db;
let token;

before(async () => {
  db = await b.getDb();
  token = await b.login(db);
});

after(async () => {
  const { closeClient } = require("../../src/lib/mongodb");
  await closeClient();
});

const LINES = ["receita", "liquida", "deducoes", "cmv", "despesas", "outros"];

for (const line of LINES) {
  test(`financial-detail linha ${line}: estrutura consistente`, async () => {
    const res = await b.callHandler("financial-detail", "GET", { line, period: "month", tzOffset: "-180" }, null, token);
    assert.strictEqual(res.status, 200);
    const body = res.body;

    assert.strictEqual(body.line, line);
    assert.ok(Array.isArray(body.items), "items deve ser array");
    assert.strictEqual(typeof body.grandTotal, "number", "grandTotal deve ser número");
    assert.ok(Number.isFinite(body.grandTotal));
    assert.strictEqual(typeof body.totalCount, "number");

    const p = body.pagination;
    assert.ok(p, "pagination deve existir");
    assert.strictEqual(p.page, 1);
    assert.ok(p.limit >= 1);
    assert.strictEqual(p.total, body.totalCount);
    assert.strictEqual(typeof p.hasMore, "boolean");
    assert.ok(Number.isInteger(p.totalPages) && p.totalPages >= 0, "totalPages inteiro e não negativo");
  });
}

test("financial-detail linha inválida retorna 400", async () => {
  const res = await b.callHandler("financial-detail", "GET", { line: "nao-existe", period: "month" }, null, token);
  assert.strictEqual(res.status, 400);
});

test("financial-detail paginação: página 2 funciona", async () => {
  const res = await b.callHandler("financial-detail", "GET", { line: "receita", period: "month", tzOffset: "-180", page: "2", limit: "10" }, null, token);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.pagination.page, 2);
  assert.strictEqual(res.body.pagination.limit, 10);
  assert.ok(res.body.items.length <= 10);
});

test("financial-detail soma bate com a linha do DRE (deduções)", async () => {
  const [rep, det] = await Promise.all([
    b.callHandler("financial-report", "GET", { period: "month", tzOffset: "-180" }, null, token),
    b.callHandler("financial-detail", "GET", { line: "deducoes", period: "month", tzOffset: "-180", limit: "all" }, null, token),
  ]);
  assert.strictEqual(rep.status, 200);
  assert.strictEqual(det.status, 200);
  assert.ok(Math.abs(det.body.grandTotal - rep.body.dre.deducoes) < 0.02, "grandTotal = deduções do DRE");
});
