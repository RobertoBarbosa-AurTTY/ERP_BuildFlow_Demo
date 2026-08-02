// Fluxo completo de vendas contra o banco real, com produto de teste
// criado e removido ao final (não deixa resíduos).
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });
const b = require("../../scripts/baseline");
const stock = require("../../src/lib/stock");

let db;
let token;
let productId;
let saleId;
let saleNumber;
const NAME = `PRODUTO-TESTE-${Date.now()}`;

before(async () => {
  db = await b.getDb();
  token = await b.login(db);
});

after(async () => {
  const { ObjectId } = require("mongodb");
  // Limpa TODAS as vendas de teste (incluindo órfãs de runs anteriores)
  const sales = db.collection("sales");
  const testSales = await sales.find({ "items.name": NAME }).toArray();
  const ids = testSales.map((s) => s._id);
  if (ids.length) {
    // Restaura estoque das vendas FINALIZED/RESERVED órfãs antes de apagar
    const products = db.collection("products");
    for (const s of testSales) {
      const items = (s.items || []).map((i) => ({ id: i.id, qty: i.qty }));
      if (s.status === "FINALIZED") await stock.restoreStock(products, items);
      if (s.status === "RESERVED") await stock.releaseReserved(products, items);
    }
    await sales.deleteMany({ _id: { $in: ids } });
    await db.collection("logs").deleteMany({ entityId: { $in: ids }, entity: "sales" });
  }
  await db.collection("products").deleteOne({ _id: ObjectId.createFromHexString(productId) });
  const { closeClient } = require("../../src/lib/mongodb");
  await closeClient();
});

test("cria produto de teste", async () => {
  const res = await b.callHandler("products", "POST", null, {
    name: NAME,
    sku: `SKU-TESTE-${Date.now()}`,
    category: "Testes",
    quantity: 10,
    minStock: 1,
    maxStock: 100,
    price: 10,
    costPrice: 5,
    status: "Em estoque",
    unit: "UN",
    location: { aisle: "RECV", shelf: "00", level: "00", slot: "00", deposit: "DEPÓSITO 01" },
  }, token);
  assert.strictEqual(res.status, 201);
  productId = res.body.insertedId;
  assert.ok(productId);
});

test("venda FINALIZED baixa estoque e gera número sequencial", async () => {
  const res = await b.callHandler("sales", "POST", null, {
    items: [{ id: productId, name: NAME, qty: 2, price: 10 }],
    total: 20,
    subtotal: 20,
    paymentMethod: "PIX",
    amountPaid: 20,
    change: 0,
    status: "FINALIZED",
  }, token);
  assert.strictEqual(res.status, 201);
  saleId = res.body.saleId;
  saleNumber = res.body.saleNumber;
  assert.ok(Number.isInteger(saleNumber), "saleNumber deve ser inteiro sequencial");

  const product = await db.collection("products").findOne({ _id: require("mongodb").ObjectId.createFromHexString(productId) });
  assert.strictEqual(product.quantity, 8, "estoque deve cair de 10 para 8");
});

test("cancelamento da venda restaura o estoque", async () => {
  const res = await b.callHandler("sales", "PUT", { id: saleId }, { status: "CANCELLED" }, token);
  assert.strictEqual(res.status, 200);
  const product = await db.collection("products").findOne({ _id: require("mongodb").ObjectId.createFromHexString(productId) });
  assert.strictEqual(product.quantity, 10, "estoque restaurado para 10");
});

test("venda sem estoque suficiente é rejeitada (409)", async () => {
  const res = await b.callHandler("sales", "POST", null, {
    items: [{ id: productId, name: NAME, qty: 999, price: 10 }],
    total: 9990,
    status: "FINALIZED",
  }, token);
  assert.strictEqual(res.status, 409);
  const product = await db.collection("products").findOne({ _id: require("mongodb").ObjectId.createFromHexString(productId) });
  assert.strictEqual(product.quantity, 10, "estoque intacto após rejeição");
});

test("reserva + finalização (RESERVED -> FINALIZED)", async () => {
  const res = await b.callHandler("sales", "POST", null, {
    items: [{ id: productId, name: NAME, qty: 3, price: 10 }],
    total: 30,
    status: "RESERVED",
  }, token);
  assert.strictEqual(res.status, 201);
  const reservedSaleId = res.body.saleId;

  let product = await db.collection("products").findOne({ _id: require("mongodb").ObjectId.createFromHexString(productId) });
  assert.strictEqual(product.reserved, 3, "reservado deve ser 3");
  assert.strictEqual(product.quantity, 10, "físico intacto na reserva");

  const fin = await b.callHandler("sales", "PUT", { id: reservedSaleId }, { status: "FINALIZED" }, token);
  assert.strictEqual(fin.status, 200);

  product = await db.collection("products").findOne({ _id: require("mongodb").ObjectId.createFromHexString(productId) });
  assert.strictEqual(product.quantity, 7, "físico cai ao finalizar");
  assert.strictEqual(product.reserved, 0, "reserva liberada ao finalizar");

  // limpeza
  await b.callHandler("sales", "DELETE", { id: reservedSaleId }, null, token);
});

test("venda reservada criada com estoque baixo retorna 409", async () => {
  const res = await b.callHandler("sales", "POST", null, {
    items: [{ id: productId, name: NAME, qty: 50, price: 10 }],
    total: 500,
    status: "RESERVED",
  }, token);
  assert.strictEqual(res.status, 409);
  const product = await db.collection("products").findOne({ _id: require("mongodb").ObjectId.createFromHexString(productId) });
  assert.strictEqual(product.reserved, 0);
});
