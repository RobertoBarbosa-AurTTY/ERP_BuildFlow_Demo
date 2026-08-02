// Fluxo de clientes e contas a receber contra o banco real (com limpeza).
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });
const b = require("../../scripts/baseline");

let db;
let token;
let customerId;
let receivableIds = [];
const SUFFIX = Date.now();

before(async () => {
  db = await b.getDb();
  token = await b.login(db);
});

after(async () => {
  const { ObjectId } = require("mongodb");
  const ids = receivableIds.map((id) => ObjectId.createFromHexString(id));
  if (ids.length) {
    await db.collection("accounts_receivable").deleteMany({ _id: { $in: ids } });
    await db.collection("logs").deleteMany({ entityId: { $in: ids }, entity: "accounts_receivable" });
  }
  if (customerId) {
    await db.collection("customers").deleteOne({ _id: ObjectId.createFromHexString(customerId) });
  }
  const { closeClient } = require("../../src/lib/mongodb");
  await closeClient();
});

test("cria cliente", async () => {
  const res = await b.callHandler("customers", "POST", null, {
    name: `Cliente Teste ${SUFFIX}`,
    email: `cliente${SUFFIX}@teste.local`,
    cpfCnpj: "123.456.789-00",
    phone: "(11) 99999-0000",
  }, token);
  assert.strictEqual(res.status, 201);
  customerId = res.body._id;
  assert.ok(customerId);
});

test("busca cliente por e-mail", async () => {
  const res = await b.callHandler("customers", "GET", { search: `cliente${SUFFIX}@teste.local`, limit: "all" }, null, token);
  assert.strictEqual(res.status, 200);
  const found = res.body.data.find((c) => c._id === customerId);
  assert.ok(found, "cliente deve aparecer na busca");
});

test("cria recebimento vinculado ao cliente", async () => {
  const res = await b.callHandler("accounts-receivable", "POST", null, {
    description: `Venda prazo ${SUFFIX}`,
    customerId,
    amount: 250,
    dueDate: "2026-09-15",
    paymentMethod: "pix",
    category: "vendas",
  }, token);
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.status, "pending");
  assert.strictEqual(res.body.customerName, `Cliente Teste ${SUFFIX}`);
  assert.strictEqual(res.body.amount, 250);
  receivableIds.push(res.body._id);
});

test("summary reflete o recebimento em aberto", async () => {
  const res = await b.callHandler("accounts-receivable", "GET", { summary: "true" }, null, token);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.totalPending >= 250);
  assert.ok(res.body.countPending >= 1);
  assert.ok(Array.isArray(res.body.cashFlow));
  assert.strictEqual(res.body.cashFlow.length, 30);
});

test("recebe o valor (action=receive)", async () => {
  const id = receivableIds[0];
  const res = await b.callHandler("accounts-receivable", "PUT", null, {
    id,
    action: "receive",
    paymentMethod: "pix",
    receivedDate: "2026-08-01",
  }, token);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, "received");
  assert.ok(res.body.receivedDate);
});

test("cria recebimento com parcelas", async () => {
  const res = await b.callHandler("accounts-receivable", "POST", null, {
    description: `Parcelado ${SUFFIX}`,
    amount: 300,
    dueDate: "2026-10-01",
    totalInstallments: 3,
  }, token);
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.length, 3);
  for (const bill of res.body) {
    assert.strictEqual(bill.amount, 100);
    assert.strictEqual(bill.totalInstallments, 3);
    receivableIds.push(bill._id);
  }
});

test("validação: recebimento sem valor é rejeitado", async () => {
  const res = await b.callHandler("accounts-receivable", "POST", null, {
    description: "Sem valor",
    dueDate: "2026-10-01",
  }, token);
  assert.strictEqual(res.status, 400);
});

test("validação: cliente inexistente é rejeitado", async () => {
  const res = await b.callHandler("accounts-receivable", "POST", null, {
    description: "Cliente inválido",
    amount: 10,
    dueDate: "2026-10-01",
    customerId: "507f1f77bcf86cd799439011",
  }, token);
  assert.strictEqual(res.status, 400);
});
