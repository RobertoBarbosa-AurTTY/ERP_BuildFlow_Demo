require('dotenv').config();
const { MongoClient } = require('mongodb');

async function clearSalesData() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Erro: variável de ambiente MONGODB_URI não está definida.');
    process.exit(1);
  }

  const client = new MongoClient(uri, {
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    family: 4
  });

  try {
    await client.connect();
    const db = client.db();
    console.log('Conectado ao MongoDB. Removendo dados de vendas...');

    // Remove a coleção de vendas
    try {
      await db.collection('sales').drop();
      console.log('Coleção "sales" removida.');
    } catch (err) {
      if (err.codeName === 'NamespaceNotFound' || err.message.includes('ns not found')) {
        console.log('Coleção "sales" não existe, pulando.');
      } else {
        throw err;
      }
    }

    // Recria a coleção sales com o índice necessário
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

    console.log('Dados de vendas removidos com sucesso!');
  } catch (error) {
    console.error('Erro ao limpar dados de vendas:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

clearSalesData();
