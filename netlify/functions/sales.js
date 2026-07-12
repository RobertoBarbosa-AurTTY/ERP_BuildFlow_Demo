const { getDb } = require('../../src/lib/mongodb');
const { verifyToken } = require('../../src/lib/auth');
const { ObjectId } = require('mongodb');

exports.handler = async (event, context) => {
  const user = verifyToken(event);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ message: 'Não autorizado' }) };
  }

  const db = await getDb();
  const sales = db.collection('sales');

  try {
    switch (event.httpMethod) {
      case 'GET':
        const { start, end, status: filterStatus, page = 1, limit = 50 } = event.queryStringParameters || {};
        let query = {};
        
        if (start || end) {
          query.createdAt = {};
          if (start) query.createdAt.$gte = new Date(start);
          if (end) query.createdAt.$lte = new Date(end);
        }

        if (filterStatus) {
          query.status = filterStatus;
        }

        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = limit === "all" ? 0 : Math.min(10000, Math.max(1, parseInt(limit, 10)));
        const skip = limitNum === 0 ? 0 : (pageNum - 1) * limitNum;

        // Executar count e find em paralelo
        const [totalCount, data] = await Promise.all([
          sales.countDocuments(query),
          sales.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).toArray()
        ]);

        const totalPages = limitNum === 0 ? 1 : Math.ceil(totalCount / limitNum);

        return { 
          statusCode: 200, 
          body: JSON.stringify({
            data,
            pagination: {
              page: pageNum,
              limit: limitNum,
              total: totalCount,
              totalPages
            }
          }) 
        };

      case 'PUT':
        const { id } = event.queryStringParameters || {};
        if (!id) return { statusCode: 400, body: 'ID da venda é obrigatório' };

        const updateData = JSON.parse(event.body);
        const oldSale = await sales.findOne({ _id: new ObjectId(id) });
        if (!oldSale) return { statusCode: 404, body: 'Venda não encontrada' };

        // Se o status mudou para FINALIZED (de RESERVED)
        if (updateData.status === 'FINALIZED' && oldSale.status === 'RESERVED') {
          const bulkOps = oldSale.items.map(item => ({
            updateOne: {
              filter: { _id: new ObjectId(item.id) },
              update: { 
                $inc: { 
                  reserved: -item.qty,
                  quantity: -item.qty
                } 
              }
            }
          }));
          await db.collection('products').bulkWrite(bulkOps);
        } 
        // Se o status mudou para CANCELLED
        else if (updateData.status === 'CANCELLED' && oldSale.status !== 'CANCELLED') {
          const bulkOps = oldSale.items.map(item => ({
            updateOne: {
              filter: { _id: new ObjectId(item.id) },
              update: oldSale.status === 'RESERVED' 
                ? { $inc: { reserved: -item.qty } }
                : { $inc: { quantity: item.qty } }
            }
          }));
          await db.collection('products').bulkWrite(bulkOps);
        }
        // Se houver edição de itens (simplificado: remove estoque antigo e aplica novo)
        else if (updateData.items && oldSale.status !== 'CANCELLED') {
          // Reverter estoque antigo
          const revertOps = oldSale.items.map(item => ({
            updateOne: {
              filter: { _id: new ObjectId(item.id) },
              update: oldSale.status === 'RESERVED'
                ? { $inc: { reserved: -item.qty } }
                : { $inc: { quantity: item.qty } }
            }
          }));
          await db.collection('products').bulkWrite(revertOps);
          
          // Aplicar estoque novo
          const applyOps = updateData.items.map(item => ({
            updateOne: {
              filter: { _id: new ObjectId(item.id) },
              update: (updateData.status === 'RESERVED' || (!updateData.status && oldSale.status === 'RESERVED'))
                ? { $inc: { reserved: item.qty } }
                : { $inc: { quantity: -item.qty } }
            }
          }));
          await db.collection('products').bulkWrite(applyOps);
        }

        await sales.updateOne(
          { _id: new ObjectId(id) },
          { $set: { ...updateData, updatedAt: new Date() } }
        );

        // Log de auditoria
        await db.collection('logs').insertOne({
          userId: user.userId,
          action: 'UPDATE_SALE',
          entity: 'sales',
          entityId: new ObjectId(id),
          timestamp: new Date(),
          details: `Venda ${id} atualizada. Novo status: ${updateData.status || oldSale.status}`
        });

        return { statusCode: 200, body: JSON.stringify({ message: 'Venda atualizada com sucesso' }) };

      case 'POST': {
        const body = JSON.parse(event.body);
        const {
          items,
          total,
          globalDiscount,
          globalDiscountType,
          status,
          paymentMethod,
          subtotal,
          grossSubtotal,
          itemsDiscountTotal,
          globalDiscountAmount,
          totalDiscount,
          amountPaid,
          change: changeAmount
        } = body;
        const saleStatus = status || 'FINALIZED';

        if (!items || !items.length) {
          return { statusCode: 400, body: JSON.stringify({ message: 'A venda precisa ter ao menos um item.' }) };
        }

        const productsCol = db.collection('products');
        const demand = new Map();
        for (const item of items) {
          if (!item.id) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Item sem identificador de produto.' }) };
          }
          const qty = Math.max(0, Number(item.qty) || 0);
          if (qty < 1) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Quantidade inválida em um dos itens.' }) };
          }
          const id = String(item.id);
          demand.set(id, (demand.get(id) || 0) + qty);
        }

        const numericId = parseInt(`${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`);

        const sale = {
          saleNumber: numericId,
          items,
          total: Number(total) || 0,
          subtotal: grossSubtotal != null ? Number(grossSubtotal) : (subtotal != null ? Number(subtotal) : undefined),
          grossSubtotal: grossSubtotal != null ? Number(grossSubtotal) : undefined,
          itemsDiscountTotal: itemsDiscountTotal != null ? Number(itemsDiscountTotal) : 0,
          globalDiscount: globalDiscount || 0,
          globalDiscountType: globalDiscountType || 'percent',
          globalDiscountAmount: globalDiscountAmount != null ? Number(globalDiscountAmount) : 0,
          totalDiscount: totalDiscount != null ? Number(totalDiscount) : 0,
          status: saleStatus,
          paymentMethod: paymentMethod || 'Dinheiro',
          amountPaid: amountPaid != null ? Number(amountPaid) : null,
          change: changeAmount != null ? Number(changeAmount) : null,
          userId: user.userId,
          createdAt: new Date()
        };

        const result = await sales.insertOne(sale);
        const appliedStock = [];

        // Atualizar estoque em massa
        const bulkOps = Array.from(demand.entries()).map(([productId, wantQty]) => ({
          updateOne: {
            filter: { _id: new ObjectId(productId) },
            update: saleStatus === 'RESERVED'
              ? { $inc: { reserved: wantQty } }
              : { $inc: { quantity: -wantQty } }
          }
        }));

        const bulkResult = await productsCol.bulkWrite(bulkOps);
        
        if (bulkResult.matchedCount !== demand.size) {
          await sales.deleteOne({ _id: result.insertedId });
          return {
            statusCode: 409,
            body: JSON.stringify({
              message: 'Conflito de estoque. Produto não encontrado. Tente novamente.'
            })
          };
        }

        // 3. Log de auditoria
        await db.collection('logs').insertOne({
          userId: user.userId,
          action: 'CREATE_SALE',
          entity: 'sales',
          entityId: result.insertedId,
          timestamp: new Date(),
          details: `Venda ${result.insertedId} realizada no valor de R$ ${sale.total}`
        });

        return {
          statusCode: 201,
          body: JSON.stringify({
            message: 'Venda realizada com sucesso',
            saleId: result.insertedId,
            id: result.insertedId,
            _id: result.insertedId,
            saleNumber: sale.saleNumber,
            sale
          })
        };
      }

      case 'DELETE':
        const deleteId = event.queryStringParameters?.id;
        if (!deleteId) return { statusCode: 400, body: JSON.stringify({ message: 'ID da venda é obrigatório' }) };

        const saleToDelete = await sales.findOne({ _id: new ObjectId(deleteId) });
        if (!saleToDelete) return { statusCode: 404, body: JSON.stringify({ message: 'Venda não encontrada' }) };

        // Restaurar estoque dos produtos
        if (saleToDelete.status === 'FINALIZED') {
          const restoreOps = saleToDelete.items.map(item => ({
            updateOne: {
              filter: { _id: new ObjectId(item.id) },
              update: { $inc: { quantity: item.qty } }
            }
          }));
          await db.collection('products').bulkWrite(restoreOps);
        } else if (saleToDelete.status === 'RESERVED') {
          const releaseOps = saleToDelete.items.map(item => ({
            updateOne: {
              filter: { _id: new ObjectId(item.id) },
              update: { $inc: { reserved: -item.qty } }
            }
          }));
          await db.collection('products').bulkWrite(releaseOps);
        }

        // Remover logs relacionados
        await db.collection('logs').deleteMany({ entityId: new ObjectId(deleteId), entity: 'sales' });

        // Remover a venda
        await sales.deleteOne({ _id: new ObjectId(deleteId) });

        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Venda excluída permanentemente e estoque restaurado' })
        };

      default:
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
  } catch (error) {
    console.error('Sales function error:', error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ 
        message: 'Erro ao processar venda',
        error: error.message
      }) 
    };
  }
};
