const { getDb } = require('../../src/lib/mongodb');
const { withAuth } = require('../../src/lib/helpers');
const { ObjectId } = require('mongodb');

exports.handler = withAuth(async (event, context, user) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  try {
    const db = await getDb();
    const query = {};

    const { entity, entityId, action, limit = 200 } = event.queryStringParameters || {};

    if (entity) query.entity = entity;
    if (action) query.action = action;

    if (entityId) {
      try {
        query.entityId = new ObjectId(entityId);
      } catch {
        query.entityId = entityId;
      }
    }

    const logs = await db.collection('logs')
      .find(query)
      .sort({ timestamp: -1 })
      .limit(Math.min(parseInt(limit) || 200, 500))
      .toArray();

    return { statusCode: 200, body: JSON.stringify(logs) };
  } catch (error) {
    console.error('logs error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro ao buscar trilha de auditoria' })
    };
  }
});
