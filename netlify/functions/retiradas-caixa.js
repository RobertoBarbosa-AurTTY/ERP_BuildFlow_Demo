const { getDb } = require('../../src/lib/mongodb');
const { verifyToken, checkPermission } = require('../../src/lib/auth');
const { ObjectId } = require('mongodb');

exports.handler = async (event) => {
  const user = verifyToken(event);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ message: 'Não autorizado' }) };
  }

  const db = await getDb();
  const collection = db.collection('retiradas_caixa');

  try {
    switch (event.httpMethod) {
      case 'GET': {
        const { caixaId, start, end } = event.queryStringParameters || {};
        const query = {};

        if (caixaId) {
          query.caixaId = new ObjectId(caixaId);
        }

        if (start || end) {
          query.createdAt = {};
          if (start) query.createdAt.$gte = new Date(start);
          if (end) query.createdAt.$lte = new Date(end);
        }

        const retiradas = await collection.find(query)
          .sort({ createdAt: -1 })
          .toArray();

        return { statusCode: 200, body: JSON.stringify(retiradas) };
      }

      case 'POST': {
        const body = JSON.parse(event.body || '{}');
        const { action } = body;

        if (action === 'registrar') {
          const valor = Math.max(0, Number(body.valor) || 0);
          const descricao = String(body.descricao || '').trim();
          const categoria = String(body.categoria || '').trim();
          const caixaId = body.caixaId;
          const userName = body.userName || user.name || 'Operador';

          if (valor <= 0) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Valor da retirada deve ser maior que zero' }) };
          }

          if (!descricao) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Descrição da retirada é obrigatória' }) };
          }

          const retirada = {
            valor,
            descricao,
            categoria: categoria || 'Geral',
            caixaId: caixaId ? new ObjectId(caixaId) : null,
            userId: user.userId || user.id,
            userName,
            createdAt: new Date()
          };

          const result = await collection.insertOne(retirada);

          await db.collection('logs').insertOne({
            userId: user.userId,
            action: 'REGISTER_RETIRADA',
            entity: 'retiradas_caixa',
            entityId: result.insertedId,
            timestamp: new Date(),
            details: `Retirada de R$ ${valor.toFixed(2)} registrada: ${descricao} por ${userName}`
          });

          return {
            statusCode: 201,
            body: JSON.stringify({ ...retirada, _id: result.insertedId })
          };
        }

        return { statusCode: 400, body: JSON.stringify({ message: 'Ação inválida. Use "registrar".' }) };
      }

      case 'DELETE': {
        if (!checkPermission(user, ['Admin', 'Gerente'])) {
          return { statusCode: 403, body: JSON.stringify({ message: 'Acesso negado' }) };
        }

        const { id } = JSON.parse(event.body || '{}');
        if (!id) {
          return { statusCode: 400, body: JSON.stringify({ message: 'ID da retirada é obrigatório' }) };
        }

        await collection.deleteOne({ _id: new ObjectId(id) });

        return { statusCode: 200, body: JSON.stringify({ message: 'Retirada removida' }) };
      }

      default:
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }
  } catch (error) {
    console.error('retiradas-caixa error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro no servidor', error: error.message })
    };
  }
};
