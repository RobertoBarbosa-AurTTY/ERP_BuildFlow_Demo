const { getDb } = require('../../src/lib/mongodb');
const { verifyToken } = require('../../src/lib/auth');
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  const user = verifyToken(event);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ message: 'Não autorizado' }) };
  }

  try {
    const db = await getDb();
    const users = db.collection('users');

    const currentUser = await users.findOne({ _id: new ObjectId(user.userId) });
    if (!currentUser) {
      return { statusCode: 404, body: JSON.stringify({ message: 'Usuário não encontrado' }) };
    }

    const { password } = JSON.parse(event.body);
    if (!password) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Informe a senha' }) };
    }

    const valid = await bcrypt.compare(password, currentUser.password);
    if (!valid) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Senha incorreta' }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Senha verificada com sucesso' })
    };
  } catch (error) {
    console.error('Auth verify error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro ao verificar senha', error: error.message })
    };
  }
};
