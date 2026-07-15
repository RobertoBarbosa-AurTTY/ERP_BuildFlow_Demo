require('dotenv').config();
const { MongoClient } = require('mongodb');

async function clearCaixaData() {
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
    console.log('Conectado ao MongoDB. Removendo dados de caixa...');

    try {
      await db.collection('caixa').drop();
      console.log('Coleção "caixa" removida.');
    } catch (err) {
      if (err.codeName === 'NamespaceNotFound' || err.message.includes('ns not found')) {
        console.log('Coleção "caixa" não existe, pulando.');
      } else {
        throw err;
      }
    }

    const caixa = db.collection('caixa');
    await caixa.createIndex({ dataAbertura: -1 });
    await caixa.createIndex({ status: 1 });
    console.log('Coleção "caixa" recriada com índices.');

    try {
      const logResult = await db.collection('logs').deleteMany({
        $or: [
          { acao: /caixa/i },
          { action: /caixa/i },
          { descricao: /caixa/i },
          { details: /caixa/i }
        ]
      });
      console.log(`Removidos ${logResult.deletedCount} logs relacionados a caixa.`);
    } catch (err) {
      console.error('Erro ao limpar logs:', err.message);
    }

    console.log('Dados de caixa removidos com sucesso!');
  } catch (error) {
    console.error('Erro ao limpar dados de caixa:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

clearCaixaData();
