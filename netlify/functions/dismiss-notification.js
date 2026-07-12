const { getDb } = require('../../src/lib/mongodb');
const { verifyToken } = require('../../src/lib/auth');

exports.handler = async (event, context) => {
  const user = verifyToken(event);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ message: 'Não autorizado' }) };
  }

  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body);
      const { notificationKey } = body;

      if (!notificationKey) {
        return { statusCode: 400, body: JSON.stringify({ message: 'notificationKey é obrigatório' }) };
      }

      const db = await getDb();
      const dismissedCol = db.collection('dismissed_notifications');

      await dismissedCol.updateOne(
        { notificationKey },
        { $set: { notificationKey, dismissedAt: new Date() } },
        { upsert: true }
      );

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Notificação excluída com sucesso' }),
      };
    } catch (error) {
      console.error('Dismiss notification error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro ao descartar notificação', error: error.message }),
      };
    }
  }

  if (event.httpMethod === 'GET') {
    try {
      const db = await getDb();
      const dismissedCol = db.collection('dismissed_notifications');
      const dismissed = await dismissedCol.find({}).toArray();
      const keys = dismissed.map((item) => item.notificationKey);

      return {
        statusCode: 200,
        body: JSON.stringify({ dismissed: keys }),
      };
    } catch (error) {
      console.error('Get dismissed notifications error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro ao buscar notificações descartadas', error: error.message }),
      };
    }
  }

  if (event.httpMethod === 'DELETE') {
    try {
      const db = await getDb();
      const dismissedCol = db.collection('dismissed_notifications');
      await dismissedCol.deleteMany({});

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Todas as notificações foram excluídas' }),
      };
    } catch (error) {
      console.error('Delete all notifications error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro ao excluir notificações', error: error.message }),
      };
    }
  }

  return { statusCode: 405, body: JSON.stringify({ message: 'Método não permitido' }) };
};
