// Retorna os dados do usuário autenticado (token via cookie HttpOnly).
// Substitui a dependência do frontend em localStorage para verificação de sessão.
const { getDb } = require("../../src/lib/mongodb");
const { verifyToken } = require("../../src/lib/auth");
const { ObjectId } = require("mongodb");
const { ok, unauthorized, notFound, serverError } = require("../../src/lib/helpers");

exports.handler = async (event, context) => {
  const user = verifyToken(event);
  if (!user) {
    return unauthorized();
  }

  try {
    const db = await getDb();
    const currentUser = await db.collection("users").findOne(
      { _id: new ObjectId(user.userId) },
      { projection: { name: 1, email: 1, role: 1, permissions: 1 } },
    );
    if (!currentUser) {
      return notFound("Usuário não encontrado");
    }

    return ok({
      user: {
        id: currentUser._id,
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role,
        permissions: currentUser.permissions || [],
      },
    });
  } catch (error) {
    return serverError(error);
  }
};
