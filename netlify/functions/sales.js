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
        const { start, end, status: filterStatus, caixaId, summary, page = 1, limit = 50 } = event.queryStringParameters || {};
        let query = {};
        
        if (start || end) {
          query.createdAt = {};
          if (start) query.createdAt.$gte = new Date(start);
          if (end) query.createdAt.$lte = new Date(end);
        }

        if (filterStatus) {
          query.status = filterStatus;
        }

        if (caixaId) {
          query.caixaId = new ObjectId(caixaId);
        }

        // Resumo agregado (sem itens) para fechamento de caixa
        if (summary === '1' || summary === 'true') {
          const agg = await sales.aggregate([
            { $match: query },
            { $project: { total: 1, totalDiscount: 1, paymentMethod: 1, splitPayment: 1 } },
            { $group: {
                _id: null,
                totalVendas: { $sum: { $ifNull: ['$total', 0] } },
                totalDescontos: { $sum: { $ifNull: ['$totalDiscount', 0] } },
                numeroVendas: { $sum: 1 },
                methods: { $push: { method: '$paymentMethod', total: { $ifNull: ['$total', 0] }, splitPayment: '$splitPayment' } }
            } }
          ]).toArray();
          const s = agg[0] || { totalVendas: 0, totalDescontos: 0, numeroVendas: 0, methods: [] };
          return { statusCode: 200, body: JSON.stringify({ summary: s }) };
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

          // Aplicar estoque novo de forma atômica (condição impede saldo negativo)
          const isReservedNew = updateData.status === 'RESERVED' || (!updateData.status && oldSale.status === 'RESERVED');
          const appliedNew = [];
          let applyFailed = false;
          for (const item of updateData.items) {
            let filter, update;
            if (isReservedNew) {
              filter = { _id: new ObjectId(item.id) };
              update = { $inc: { reserved: item.qty } };
            } else {
              filter = { _id: new ObjectId(item.id), quantity: { $gte: item.qty } };
              update = { $inc: { quantity: -item.qty } };
            }
            const upd = await db.collection('products').updateOne(filter, update);
            if (upd.modifiedCount !== 1) {
              applyFailed = true;
              break;
            }
            appliedNew.push({ id: item.id, qty: item.qty, isReserved: isReservedNew });
          }

          if (applyFailed) {
            // Reverter o que foi aplicado e restaurar estoque antigo
            await db.collection('products').bulkWrite(appliedNew.map(a => ({
              updateOne: {
                filter: { _id: new ObjectId(a.id) },
                update: a.isReserved
                  ? { $inc: { reserved: -a.qty } }
                  : { $inc: { quantity: a.qty } }
              }
            })).concat(revertOps));
            return { statusCode: 409, body: JSON.stringify({ message: 'Conflito de estoque. Saldo insuficiente para a edição.' }) };
          }
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
          change: changeAmount,
          caixaId,
          splitPayment
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
          caixaId: caixaId ? new ObjectId(caixaId) : null,
          splitPayment: splitPayment && splitPayment.cash != null ? {
            cash: Number(splitPayment.cash) || 0,
            method: splitPayment.method || 'Cartão de Crédito',
            rest: Number(splitPayment.rest) || 0
          } : null,
          userId: user.userId,
          createdAt: new Date()
        };

        const result = await sales.insertOne(sale);

        // Atualizar estoque de forma atômica (condição impede saldo negativo)
        const appliedStock = [];
        for (const [productId, wantQty] of demand.entries()) {
          let filter, update;
          if (saleStatus === 'RESERVED') {
            filter = {
              _id: new ObjectId(productId),
              $expr: {
                $gte: [
                  { $subtract: [{ $ifNull: ['$quantity', 0] }, { $ifNull: ['$reserved', 0] }] },
                  wantQty
                ]
              }
            };
            update = { $inc: { reserved: wantQty } };
          } else {
            filter = { _id: new ObjectId(productId), quantity: { $gte: wantQty } };
            update = { $inc: { quantity: -wantQty } };
          }
          const upd = await productsCol.updateOne(filter, update);
          if (upd.modifiedCount !== 1) {
            // Falhou: reverter o que já foi aplicado
            const rollback = appliedStock.map(s => ({
              updateOne: {
                filter: { _id: new ObjectId(s.productId) },
                update: saleStatus === 'RESERVED'
                  ? { $inc: { reserved: -s.wantQty } }
                  : { $inc: { quantity: s.wantQty } }
              }
            }));
            if (rollback.length > 0) {
              await productsCol.bulkWrite(rollback);
            }
            await sales.deleteOne({ _id: result.insertedId });
            return {
              statusCode: 409,
              body: JSON.stringify({
                message: 'Conflito de estoque. Produto não encontrado ou saldo insuficiente. Tente novamente.'
              })
            };
          }
          appliedStock.push({ productId, wantQty });
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
