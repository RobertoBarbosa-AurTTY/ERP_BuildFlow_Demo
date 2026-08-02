// Garante que todos os índices necessários existam no MongoDB.
// Uso: npm run ensure-indexes
require("dotenv").config();
const { MongoClient } = require("mongodb");

const INDEXES = {
  products: [
    { key: { sku: 1 }, options: { unique: true } },
    { key: { name: 1 }, options: {} },
    { key: { category: 1 }, options: {} },
    { key: { quantity: 1 }, options: {} },
  ],
  sales: [
    { key: { createdAt: -1 }, options: {} },
    { key: { status: 1, createdAt: -1 }, options: {} },
    { key: { saleNumber: 1 }, options: { unique: true } },
    { key: { caixaId: 1 }, options: {} },
  ],
  accounts_payable: [
    { key: { dueDate: 1, status: 1 }, options: {} },
    { key: { installmentGroupId: 1 }, options: {} },
  ],
  accounts_receivable: [
    { key: { dueDate: 1, status: 1 }, options: {} },
    { key: { installmentGroupId: 1 }, options: {} },
    { key: { customerId: 1 }, options: {} },
  ],
  customers: [
    { key: { name: 1 }, options: {} },
    { key: { email: 1 }, options: { unique: true, sparse: true } },
  ],
  retiradas_caixa: [{ key: { createdAt: -1 }, options: {} }],
  movimentacoes_estoque: [
    { key: { timestamp: -1 }, options: {} },
    { key: { sku: 1 }, options: {} },
  ],
  logs: [{ key: { timestamp: -1 }, options: {} }],
  counters: [{ key: { name: 1 }, options: { unique: true } }],
  caches: [{ key: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } }],
  rate_limits: [{ key: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } }],
};

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Erro: variável de ambiente MONGODB_URI não está definida.");
    process.exit(1);
  }

  const client = new MongoClient(uri, {
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    family: 4,
  });

  try {
    await client.connect();
    const db = client.db();
    console.log("Conectado ao MongoDB. Garantindo índices...\n");

    let created = 0;
    let skipped = 0;
    for (const [collectionName, specs] of Object.entries(INDEXES)) {
      try {
        await db.collection(collectionName).createCollection(collectionName, { strict: false });
      } catch {
        // coleção já existe — ok
      }
      const col = db.collection(collectionName);
      for (const { key, options } of specs) {
        try {
          const result = await col.createIndex(key, options);
          console.log(`  ✔ ${collectionName}: ${JSON.stringify(key)}${result ? ` (${result})` : ""}`);
          created++;
        } catch (err) {
          if (err.code === 11000) {
            console.log(`  ⚠ ${collectionName}: ${JSON.stringify(key)} — índice único com duplicados; criação ignorada`);
            skipped++;
          } else {
            throw err;
          }
        }
      }
    }

    console.log(`\nPronto: ${created} índices garantidos, ${skipped} ignorados.`);
  } catch (error) {
    console.error("Erro ao garantir índices:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
