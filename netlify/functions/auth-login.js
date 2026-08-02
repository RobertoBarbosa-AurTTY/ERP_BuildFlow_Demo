const { getDb } = require('../../src/lib/mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('../../src/lib/rate-limit');
const { parseBody, sanitizeString } = require('../../src/lib/validate');
const { badRequest, unauthorized, serverError, send } = require('../../src/lib/helpers');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return send(405, { message: 'Método não permitido' });
  }

  // Rate limit: 10 tentativas por 15 minutos por IP
  const limited = await rateLimit(event, 'auth-login', { max: 10 });
  if (limited) return limited;

  const parsed = parseBody(event);
  if (parsed.error) return badRequest(parsed.error);

  const email = sanitizeString(parsed.value.email, 120).toLowerCase();
  const password = parsed.value.password;

  if (!email || typeof password !== 'string' || !password) {
    return badRequest('Informe e-mail e senha');
  }

  try {
    const db = await getDb();
    const user = await db.collection('users').findOne({ email });

    if (!user) {
      return unauthorized();
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return unauthorized();
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
        'Content-Type': 'application/json',
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
    return serverError(error);
  }
};
