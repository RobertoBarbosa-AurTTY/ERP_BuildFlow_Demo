const { getDb } = require('../../src/lib/mongodb');
const { checkPermission } = require('../../src/lib/auth');
const { withAuth } = require('../../src/lib/helpers');
const { ObjectId } = require('mongodb');

exports.handler = withAuth(async (event, context, user) => {
  

  const db = await getDb();
  const collection = db.collection('retiradas_caixa');

  const parseObjectId = (value) => {
    if (!value) return null;
    let id = value;
    if (typeof id === 'object' && id !== null) {
      if (id.$oid) id = id.$oid;
      else return null;
    }
    try {
      return new ObjectId(String(id));
    } catch {
      return null;
    }
  };

  try {
    switch (event.httpMethod) {
      case 'GET': {
        const { caixaId, start, end, tipo } = event.queryStringParameters || {};
        const query = {};

        if (caixaId) {
          const parsedCaixaId = parseObjectId(caixaId);
          if (!parsedCaixaId) {
            return { statusCode: 400, body: JSON.stringify({ message: 'ID do caixa inválido' }) };
          }
          query.caixaId = parsedCaixaId;
        }

        if (tipo) {
          query.tipo = tipo;
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

        if (action === 'editar') {
          if (!checkPermission(user, ['Admin', 'Gerente'])) {
            return { statusCode: 403, body: JSON.stringify({ message: 'Acesso negado' }) };
          }

          const { id } = body;
          const parsedId = parseObjectId(id);
          if (!parsedId) {
            return { statusCode: 400, body: JSON.stringify({ message: 'ID da retirada é obrigatório' }) };
          }

          const existente = await collection.findOne({ _id: parsedId });
          if (!existente) {
            return { statusCode: 404, body: JSON.stringify({ message: 'Retirada não encontrada' }) };
          }

          const set = {};
          const mudancas = [];

          const applyField = (campo, valor) => {
            const antes = existente[campo];
            if (antes === valor) return;
            set[campo] = valor;
            mudancas.push({ campo, antes, depois: valor });
          };

          if (body.valor !== undefined) {
            const valor = Math.max(0, Number(body.valor) || 0);
            if (valor <= 0) {
              return { statusCode: 400, body: JSON.stringify({ message: 'Valor do movimento deve ser maior que zero' }) };
            }
            applyField('valor', valor);
          }
          if (body.descricao !== undefined) {
            const descricao = String(body.descricao || '').trim();
            if (!descricao) {
              return { statusCode: 400, body: JSON.stringify({ message: 'Descrição é obrigatória' }) };
            }
            applyField('descricao', descricao);
          }
          if (body.categoria !== undefined) applyField('categoria', String(body.categoria || '').trim() || 'Geral');
          if (body.tipo !== undefined) {
            const tipo = body.tipo === 'suprimento' ? 'suprimento' : 'retirada';
            applyField('tipo', tipo);
          }
          if (body.createdAt !== undefined) {
            const date = new Date(body.createdAt);
            if (Number.isNaN(date.getTime())) {
              return { statusCode: 400, body: JSON.stringify({ message: 'Data do movimento inválida' }) };
            }
            applyField('createdAt', date);
          }

          if (mudancas.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Nenhuma alteração informada.' }) };
          }

          set.updatedAt = new Date();
          set.updatedBy = user.userId;
          await collection.updateOne({ _id: parsedId }, { $set: set });

          const tipoLabel = (set.tipo || existente.tipo) === 'suprimento' ? 'Suprimento' : 'Sangria';
          const resumo = mudancas.map((m) => `${m.campo}: ${m.antes instanceof Date ? m.antes.toISOString() : m.antes} → ${m.depois instanceof Date ? m.depois.toISOString() : m.depois}`).join('; ');

          await db.collection('logs').insertOne({
            userId: user.userId,
            action: set.tipo === 'suprimento' || existente.tipo === 'suprimento' ? 'EDIT_SUPRIMENTO' : 'EDIT_SANGRIA',
            entity: 'retiradas_caixa',
            entityId: parsedId,
            timestamp: new Date(),
            details: `${tipoLabel} editada: ${resumo}`
          });

          const registroFinal = await collection.findOne({ _id: parsedId });
          return { statusCode: 200, body: JSON.stringify({ message: 'Retirada editada com sucesso', retirada: registroFinal }) };
        }

        if (action === 'registrar') {
          const valor = Math.max(0, Number(body.valor) || 0);
          const descricao = String(body.descricao || '').trim();
          const categoria = String(body.categoria || '').trim();
          const caixaId = body.caixaId;
          const parsedCaixaId = parseObjectId(caixaId);
          const userName = body.userName || user.name || 'Operador';
          const tipo = body.tipo === 'suprimento' ? 'suprimento' : 'retirada';

          if (valor <= 0) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Valor do movimento deve ser maior que zero' }) };
          }

          if (!descricao) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Descrição é obrigatória' }) };
          }

          const retirada = {
            valor,
            descricao,
            categoria: categoria || 'Geral',
            tipo,
            caixaId: parsedCaixaId || null,
            userId: user.userId || user.id,
            userName,
            createdAt: new Date()
          };

          const result = await collection.insertOne(retirada);

          await db.collection('logs').insertOne({
            userId: user.userId,
            action: tipo === 'suprimento' ? 'REGISTER_SUPRIMENTO' : 'REGISTER_SANGRIA',
            entity: 'retiradas_caixa',
            entityId: result.insertedId,
            timestamp: new Date(),
            details: `${tipo === 'suprimento' ? 'Suprimento' : 'Sangria'} de R$ ${valor.toFixed(2)} registrada: ${descricao} por ${userName}`
          });

          return {
            statusCode: 201,
            body: JSON.stringify({ ...retirada, _id: result.insertedId })
          };
        }

        return { statusCode: 400, body: JSON.stringify({ message: 'Ação inválida. Use "registrar" ou "editar".' }) };
      }

      case 'DELETE': {
        if (!checkPermission(user, ['Admin', 'Gerente'])) {
          return { statusCode: 403, body: JSON.stringify({ message: 'Acesso negado' }) };
        }

        const { id } = JSON.parse(event.body || '{}');
        if (!id) {
          return { statusCode: 400, body: JSON.stringify({ message: 'ID da sangria é obrigatório' }) };
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
      body: JSON.stringify({ message: 'Erro no servidor' })
    };
  }
});
