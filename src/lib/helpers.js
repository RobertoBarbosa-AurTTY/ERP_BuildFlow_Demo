// Helpers comuns para as Netlify Functions: respostas padronizadas,
// autenticação por wrapper e tratamento de erro sem vazar detalhes.
const { verifyToken, checkPermission } = require("./auth");

function send(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}

function ok(body = {}) {
  return send(200, body);
}

function created(body = {}) {
  return send(201, body);
}

function badRequest(message) {
  return send(400, { message });
}

function unauthorized() {
  return send(401, { message: "Não autorizado" });
}

function forbidden() {
  return send(403, { message: "Acesso negado" });
}

function notFound(message = "Recurso não encontrado") {
  return send(404, { message });
}

function conflict(message = "Conflito") {
  return send(409, { message });
}

function methodNotAllowed() {
  return send(405, { message: "Método não permitido" });
}

// Erros SEMPRE genéricos para o cliente; detalhes vão para o log do servidor.
function serverError(error, message = "Erro interno no servidor") {
  console.error(error);
  return send(500, { message });
}

function getClientIp(event) {
  const headers = event.headers || {};
  const fwd = headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return headers["client-ip"] || headers["cf-connecting-ip"] || "local";
}

/**
 * Wrapper de autenticação e permissão para handlers.
 * handler(event, context, user) — `user` é o payload verificado do JWT.
 * options.roles: se informado, exige uma das roles (Admin sempre passa).
 */
function withAuth(handler, options = {}) {
  return async (event, context) => {
    const user = verifyToken(event);
    if (!user) return unauthorized();
    if (options.roles && !checkPermission(user, options.roles)) {
      return forbidden();
    }
    try {
      const result = await handler(event, context, user);
      // Handler pode retornar a resposta completa ou um objeto simples
      if (result && typeof result.statusCode === "number") {
        // Garante Content-Type JSON em qualquer resposta (inclusive erros)
        return {
          ...result,
          headers: { "Content-Type": "application/json", ...(result.headers || {}) },
        };
      }
      return ok(result);
    } catch (error) {
      return serverError(error);
    }
  };
}

module.exports = {
  send,
  ok,
  created,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  methodNotAllowed,
  serverError,
  getClientIp,
  withAuth,
};
