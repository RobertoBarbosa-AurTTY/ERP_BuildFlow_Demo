const { getDb } = require('../../src/lib/mongodb');
const { checkPermission } = require('../../src/lib/auth');
const { withAuth } = require('../../src/lib/helpers');
const { ObjectId } = require('mongodb');

function buildCode(loc) {
  return [loc.aisle, loc.shelf, loc.level, loc.slot].filter(Boolean).join('-');
}

exports.handler = withAuth(async (event, context, user) => {
  

  const db = await getDb();
  const collection = db.collection('warehouse_addresses');

  try {
    switch (event.httpMethod) {
      case 'GET': {
        const { deposit } = event.queryStringParameters || {};
        const query = {};
        if (deposit) {
          const d = deposit.trim();
          query.$or = [
            { deposit: { $regex: d, $options: 'i' } },
            { zone: { $regex: d, $options: 'i' } }
          ];
        }
        const data = await collection.find(query).sort({ aisle: 1, shelf: 1, level: 1, slot: 1 }).toArray();
        return { statusCode: 200, body: JSON.stringify(data) };
      }

      case 'POST': {
        if (!checkPermission(user, ['Admin', 'Gerente'])) {
          return { statusCode: 403, body: JSON.stringify({ message: 'Acesso negado' }) };
        }
        const body = JSON.parse(event.body);
        const location = {
          aisle: (body.aisle || '').trim().toUpperCase(),
          shelf: (body.shelf || '').trim(),
          level: (body.level || '').trim(),
          slot: (body.slot || '').trim()
        };
        if (!location.aisle || !location.shelf) {
          return { statusCode: 400, body: JSON.stringify({ message: 'Corredor e prateleira são obrigatórios' }) };
        }
        const code = buildCode(location);
        const exists = await collection.findOne({ code });
        if (exists) {
          return { statusCode: 409, body: JSON.stringify({ message: `Endereço ${code} já existe` }) };
        }
        const doc = {
          ...location,
          code,
          description: (body.description || '').trim(),
          zone: (body.zone || '').trim(),
          deposit: (body.deposit || 'DEPÓSITO 01').trim(),
          active: body.active !== false,
          isReceiving: body.isReceiving === true || location.aisle === 'RECV',
          createdAt: new Date(),
          updatedAt: new Date()
        };
        const result = await collection.insertOne(doc);
        await db.collection('logs').insertOne({
          userId: user.userId,
          action: 'CREATE_WAREHOUSE_ADDRESS',
          entity: 'warehouse_addresses',
          entityId: result.insertedId,
          timestamp: new Date(),
          details: `Endereço ${code} criado`
        });
        return { statusCode: 201, body: JSON.stringify({ ...doc, _id: result.insertedId }) };
      }

      case 'PUT': {
        if (!checkPermission(user, ['Admin', 'Gerente'])) {
          return { statusCode: 403, body: JSON.stringify({ message: 'Acesso negado' }) };
        }
        const { id, ...body } = JSON.parse(event.body);
        const location = {
          aisle: (body.aisle || '').trim().toUpperCase(),
          shelf: (body.shelf || '').trim(),
          level: (body.level || '').trim(),
          slot: (body.slot || '').trim()
        };
        if (!location.aisle || !location.shelf) {
          return { statusCode: 400, body: JSON.stringify({ message: 'Corredor e prateleira são obrigatórios' }) };
        }
        const code = buildCode(location);
        const duplicate = await collection.findOne({
          code,
          _id: { $ne: new ObjectId(id) }
        });
        if (duplicate) {
          return { statusCode: 409, body: JSON.stringify({ message: `Endereço ${code} já existe` }) };
        }
        const updates = {
          ...location,
          code,
          description: (body.description || '').trim(),
          zone: (body.zone || '').trim(),
          deposit: (body.deposit || 'DEPÓSITO 01').trim(),
          active: body.active !== false,
          isReceiving: body.isReceiving === true || location.aisle === 'RECV',
          updatedAt: new Date()
        };
        await collection.updateOne({ _id: new ObjectId(id) }, { $set: updates });
        return { statusCode: 200, body: JSON.stringify({ message: 'Endereço atualizado', code }) };
      }

      case 'DELETE': {
        if (!checkPermission(user, ['Admin', 'Gerente'])) {
          return { statusCode: 403, body: JSON.stringify({ message: 'Acesso negado' }) };
        }
        const id = event.queryStringParameters?.id;
        if (!id) {
          return { statusCode: 400, body: JSON.stringify({ message: 'ID obrigatório' }) };
        }
        const addr = await collection.findOne({ _id: new ObjectId(id) });
        await collection.deleteOne({ _id: new ObjectId(id) });
        await db.collection('logs').insertOne({
          userId: user.userId,
          action: 'DELETE_WAREHOUSE_ADDRESS',
          entity: 'warehouse_addresses',
          entityId: new ObjectId(id),
          timestamp: new Date(),
          details: `Endereço ${addr ? addr.code : id} removido`
        });
        return { statusCode: 200, body: JSON.stringify({ message: 'Endereço removido' }) };
      }

      default:
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
  } catch (error) {
    console.error('warehouse-addresses error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro no servidor' })
    };
  }
});
