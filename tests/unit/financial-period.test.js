// Testes unitários do cálculo de período/fuso financeiro.
// Garante que a janela do período, o "hoje" e o agrupamento por dia
// respeitam o fuso do cliente (ex.: Brasil, UTC-3 => tzOffset=-180).
const { test } = require("node:test");
const assert = require("node:assert");
const { dayKey, getPeriodRange } = require("../../src/lib/financial-period");

test("dayKey converte instante UTC para a data local correta (UTC-3)", () => {
  // 2026-08-14 15:00Z = 12:00 no Brasil (UTC-3)
  assert.strictEqual(dayKey(new Date("2026-08-14T15:00:00.000Z"), -180), "2026-08-14");
  // 2026-08-14 01:00Z = 22:00 de 13/08 no Brasil
  assert.strictEqual(dayKey(new Date("2026-08-14T01:00:00.000Z"), -180), "2026-08-13");
});

test("getPeriodRange: hoje e meia-noite local corretos às 12:00 BRT", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-14T15:00:00.000Z") });
  try {
    const r = getPeriodRange({ period: "month", tzOffset: -180 });
    assert.strictEqual(r.todayKey, "2026-08-14", "isToday deve ser a data local real");
    assert.strictEqual(r.todayStart.toISOString(), "2026-08-14T03:00:00.000Z", "meia-noite local em UTC");
  } finally {
    t.mock.timers.reset();
  }
});

test("getPeriodRange: hoje correto também no fim do dia BRT (19:00)", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-14T22:00:00.000Z") });
  try {
    const r = getPeriodRange({ period: "month", tzOffset: -180 });
    assert.strictEqual(r.todayKey, "2026-08-14");
  } finally {
    t.mock.timers.reset();
  }
});

test("getPeriodRange mês: janela alinhada à meia-noite local (sem pegar/perder 6h do dia 31)", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-14T15:00:00.000Z") });
  try {
    const r = getPeriodRange({ period: "month", tzOffset: -180 });
    assert.strictEqual(r.rangeStart.toISOString(), "2026-08-01T03:00:00.000Z");
    assert.strictEqual(r.rangeEnd.toISOString(), "2026-09-01T03:00:00.000Z");
    assert.strictEqual(r.rangeStart.toISOString().slice(0, 10), "2026-08-01");
    assert.strictEqual(r.rangeEnd.toISOString().slice(0, 10), "2026-09-01");
  } finally {
    t.mock.timers.reset();
  }
});

test("getPeriodRange dia: janela de 24h iniciando na meia-noite local", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-14T15:00:00.000Z") });
  try {
    const r = getPeriodRange({ period: "day", tzOffset: -180 });
    assert.strictEqual(r.rangeStart.toISOString(), "2026-08-14T03:00:00.000Z");
    assert.strictEqual(r.rangeEnd.toISOString(), "2026-08-15T03:00:00.000Z");
    assert.strictEqual(r.rangeEnd.getTime() - r.rangeStart.getTime(), 24 * 60 * 60 * 1000);
  } finally {
    t.mock.timers.reset();
  }
});

test("getPeriodRange dia com data selecionada respeita o fuso", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-14T15:00:00.000Z") });
  try {
    const r = getPeriodRange({ period: "day", tzOffset: -180, selectedDate: "2026-08-10" });
    assert.strictEqual(r.rangeStart.toISOString(), "2026-08-10T03:00:00.000Z");
    assert.strictEqual(r.rangeStart.toISOString().slice(0, 10), "2026-08-10");
  } finally {
    t.mock.timers.reset();
  }
});

test("getPeriodRange semana: cobre os últimos 7 dias locais", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-14T15:00:00.000Z") });
  try {
    const r = getPeriodRange({ period: "week", tzOffset: -180 });
    assert.strictEqual(r.rangeStart.toISOString(), "2026-08-08T03:00:00.000Z");
    assert.strictEqual(r.rangeEnd.toISOString(), "2026-08-15T03:00:00.000Z");
  } finally {
    t.mock.timers.reset();
  }
});

test("getPeriodRange UTC (tzOffset=0) e fuso positivo seguem a mesma regra", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-14T15:00:00.000Z") });
  try {
    const utc = getPeriodRange({ period: "month", tzOffset: 0 });
    assert.strictEqual(utc.todayKey, "2026-08-14");
    assert.strictEqual(utc.todayStart.toISOString(), "2026-08-14T00:00:00.000Z");
    assert.strictEqual(utc.rangeStart.toISOString(), "2026-08-01T00:00:00.000Z");

    const east = getPeriodRange({ period: "month", tzOffset: 180 });
    assert.strictEqual(east.todayKey, "2026-08-14");
    assert.strictEqual(east.todayStart.toISOString(), "2026-08-13T21:00:00.000Z", "meia-noite local em UTC");
    assert.strictEqual(east.rangeStart.toISOString(), "2026-07-31T21:00:00.000Z");
  } finally {
    t.mock.timers.reset();
  }
});