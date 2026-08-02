// Cadastro de Clientes (CRUD + busca).
const { ObjectId } = require("mongodb");
const { withAuth, badRequest, notFound, conflict } = require("../../src/lib/helpers");
const { parseBody, sanitizeString, sanitizeOptionalString, missingFields } = require("../../src/lib/validate");

const WRITE_ROLES = ["Admin", "Gerente"];

function normalizeCustomer(body) {
  return {
    name: sanitizeString(body.name, 120),
    cpfCnpj: sanitizeOptionalString(body.cpfCnpj, 18),
    email: sanitizeOptionalString(body.email, 120)?.toLowerCase(),
    phone: sanitizeOptionalString(body.phone, 30),
    address: sanitizeOptionalString(body.address, 250),
    notes: sanitizeOptionalString(body.notes, 500),
    active: body.active !== false,
  };
}

exports.handler = withAuth(async (event, context, user) => {
  const db = await require("../../src/lib/mongodb").getDb();
  const customers = db.collection("customers");

  switch (event.httpMethod) {
    case "GET": {
      const { search, page = 1, limit = 50 } = event.queryStringParameters || {};
      const query = {};
      if (search) {
        const term = sanitizeString(search, 120);
        query.$or = [
          { name: { $regex: term, $options: "i" } },
          { cpfCnpj: { $regex: term, $options: "i" } },
          { email: { $regex: term, $options: "i" } },
          { phone: { $regex: term, $options: "i" } },
        ];
      }

      const pageNum = Math.max(1, parseInt(page, 10));
      const limitNum = limit === "all" ? 0 : Math.min(500, Math.max(1, parseInt(limit, 10)));
      const skip = limitNum === 0 ? 0 : (pageNum - 1) * limitNum;

      const [totalCount, data] = await Promise.all([
        customers.countDocuments(query),
        customers.find(query).sort({ name: 1 }).skip(skip).limit(limitNum).toArray(),
      ]);

      return {
        statusCode: 200,
        body: JSON.stringify({
          data,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: totalCount,
            totalPages: limitNum === 0 ? 1 : Math.ceil(totalCount / limitNum),
          },
        }),
      };
    }

    case "POST": {
      if (!WRITE_ROLES.includes(user.role)) {
        return { statusCode: 403, body: JSON.stringify({ message: "Acesso negado" }) };
      }
      const parsed = parseBody(event);
      if (parsed.error) return badRequest(parsed.error);
      const missing = missingFields(parsed.value, ["name"]);
      if (missing.length) return badRequest("Nome é obrigatório");

      const customer = normalizeCustomer(parsed.value);
      const now = new Date();
      customer.createdAt = now;
      customer.updatedAt = now;

      if (customer.email) {
        const exists = await customers.findOne({ email: customer.email });
        if (exists) return conflict("Já existe um cliente com esse e-mail");
      }

      const result = await customers.insertOne(customer);
      await db.collection("logs").insertOne({
        userId: user.userId,
        action: "CREATE_CUSTOMER",
        entity: "customers",
        entityId: result.insertedId,
        timestamp: now,
        details: `Cliente "${customer.name}" cadastrado`,
      });

      return { statusCode: 201, body: JSON.stringify({ ...customer, _id: result.insertedId }) };
    }

    case "PUT": {
      if (!WRITE_ROLES.includes(user.role)) {
        return { statusCode: 403, body: JSON.stringify({ message: "Acesso negado" }) };
      }
      const { id } = event.queryStringParameters || {};
      if (!id) return badRequest("ID do cliente é obrigatório");
      const parsed = parseBody(event);
      if (parsed.error) return badRequest(parsed.error);

      const existing = await customers.findOne({ _id: new ObjectId(id) });
      if (!existing) return notFound("Cliente não encontrado");

      const patch = normalizeCustomer({ ...existing, ...parsed.value });
      if (!patch.name) return badRequest("Nome é obrigatório");
      patch.updatedAt = new Date();

      if (patch.email) {
        const dup = await customers.findOne({ email: patch.email, _id: { $ne: existing._id } });
        if (dup) return conflict("Já existe um cliente com esse e-mail");
      }

      await customers.updateOne({ _id: existing._id }, { $set: patch });
      await db.collection("logs").insertOne({
        userId: user.userId,
        action: "UPDATE_CUSTOMER",
        entity: "customers",
        entityId: existing._id,
        timestamp: new Date(),
        details: `Cliente "${patch.name}" atualizado`,
      });

      return { statusCode: 200, body: JSON.stringify({ ...existing, ...patch }) };
    }

    case "DELETE": {
      if (!["Admin"].includes(user.role)) {
        return { statusCode: 403, body: JSON.stringify({ message: "Acesso negado" }) };
      }
      const { id } = event.queryStringParameters || {};
      if (!id) return badRequest("ID do cliente é obrigatório");
      const existing = await customers.findOne({ _id: new ObjectId(id) });
      if (!existing) return notFound("Cliente não encontrado");

      await customers.deleteOne({ _id: existing._id });
      await db.collection("logs").insertOne({
        userId: user.userId,
        action: "DELETE_CUSTOMER",
        entity: "customers",
        entityId: existing._id,
        timestamp: new Date(),
        details: `Cliente "${existing.name}" excluído`,
      });
      return { statusCode: 200, body: JSON.stringify({ message: "Cliente excluído" }) };
    }

    default:
      return { statusCode: 405, body: JSON.stringify({ message: "Método não permitido" }) };
  }
});
