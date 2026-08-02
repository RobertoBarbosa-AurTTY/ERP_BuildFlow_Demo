const { getDb } = require('../../src/lib/mongodb');
const { withAuth } = require('../../src/lib/helpers');

exports.handler = withAuth(async (event, context, user) => {
  

  const db = await getDb();
  const categoriesCol = db.collection('categories');

  try {
    // Sincronizar categorias dos produtos com a coleção categories
    async function syncFromProducts() {
      const productCats = await db.collection('products').distinct('category');
      const existing = await categoriesCol.find({}).project({ name: 1 }).toArray();
      const existingSet = new Set(existing.map(c => c.name));
      const now = new Date();
      for (const name of productCats) {
        if (name && !existingSet.has(name)) {
          await categoriesCol.insertOne({ name, createdAt: now });
          existingSet.add(name);
        }
      }
    }

    if (event.httpMethod === 'GET') {
      await syncFromProducts();
      const data = await categoriesCol.find({}).sort({ name: 1 }).toArray();
      return { statusCode: 200, body: JSON.stringify(data.map(c => c.name)) };
    }

    if (event.httpMethod === 'POST') {
      const { name } = JSON.parse(event.body);
      if (!name || !name.trim()) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Nome é obrigatório' }) };
      }
      const existing = await categoriesCol.findOne({ name: name.trim() });
      if (!existing) {
        await categoriesCol.insertOne({ name: name.trim(), createdAt: new Date() });
      }
      return { statusCode: 200, body: JSON.stringify({ message: 'Categoria salva' }) };
    }

    if (event.httpMethod === 'DELETE') {
      const { name } = event.queryStringParameters || {};
      if (!name) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Nome é obrigatório' }) };
      }
      await categoriesCol.deleteOne({ name });
      return { statusCode: 200, body: JSON.stringify({ message: 'Categoria excluída' }) };
    }

    return { statusCode: 405, body: JSON.stringify({ message: 'Método não permitido' }) };
  } catch (error) {
    console.error('Categories error:', error);
    return { statusCode: 500, body: JSON.stringify({ message: 'Erro ao gerenciar categorias' }) };
  }
});
