const { getDb } = require("../../src/lib/mongodb");
const { verifyToken, checkPermission } = require("../../src/lib/auth");
const { ObjectId } = require("mongodb");

exports.handler = async (event, context) => {
  const user = verifyToken(event);
  if (!user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Não autorizado" }),
    };
  }

  const db = await getDb();
  const products = db.collection("products");

  try {
    switch (event.httpMethod) {
      case "GET":
        const { search, category, status, page = 1, limit = 50 } = event.queryStringParameters || {};
        let query = {};

        if (search) {
          query.$or = [
            { name: { $regex: search, $options: "i" } },
            { sku: { $regex: search, $options: "i" } },
            { barcode: { $regex: search, $options: "i" } },
            { supplier: { $regex: search, $options: "i" } },
          ];
        }
        if (category && category !== "all") query.category = category;
        if (status && status !== "all") query.status = status;

        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = limit === "all" ? 0 : Math.min(100, Math.max(1, parseInt(limit, 10)));
        const skip = limitNum === 0 ? 0 : (pageNum - 1) * limitNum;

        // Executar count e find em paralelo
        const [totalCount, data] = await Promise.all([
          products.countDocuments(query),
          products.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).toArray()
        ]);

        return { 
          statusCode: 200, 
          body: JSON.stringify({
            data,
            pagination: {
              page: pageNum,
              limit: limitNum,
              total: totalCount,
              totalPages: Math.ceil(totalCount / limitNum)
            }
          }) 
        };

      case "POST":
        if (!checkPermission(user, ["Admin", "Gerente"])) {
          return {
            statusCode: 403,
            body: JSON.stringify({ message: "Acesso negado" }),
          };
        }
        const newProduct = JSON.parse(event.body);
        const now = new Date();
        newProduct.createdAt = now;
        newProduct.dataEntrada = now; // Data de entrada única
        newProduct.dataAtualizacao = now; // Data de atualização inicial

        // Auto-assign Receiving location if not provided
        if (!newProduct.location) {
          newProduct.location = {
            aisle: "RECV",
            shelf: "00",
            level: "00",
            slot: "00",
            deposit: "DEPÓSITO 01",
          };
        } else if (!newProduct.location.deposit) {
          newProduct.location.deposit = "DEPÓSITO 01";
        }

        const result = await products.insertOne(newProduct);

        await db.collection("logs").insertOne({
          userId: user.userId,
          action: "CREATE_PRODUCT",
          entity: "products",
          entityId: result.insertedId,
          timestamp: new Date(),
          details: `Produto ${newProduct.name} criado em Recebimento`,
        });

        return { statusCode: 201, body: JSON.stringify(result) };

      case "PUT":
        if (!checkPermission(user, ["Admin", "Gerente"])) {
          return {
            statusCode: 403,
            body: JSON.stringify({ message: "Acesso negado" }),
          };
        }
        const { id, adjustmentReason, transfer, ...updates } = JSON.parse(
          event.body,
        );
        const oldProduct = await products.findOne({ _id: new ObjectId(id) });

        // Sempre atualiza dataAtualizacao
        updates.dataAtualizacao = new Date();

        // Se não tem dataEntrada, define a data atual (para produtos existentes)
        if (!oldProduct?.dataEntrada) {
          updates.dataEntrada = new Date();
        }

        await products.updateOne({ _id: new ObjectId(id) }, { $set: updates });

        let logAction = "UPDATE_PRODUCT";
        let logDetails = `Produto ${oldProduct ? oldProduct.name : id} atualizado. Alterações: ${Object.keys(updates).join(", ")}`;

        if (adjustmentReason) {
          logDetails = `AJUSTE MANUAL: ${oldProduct ? oldProduct.name : id}. Nova Qtd: ${updates.quantity}. Motivo: ${adjustmentReason}`;
        }

        if (transfer && updates.location && oldProduct) {
          let operatorName = user.name || user.email || "Usuário";
          try {
            const operator = await db
              .collection("users")
              .findOne({ _id: new ObjectId(user.userId) });
            if (operator?.name) operatorName = operator.name;
          } catch (_) {
            /* ignore */
          }

          const movement = {
            sku: oldProduct.sku || "",
            productName: oldProduct.name || "",
            originDeposit: transfer.originDeposit || "",
            originAddress: transfer.originAddress || "",
            destinationDeposit: transfer.destinationDeposit || "",
            destinationAddress: transfer.destinationAddress || "",
            userId: user.userId,
            userName: operatorName,
            timestamp: new Date(),
          };

          await db.collection("movimentacoes_estoque").insertOne(movement);

          logAction = "TRANSFER_PRODUCT";
          logDetails = `SKU ${movement.sku} (${movement.productName}): ${movement.originDeposit} / ${movement.originAddress} → ${movement.destinationDeposit} / ${movement.destinationAddress} — operador ${operatorName}`;
        }

        await db.collection("logs").insertOne({
          userId: user.userId,
          action: logAction,
          entity: "products",
          entityId: new ObjectId(id),
          timestamp: new Date(),
          details: logDetails,
        });

        return {
          statusCode: 200,
          body: JSON.stringify({ message: "Atualizado com sucesso" }),
        };

      case "DELETE":
        if (!checkPermission(user, ["Admin"])) {
          return {
            statusCode: 403,
            body: JSON.stringify({ message: "Acesso negado" }),
          };
        }
        const productId = event.queryStringParameters.id;
        const productToDelete = await products.findOne({
          _id: new ObjectId(productId),
        });
        await products.deleteOne({ _id: new ObjectId(productId) });

        await db.collection("logs").insertOne({
          userId: user.userId,
          action: "DELETE_PRODUCT",
          entity: "products",
          entityId: new ObjectId(productId),
          timestamp: new Date(),
          details: `Produto ${productToDelete ? productToDelete.name : productId} (SKU: ${productToDelete ? productToDelete.sku : "N/A"}) excluído permanentemente do estoque`,
        });

        return {
          statusCode: 200,
          body: JSON.stringify({ message: "Removido com sucesso" }),
        };

      default:
        return { statusCode: 405, body: "Method Not Allowed" };
    }
  } catch (error) {
    console.error("Products function error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Erro no servidor",
        error: error.message,
      }),
    };
  }
};
