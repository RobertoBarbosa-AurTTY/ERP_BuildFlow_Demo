const { getDb } = require("../../src/lib/mongodb");
const { withAuth } = require("../../src/lib/helpers");

exports.handler = withAuth(async (event, _context, _user) => {
  

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const db = await getDb();
    const { sku, limit } = event.queryStringParameters || {};
    const query = {};
    if (sku) query.sku = sku;

    const max = limit === "all" ? 0 : Math.min(10000, parseInt(limit, 10) || 50);
    const data = await db
      .collection("movimentacoes_estoque")
      .find(query)
      .sort({ timestamp: -1 })
      .limit(max)
      .toArray();

    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (error) {
    console.error("stock-movements error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Erro ao carregar movimentações",
      }),
    };
  }
});
