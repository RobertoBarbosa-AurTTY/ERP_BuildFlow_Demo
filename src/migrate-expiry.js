// Consolida os campos de validade dos produtos em um único campo canônico `expiryDate`.
// Histórico: o sistema aceitava expiryDate / validade / expirationDate como alternativas.
// Esta migração copia o primeiro valor não-nulo (nesta ordem de prioridade) para expiryDate
// e remove os campos duplicados, garantindo consultas consistentes.
// Uso: npm run migrate:expiry
require("dotenv").config();
const { MongoClient } = require("mongodb");

const PRIORITY = ["expiryDate", "validade", "expirationDate"];

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
    const products = db.collection("products");
    console.log("Conectado ao MongoDB. Consolidando validades...\n");

    const cursor = products.find({
      $or: PRIORITY.map((f) => ({ [f]: { $exists: true, $ne: null } })),
    });
    let consolidated = 0;
    let cleaned = 0;
    let errors = 0;

    while (await cursor.hasNext()) {
      const p = await cursor.next();
      const value = PRIORITY.map((f) => p[f]).find((v) => v != null);
      const updates = { $set: { expiryDate: value } };
      const unset = PRIORITY.filter((f) => f !== "expiryDate" && p[f] != null);
      if (unset.length > 0) updates.$unset = Object.fromEntries(unset.map((f) => [f, ""]));
      try {
        await products.updateOne({ _id: p._id }, updates);
        if (!p.expiryDate) {
          consolidated++;
          console.log(`  ➜ ${p.sku || p._id}: validade consolidada para ${value.toISOString ? value.toISOString() : String(value)}`);
        } else {
          cleaned++;
        }
      } catch (err) {
        errors++;
        console.error(`  ✖ ${p.sku || p._id}: ${err.message}`);
      }
    }

    console.log(`\nPronto: ${consolidated} produtos atualizados, ${cleaned} limpos, ${errors} erros.`);
  } catch (error) {
    console.error("Erro na migração:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
