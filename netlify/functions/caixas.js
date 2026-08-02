const { getDb } = require('../../src/lib/mongodb');
const { checkPermission } = require('../../src/lib/auth');
const { withAuth } = require('../../src/lib/helpers');

exports.handler = withAuth(async (event, context, user) => {
  

  const db = await getDb();
  const collection = db.collection('caixas');

  try {
    switch (event.httpMethod) {
      case 'GET': {
        const caixas = await collection.find({}).sort({ name: 1 }).toArray();
        return { statusCode: 200, body: JSON.stringify(caixas) };
      }

      case 'POST': {
        if (!checkPermission(user, ['Admin', 'Gerente'])) {
          return { statusCode: 403, body: JSON.stringify({ message: 'Acesso negado' }) };
        }

        const body = JSON.parse(event.body || '{}');
        const name = (body.name || '').trim();
        const number = (body.number || body.name || '').trim();

        if (!name) {
          return { statusCode: 400, body: JSON.stringify({ message: 'Nome do caixa é obrigatório' }) };
        }

        const exists = await collection.findOne({
          name: { $regex: `^${name}$`, $options: 'i' }
        });
        if (exists) {
          return { statusCode: 409, body: JSON.stringify({ message: 'Já existe um caixa com esse nome' }) };
        }

        const caixa = {
          name,
          number,
          active: body.active !== false,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        const result = await collection.insertOne(caixa);
        return { statusCode: 201, body: JSON.stringify({ ...caixa, _id: result.insertedId }) };
      }

      case 'DELETE': {
        if (!checkPermission(user, ['Admin', 'Gerente'])) {
          return { statusCode: 403, body: JSON.stringify({ message: 'Acesso negado' }) };
        }
        const { id } = JSON.parse(event.body || '{}');
        if (!id) {
          return { statusCode: 400, body: JSON.stringify({ message: 'ID do caixa é obrigatório' }) };
        }
        const { ObjectId } = require('mongodb');
        await collection.deleteOne({ _id: new ObjectId(id) });
        return { statusCode: 200, body: JSON.stringify({ message: 'Caixa removido' }) };
      }

      default:
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }
  } catch (error) {
    console.error('caixas error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro no servidor' })
    };
  }
});
