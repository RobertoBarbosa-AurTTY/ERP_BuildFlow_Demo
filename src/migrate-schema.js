// Corrige divergências de esquema no MongoDB e garante os índices exigidos pelo sistema.
// Atualmente resolve: vendas com saleNumber duplicado (impedem o índice único).
// Uso: npm run migrate:schema
require("dotenv").config();
const { MongoClient } = require("mongodb");

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
    console.log("Conectado ao MongoDB. Verificando esquema...\n");

    // 1. Renumerar vendas com saleNumber duplicado (mantém a venda mais recente)
    const sales = db.collection("sales");
    const dups = await sales
      .aggregate([
        { $match: { saleNumber: { $type: "number" } } },
        { $group: { _id: "$saleNumber", ids: { $push: { _id: "$_id", createdAt: "$createdAt" } }, n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
      ])
      .toArray();

    let renumbered = 0;
    for (const dup of dups) {
      dup.ids.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      const keep = dup.ids[dup.ids.length - 1]._id;
      for (const item of dup.ids) {
        if (item._id.equals(keep)) continue;
        const newNumber = await sales.findOneAndUpdate(
          { _id: item._id },
          { $set: { saleNumber: await nextSaleNumber(sales) } },
          { returnDocument: "after" },
        );
        if (newNumber.value) {
          renumbered++;
          console.log(`  ➜ Venda ${item._id}: saleNumber ${dup._id} → ${newNumber.value.saleNumber}`);
        }
      }
    }
    if (renumbered === 0) console.log("  ✔ Nenhum saleNumber duplicado encontrado");

    // 2. Criar o índice único de saleNumber (agora que não há duplicados)
    try {
      const idx = await sales.createIndex({ saleNumber: 1 }, { unique: true });
      console.log(`  ✔ Índice único sales.saleNumber criado (${idx})`);
    } catch (err) {
      if (err.code === 85 || (err.message || "").includes("duplicate key")) {
        console.log("  ⚠ Índice único já existe ou ainda há duplicados — execute novamente após inspeção");
      } else {
        throw err;
      }
    }

    console.log(`\nPronto: ${renumbered} vendas renumeradas.`);
  } catch (error) {
    console.error("Erro na migração:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Próximo número de venda sem colidir com os existentes (conta os 999.999.999.999.999)
async function nextSaleNumber(sales) {
  const maxDoc = await sales.find({}, { projection: { saleNumber: 1 } }).sort({ saleNumber: -1 }).limit(1).next();
  return (maxDoc && typeof maxDoc.saleNumber === "number" ? maxDoc.saleNumber : 0) + 1;
}

run();
