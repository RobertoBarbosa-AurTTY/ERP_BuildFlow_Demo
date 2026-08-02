// Compara as respostas atuais da API contra o baseline capturado.
// Uso: node scripts/compare-baseline.js  (exit 0 = ok, 1 = divergência)
require("dotenv").config();
const b = require("./baseline");

(async () => {
  try {
    const db = await b.getDb();
    const token = await b.login(db);
    const results = await b.runAllCaptures(token);

    let failed = 0;
    for (const [name, current] of Object.entries(results)) {
      const expected = b.loadBaseline(name);
      if (!expected) {
        console.log(`➖ ${name}: sem baseline (capture antes)`);
        continue;
      }
      const issues = b.compareResponses(
        { status: current.status, body: current.body },
        expected,
        current.mode === "strict" ? "strict" : "subset",
      );
      if (issues.length === 0) {
        console.log(`✔ ${name} (${current.mode})`);
      } else {
        failed++;
        console.log(`✘ ${name} (${current.mode}) — ${issues.length} divergência(s):`);
        for (const issue of issues.slice(0, 10)) {
          console.log(`   ${issue.path} | esperado: ${JSON.stringify(issue.expected)} | atual: ${JSON.stringify(issue.actual)}`);
        }
        if (issues.length > 10) console.log(`   ... e mais ${issues.length - 10}`);
      }
    }

    if (failed > 0) {
      console.log(`\n❌ ${failed} endpoint(s) divergiram do baseline.`);
      process.exit(1);
    }
    console.log("\n✔ Todos os endpoints compatíveis com o baseline.");
  } catch (err) {
    console.error("❌ Falha na comparação:", err);
    process.exit(1);
  } finally {
    const db = await b.getDb().catch(() => null);
    if (db) await b.removeTestUser(db);
  }
  process.exit(0);
})();
