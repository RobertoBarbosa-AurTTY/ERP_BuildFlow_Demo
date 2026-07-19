require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function resetDatabase() {
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
    console.log('Conectado ao MongoDB. Limpando dados...');

    const collectionsToDrop = [
      'products',
      'sales',
      'purchases',
      'logs',
      'warehouse_addresses',
      'units',
      'settings',
      'movimentacoes_estoque'
    ];

    for (const name of collectionsToDrop) {
      const coll = db.collection(name);
      try {
        await coll.drop();
        console.log(`Coleção '${name}' removida.`);
      } catch (dropError) {
        if (dropError.codeName === 'NamespaceNotFound' || dropError.message.includes('ns not found')) {
          console.log(`Coleção '${name}' não existe, pulando.`);
        } else {
          throw dropError;
        }
      }
    }

    const users = db.collection('users');
    const deleteResult = await users.deleteMany({ role: { $ne: 'Admin' } });
    console.log(`Removidos ${deleteResult.deletedCount} usuários não administradores.`);

    const adminEmail = 'admin@buildflow.com.br';
    const existingAdmin = await users.findOne({ email: adminEmail });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await users.insertOne({
        name: 'Administrador Master',
        email: adminEmail,
        password: hashedPassword,
        role: 'Admin',
        permissions: ['all'],
        createdAt: new Date()
      });
      console.log('Usuário administrador criado: admin@buildflow.com.br / admin123');
    } else {
      console.log('Usuário administrador existente mantido:', adminEmail);
    }

    const secondUserEmail = 'coringa@gmail.com';
    const existingSecondUser = await users.findOne({ email: secondUserEmail });
    if (!existingSecondUser) {
      const hashedPassword = await bcrypt.hash('123', 10);
      await users.insertOne({
        name: 'Coringa',
        email: secondUserEmail,
        password: hashedPassword,
        role: 'Admin',
        permissions: ['all'],
        createdAt: new Date()
      });
      console.log('Usuário criado: coringa@gmail.com / 123');
    } else {
      console.log('Usuário existente mantido:', secondUserEmail);
    }

    console.log('Reset do banco finalizado. Agora o sistema possui os usuários administrador e coringa.');
  } catch (error) {
    console.error('Erro ao resetar o banco de dados:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

resetDatabase();
