const { test } = require("node:test");
const assert = require("node:assert");
const v = require("../../src/lib/validate");

test("sanitizeString limpa e limita tamanho", () => {
  assert.strictEqual(v.sanitizeString("  abc  "), "abc");
  assert.strictEqual(v.sanitizeString("x".repeat(500), 10), "x".repeat(10));
  assert.strictEqual(v.sanitizeString(null), "");
  assert.strictEqual(v.sanitizeString(undefined), "");
  assert.strictEqual(v.sanitizeString(42), "42");
});

test("sanitizeOptionalString retorna null para vazio", () => {
  assert.strictEqual(v.sanitizeOptionalString("  "), null);
  assert.strictEqual(v.sanitizeOptionalString("ok"), "ok");
});

test("toFiniteNumber aceita apenas números finitos", () => {
  assert.strictEqual(v.toFiniteNumber("10.5"), 10.5);
  assert.strictEqual(v.toFiniteNumber(7), 7);
  assert.ok(Number.isNaN(v.toFiniteNumber("abc")));
  assert.ok(Number.isNaN(v.toFiniteNumber(null)));
  assert.ok(Number.isNaN(v.toFiniteNumber(undefined)));
});

test("toPositiveNumber usa fallback", () => {
  assert.strictEqual(v.toPositiveNumber("5", null), 5);
  assert.strictEqual(v.toPositiveNumber("0", 10), 10);
  assert.strictEqual(v.toPositiveNumber("-3", 10), 10);
  assert.strictEqual(v.toPositiveNumber("abc", 10), 10);
});

test("isObjectId valida hex de 24 chars", () => {
  assert.ok(v.isObjectId("507f1f77bcf86cd799439011"));
  assert.ok(!v.isObjectId("507f1f77"));
  assert.ok(!v.isObjectId("zzzf1f77bcf86cd799439011"));
});

test("parseBody rejeita JSON inválido e corpos grandes", () => {
  const ok = v.parseBody({ body: JSON.stringify({ a: 1 }) });
  assert.ok(ok.value && ok.value.a === 1);
  assert.ok(v.parseBody({ body: "not json" }).error);
  assert.ok(v.parseBody({ body: null }).error);
  assert.ok(v.parseBody({ body: '"apenas string"' }).error);
  const big = JSON.stringify({ data: "x".repeat(100) });
  assert.ok(v.parseBody({ body: big }, 50).error);
});

test("missingFields lista campos ausentes", () => {
  assert.deepStrictEqual(v.missingFields({ a: 1, b: "x" }, ["a", "b", "c"]), ["c"]);
  assert.deepStrictEqual(v.missingFields({ a: "  " }, ["a"]), ["a"]);
  assert.deepStrictEqual(v.missingFields({ a: 0 }, ["a"]), []);
});
