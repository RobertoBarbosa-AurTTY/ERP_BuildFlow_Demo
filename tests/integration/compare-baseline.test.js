// Teste de integração: compara as respostas atuais da API com o baseline capturado.
// Requer MONGODB_URI no .env. Cria um usuário de teste temporário e o remove ao final.
// Uso: npm run test:integration
const { test, after } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });
const b = require("../../scripts/baseline");

after(async () => {
  const db = await b.getDb().catch(() => null);
  if (db) await b.removeTestUser(db);
  const { closeClient } = require("../../src/lib/mongodb");
  await closeClient();
});

test("captura/compara baseline dos endpoints", { timeout: 120000 }, async (t) => {
  const db = await b.getDb();
  const token = await b.login(db);
  const results = await b.runAllCaptures(token);

  for (const [name, current] of Object.entries(results)) {
    await t.test(`endpoint ${name}`, () => {
      const expected = b.loadBaseline(name);
      assert.ok(expected, `Sem baseline para ${name} — rode: npm run capture-baseline`);
      const issues = b.compareResponses(
        { status: current.status, body: current.body },
        expected,
        current.mode === "strict" ? "strict" : "subset",
      );
      assert.deepStrictEqual(
        issues,
        [],
        `Divergências em ${name}: ${JSON.stringify(issues.slice(0, 10))}`,
      );
    });
  }
});

test("normalização é estável e oculta campos voláteis", () => {
  const input = {
    _id: "507f1f77bcf86cd799439011",
    createdAt: "2026-01-01T10:00:00.000Z",
    total: 10.005,
    items: [{ id: "507f1f77bcf86cd799439011", name: "a" }],
  };
  const n1 = b.normalize(input);
  const n2 = b.normalize({ ...input, _id: "507f1f77bcf86cd799439012", createdAt: "2026-02-02T10:00:00.000Z", total: 10.01 });
  assert.deepStrictEqual(n1, n2);
});

test("comparação detecta mudança de chave e de tipo", () => {
  const base = { status: 200, body: { data: [{ name: "x", qty: 1 }] } };
  const broken = { status: 200, body: { data: [{ name: "x" }] } };
  const issues = b.compareResponses(broken, base, "structural");
  assert.ok(issues.length > 0);
  assert.ok(issues.some((i) => i.path.includes("qty")));
});

test("comparação tolera reordenação de arrays", () => {
  const base = { status: 200, body: { list: ["b", "a"] } };
  const same = { status: 200, body: { list: ["a", "b"] } };
  assert.deepStrictEqual(b.compareResponses(same, base, "strict"), []);
});

test("comparação detecta status code diferente", () => {
  const base = { status: 200, body: { ok: true } };
  const broken = { status: 401, body: { ok: true } };
  const issues = b.compareResponses(broken, base, "structural");
  assert.ok(issues.some((i) => i.path === "status"));
});
