const { getDb } = require('../../src/lib/mongodb');
const { checkPermission } = require('../../src/lib/auth');
const { withAuth } = require('../../src/lib/helpers');

exports.handler = withAuth(async (event, context, user) => {
  

  const db = await getDb();
  const collection = db.collection('units');

  try {
    switch (event.httpMethod) {
      case 'GET': {
        const units = await collection.find({}).sort({ name: 1 }).toArray();
        return { statusCode: 200, body: JSON.stringify(units) };
      }

      case 'POST': {
        if (!checkPermission(user, ['Admin', 'Gerente'])) {
          return { statusCode: 403, body: JSON.stringify({ message: 'Acesso negado' }) };
        }

        const body = JSON.parse(event.body || '{}');
        const name = (body.name || '').trim();
        const address = (body.address || '').trim();

        if (!name) {
          return { statusCode: 400, body: JSON.stringify({ message: 'Nome da unidade é obrigatório' }) };
        }

        const exists = await collection.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
        if (exists) {
          return { statusCode: 409, body: JSON.stringify({ message: 'Já existe uma unidade com esse nome' }) };
        }

        const unit = {
          name,
          address,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        const result = await collection.insertOne(unit);
        return { statusCode: 201, body: JSON.stringify({ ...unit, _id: result.insertedId }) };
      }

      default:
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }
  } catch (error) {
    console.error('units error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro no servidor' })
    };
  }
});
