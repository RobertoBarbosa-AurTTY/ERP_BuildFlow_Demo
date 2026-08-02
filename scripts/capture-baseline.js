// Captura o baseline das respostas da API (estado atual) para testes de comparação.
// Uso: node scripts/capture-baseline.js
require("dotenv").config();
const b = require("./baseline");

(async () => {
  try {
    const db = await b.getDb();
    const token = await b.login(db);
    const results = await b.runAllCaptures(token);

    for (const [name, res] of Object.entries(results)) {
      if (res.status >= 400) {
        console.warn(`⚠️  ${name}: status ${res.status} (capturado mesmo assim)`);
      }
      b.saveBaseline(name, { status: res.status, body: res.body });
      console.log(`✔ ${name}: ${res.status}`);
    }

    console.log(`\nBaseline salvo em ${b.BASELINE_DIR}`);
  } catch (err) {
    console.error("❌ Falha na captura:", err);
    process.exit(1);
  } finally {
    const db = await b.getDb().catch(() => null);
    if (db) await b.removeTestUser(db);
  }
  process.exit(0);
})();
