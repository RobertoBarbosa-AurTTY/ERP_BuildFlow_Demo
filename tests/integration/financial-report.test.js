// Fluxo de caixa projetado / DRE contra o banco real (somente leitura).
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

test("financial-report mês: estrutura e consistência", async () => {
  const res = await b.callHandler("financial-report", "GET", { period: "month", tzOffset: "-180" }, null, token);
  assert.strictEqual(res.status, 200);
  const body = res.body;

  assert.strictEqual(body.period, "month");
  assert.ok(Array.isArray(body.cashFlow));
  assert.strictEqual(body.cashFlow.length, 30, "projeção de 30 dias");

  for (const day of body.cashFlow) {
    for (const key of ["entradaRealizada", "saidaRealizada", "entradaPrevista", "saidaPrevista", "saldoDia", "saldoAcumulado"]) {
      assert.strictEqual(typeof day[key], "number", `cashFlow.${key} deve ser número`);
      assert.ok(Number.isFinite(day[key]));
    }
  }

  // saldo acumulado = histórico real (seed) + soma acumulada dos saldos diários projetados
  const seed = body.cashFlow[0].saldoAcumulado - body.cashFlow[0].saldoDia;
  let acc = seed;
  for (const day of body.cashFlow) {
    acc += day.saldoDia;
    assert.ok(Math.abs(acc - day.saldoAcumulado) < 0.02, "saldo acumulado consistente");
  }

  // history: dias passados com dados, realizados, contínuos com a projeção
  assert.ok(Array.isArray(body.history), "history deve ser array");
  assert.ok(body.history.length > 0, "history não pode ser vazio");
  for (const day of body.history) {
    assert.strictEqual(typeof day.saldoDia, "number");
    assert.strictEqual(typeof day.saldoAcumulado, "number");
    assert.ok(day.entradaRealizada > 0 || day.saidaRealizada > 0 || day.isToday, "history só com dias que têm dados");
  }
  const lastHist = body.history[body.history.length - 1];
  assert.strictEqual(lastHist.isToday, true, "histórico termina em hoje");
  assert.strictEqual(lastHist.dia, body.cashFlow[0].dia, "histórico e projeção começam no mesmo dia");
  assert.ok(Math.abs(lastHist.saldoAcumulado - body.cashFlow[0].saldoAcumulado) < 0.02, "histórico contínuo com a projeção");

  for (const key of ["receitaBruta", "deducoes", "receitaLiquida", "cmv", "lucroBruto", "despesasPagas", "outrosRecebimentos", "resultadoOperacional"]) {
    assert.strictEqual(typeof body.dre[key], "number", `dre.${key} deve ser número`);
    assert.ok(Number.isFinite(body.dre[key]));
  }
  // receitaLiquida = receitaBruta - deducoes
  assert.ok(Math.abs((body.dre.receitaBruta - body.dre.deducoes) - body.dre.receitaLiquida) < 0.02);
});

test("financial-report dia: período de 1 dia", async () => {
  const res = await b.callHandler("financial-report", "GET", { period: "day", tzOffset: "0" }, null, token);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.period, "day");
  const start = new Date(res.body.startDate);
  const end = new Date(res.body.endDate);
  assert.strictEqual(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
});

test("financial-report cacheia (2ª chamada igual)", async () => {
  const r1 = await b.callHandler("financial-report", "GET", { period: "day", tzOffset: "-180" }, null, token);
  const r2 = await b.callHandler("financial-report", "GET", { period: "day", tzOffset: "-180" }, null, token);
  assert.deepStrictEqual(r1.body, r2.body, "cache deve retornar payload idêntico");
});
