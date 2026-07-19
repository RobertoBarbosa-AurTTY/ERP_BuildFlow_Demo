const { getDb } = require('../../src/lib/mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    if (!event.body) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Corpo da requisição ausente' }) };
    }

    const { email, password } = JSON.parse(event.body);

    const db = await getDb();
    const users = db.collection('users');

    const user = await users.findOne({ email });

    if (!user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Credenciais inválidas' })
      };
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Credenciais inválidas' })
      };
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    db.collection('logs').insertOne({
      userId: user._id,
      action: 'LOGIN',
      entity: 'users',
      timestamp: new Date(),
      details: `Login bem sucedido para ${user.email}`
    }).catch(() => {});

    return {
      statusCode: 200,
      headers: {
        'Set-Cookie': `token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
      },
      body: JSON.stringify({
        message: 'Login realizado com sucesso',
        token,
        user: {
          name: user.name,
          email: user.email,
          role: user.role
        }
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        message: 'Erro interno no servidor',
        error: error.message
      })
    };
  }
};
