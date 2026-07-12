const { getDb } = require('../../src/lib/mongodb');
const { verifyToken } = require('../../src/lib/auth');

exports.handler = async (event, context) => {
  const user = verifyToken(event);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ message: 'Não autorizado' }) };
  }

  const db = await getDb();
  const coll = db.collection('cart_sync');

  try {
    if (event.httpMethod === 'POST') {
      const { items, deviceId, version } = JSON.parse(event.body);
      await coll.updateOne(
        { userId: user.userId },
        {
          $set: {
            items: items || [],
            deviceId,
            version: version || 0,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    if (event.httpMethod === 'GET') {
      const cart = await coll.findOne({ userId: user.userId });
      return {
        statusCode: 200,
        body: JSON.stringify({
          items: cart?.items || [],
          version: cart?.version || 0,
          deviceId: cart?.deviceId || null,
          updatedAt: cart?.updatedAt || null
        })
      };
    }

    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  } catch (error) {
    console.error('cart-sync error:', error);
    return { statusCode: 500, body: JSON.stringify({ message: 'Erro ao sincronizar carrinho' }) };
  }
};
