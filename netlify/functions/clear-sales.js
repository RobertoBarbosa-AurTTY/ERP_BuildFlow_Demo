const { getDb } = require('../../src/lib/mongodb');
const { checkPermission } = require('../../src/lib/auth');
const { withAuth } = require('../../src/lib/helpers');

exports.handler = withAuth(async (event, context, user) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  

  if (!checkPermission(user, ['Admin'])) {
    return { statusCode: 403, body: JSON.stringify({ message: 'Apenas administradores podem limpar vendas' }) };
  }

  try {
    const db = await getDb();

    // Remove a coleção de vendas
    try {
      await db.collection('sales').drop();
    } catch (err) {
      if (err.codeName !== 'NamespaceNotFound' && !err.message.includes('ns not found')) {
        throw err;
      }
    }

    // Recria a coleção sales com índice
    const sales = db.collection('sales');
    await sales.createIndex({ createdAt: -1 });
    console.log('Coleção "sales" recriada com índice createdAt.');

    // Remove movimentações de estoque relacionadas a vendas
    try {
      const movResult = await db.collection('movimentacoes_estoque').deleteMany({ tipo: 'saida' });
      console.log(`Removidas ${movResult.deletedCount} movimentações de estoque do tipo "saida".`);
    } catch (err) {
      console.error('Erro ao limpar movimentacoes_estoque:', err.message);
    }

    // Remove logs relacionados a vendas
    try {
      const logResult = await db.collection('logs').deleteMany({
        $or: [
          { acao: /venda/i },
          { acao: /sale/i },
          { descricao: /venda/i },
          { descricao: /sale/i }
        ]
      });
      console.log(`Removidos ${logResult.deletedCount} logs relacionados a vendas.`);
    } catch (err) {
      console.error('Erro ao limpar logs:', err.message);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Todos os dados de vendas foram removidos com sucesso!' })
    };
  } catch (error) {
    console.error('Erro ao limpar dados de vendas:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro ao limpar dados de vendas' })
    };
  }
});
