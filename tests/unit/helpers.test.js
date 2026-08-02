const { test } = require("node:test");
const assert = require("node:assert");

// Stub do auth para controlar o usuário verificado
const authPath = require.resolve("../../src/lib/auth");
let fakeUser = null;
require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: {
    verifyToken: () => fakeUser,
    checkPermission: (user, roles) => {
      if (!user) return false;
      if (user.role === "Admin") return true;
      return roles.includes(user.role);
    },
  },
};

const { withAuth, badRequest, unauthorized } = require("../../src/lib/helpers");

test("withAuth: 401 sem token", async () => {
  fakeUser = null;
  const res = await withAuth(async () => ({}))({ httpMethod: "GET" });
  assert.strictEqual(res.statusCode, 401);
});

test("withAuth: 403 para role sem permissão", async () => {
  fakeUser = { role: "Vendedor", userId: "1" };
  const res = await withAuth(async () => ({}), { roles: ["Admin", "Gerente"] })({ httpMethod: "GET" });
  assert.strictEqual(res.statusCode, 403);
});

test("withAuth: Admin sempre passa", async () => {
  fakeUser = { role: "Admin", userId: "1" };
  const res = await withAuth(async () => ({ ok: true }), { roles: ["Gerente"] })({ httpMethod: "GET" });
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.body), { ok: true });
});

test("withAuth: handler recebe o usuário", async () => {
  fakeUser = { role: "Admin", userId: "abc" };
  let received = null;
  await withAuth(async (event, ctx, user) => {
    received = user;
    return { ok: true };
  })({ httpMethod: "GET" });
  assert.strictEqual(received.userId, "abc");
});

test("withAuth: erro do handler vira 500 genérico (sem vazar detalhes)", async () => {
  fakeUser = { role: "Admin", userId: "1" };
  const res = await withAuth(async () => {
    throw new Error("senha_do_banco_vazou");
  })({ httpMethod: "GET" });
  assert.strictEqual(res.statusCode, 500);
  assert.ok(!JSON.stringify(res.body).includes("senha_do_banco_vazou"));
  assert.strictEqual(JSON.parse(res.body).message, "Erro interno no servidor");
});

test("badRequest retorna 400 com message", () => {
  const res = badRequest("campo obrigatório");
  assert.strictEqual(res.statusCode, 400);
  assert.deepStrictEqual(JSON.parse(res.body), { message: "campo obrigatório" });
});

test("unauthorized retorna 401", () => {
  assert.strictEqual(unauthorized().statusCode, 401);
});
