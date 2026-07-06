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

    const { name, email, currentPassword, newPassword } = JSON.parse(event.body);

    const updateFields = {};

    // Se está alterando email, exige senha atual
    if (email !== undefined && email !== currentUser.email) {
      if (!currentPassword) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Confirme sua senha atual para alterar o email' }) };
      }
      const valid = await bcrypt.compare(currentPassword, currentUser.password);
      if (!valid) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Senha atual incorreta' }) };
      }
      const existing = await users.findOne({ email, _id: { $ne: currentUser._id } });
      if (existing) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Este email já está em uso' }) };
      }
      updateFields.email = email;
    }

    // Se está alterando senha, exige senha atual
    if (newPassword) {
      if (!currentPassword) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Informe sua senha atual para criar uma nova senha' }) };
      }
      const valid = await bcrypt.compare(currentPassword, currentUser.password);
      if (!valid) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Senha atual incorreta' }) };
      }
      if (newPassword.length < 4) {
        return { statusCode: 400, body: JSON.stringify({ message: 'A nova senha deve ter no mínimo 4 caracteres' }) };
      }
      updateFields.password = await bcrypt.hash(newPassword, 10);
    }

    // Nome pode ser alterado livremente
    if (name !== undefined && name.trim()) {
      updateFields.name = name.trim();
    }

    if (Object.keys(updateFields).length === 0) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Nenhum dado para atualizar' }) };
    }

    updateFields.updatedAt = new Date();
    await users.updateOne({ _id: currentUser._id }, { $set: updateFields });

    await db.collection('logs').insertOne({
      userId: user.userId,
      action: 'UPDATE_PROFILE',
      entity: 'users',
      entityId: currentUser._id,
      timestamp: new Date(),
      details: `Perfil atualizado: ${Object.keys(updateFields).filter(k => k !== 'password' && k !== 'updatedAt').join(', ')}`
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Perfil atualizado com sucesso',
        user: {
          name: updateFields.name || currentUser.name,
          email: updateFields.email || currentUser.email
        }
      })
    };
  } catch (error) {
    console.error('Auth update error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro ao atualizar perfil', error: error.message })
    };
  }
};
