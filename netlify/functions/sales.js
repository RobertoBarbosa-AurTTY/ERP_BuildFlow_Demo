const { getDb } = require('../../src/lib/mongodb');
const { withAuth } = require('../../src/lib/helpers');
const { ObjectId } = require('mongodb');
const { nextSequence } = require('../../src/lib/counters');
const stock = require('../../src/lib/stock');

exports.handler = withAuth(async (event, context, user) => {
  

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
          sales.find(query, {
            projection: {
              userId: 0
            }
          }).sort({ createdAt: -1 }).skip(skip).limit(limitNum).toArray()
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

        const productsCol = db.collection('products');
        const oldItems = oldSale.items || [];
        const newStatus = updateData.status || oldSale.status;

        // Se o status mudou para FINALIZED (de RESERVED)
        if (newStatus === 'FINALIZED' && oldSale.status === 'RESERVED') {
          const finalized = await stock.finalizeReserved(productsCol, oldItems);
          if (!finalized.ok) {
            return { statusCode: 409, body: JSON.stringify({ message: 'Conflito de estoque. Saldo insuficiente para finalizar a venda.' }) };
          }
        } 
        // Se o status mudou para CANCELLED
        else if (newStatus === 'CANCELLED' && oldSale.status !== 'CANCELLED') {
          if (oldSale.status === 'RESERVED') {
            await stock.releaseReserved(productsCol, oldItems);
          } else if (oldSale.status === 'FINALIZED') {
            await stock.restoreStock(productsCol, oldItems);
          }
        }
        // Se houver edição de itens (simplificado: remove estoque antigo e aplica novo)
        else if (updateData.items && oldSale.status !== 'CANCELLED') {
          // Reverter estoque antigo conforme o status antigo
          await stock.revertStock(productsCol, oldItems, oldSale.status);

          // Aplicar estoque novo conforme o status novo (condição impede saldo negativo)
          const appliedNew = await stock.applyStock(productsCol, updateData.items, newStatus);
          if (!appliedNew.ok) {
            // Reverter parcial do novo e restaurar estoque antigo
            await stock.revertStock(productsCol, oldItems, oldSale.status);
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
          details: `Venda ${id} atualizada. Novo status: ${newStatus}`
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

        // Número sequencial atômico (sem colisão, ao contrário do timestamp+random)
        const saleNumber = await nextSequence('saleNumber');

        const sale = {
          saleNumber,
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
        const demandItems = Array.from(demand.entries()).map(([productId, qty]) => ({ id: productId, qty }));
        const applied = await stock.applyStock(productsCol, demandItems, saleStatus);
        if (!applied.ok) {
          await sales.deleteOne({ _id: result.insertedId });
          return {
            statusCode: 409,
            body: JSON.stringify({
              message: 'Conflito de estoque. Produto não encontrado ou saldo insuficiente. Tente novamente.'
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
        const productsToRestore = saleToDelete.items || [];
        if (saleToDelete.status === 'FINALIZED') {
          await stock.restoreStock(db.collection('products'), productsToRestore);
        } else if (saleToDelete.status === 'RESERVED') {
          await stock.releaseReserved(db.collection('products'), productsToRestore);
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
        message: 'Erro ao processar venda'
      }) 
    };
  }
});
