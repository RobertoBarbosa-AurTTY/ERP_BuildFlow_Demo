const { ObjectId } = require('mongodb');
const { getDb } = require('../../src/lib/mongodb');
const { withAuth } = require('../../src/lib/helpers');
const { cached } = require('../../src/lib/cache');

exports.handler = withAuth(async (event, context, user) => {
  

  try {
    const db = await getDb();
    const period = event.queryStringParameters?.period || 'month';
    const tzOffset = parseInt(event.queryStringParameters?.tzOffset) || 0;
    const selectedDate = event.queryStringParameters?.date;

    const cacheKey = `dash:${period}:${selectedDate || ''}:${tzOffset}`;
    const payload = await cached(cacheKey, 60 * 1000, async () => {

    const now = new Date();
    const localEpoch = now.getTime() - tzOffset * 60000;
    const localDate = new Date(localEpoch);
    const localMidnightEpoch = Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate());
    const todayStart = new Date(localMidnightEpoch + tzOffset * 60000);

    let currentStart, currentEnd, prevStart, prevEnd;

    if (period === 'day') {
      let dayStart;
      if (selectedDate) {
        const [y, m, d] = selectedDate.split('-').map(Number);
        dayStart = new Date(Date.UTC(y, m - 1, d) + tzOffset * 60000);
      } else {
        dayStart = new Date(todayStart);
      }
      currentStart = new Date(dayStart);
      currentEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      prevStart = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000);
      prevEnd = new Date(dayStart);
    } else if (period === 'week') {
      currentStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
      currentEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
      prevStart = new Date(currentStart.getTime() - 7 * 24 * 60 * 60 * 1000);
      prevEnd = new Date(currentStart);
    } else {
      // month (default)
      const monthStart = (y, m) => Date.UTC(y, m, 1) + tzOffset * 60000;
      currentStart = new Date(monthStart(todayStart.getFullYear(), todayStart.getMonth()));
      currentEnd = new Date(monthStart(todayStart.getFullYear(), todayStart.getMonth() + 1));
      prevStart = new Date(monthStart(todayStart.getFullYear(), todayStart.getMonth() - 1));
      prevEnd = new Date(monthStart(todayStart.getFullYear(), todayStart.getMonth()));
    }

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysFromNow = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    // PARALELIZAR TODAS AS CONSULTAS PARA MÁXIMA VELOCIDADE
    const [
      dailySales,
      productsColStats,
      lowStockProducts,
      overstockProducts,
      entriesLast24h,
      recentSales,
      recentProducts,
      cashMovements,
      pendingSales,
      recentMovements,
      idleStockProducts,
      nearExpiryProducts,
      recentStockMovements,
      overduePayables,
      dueSoonPayables,
      prevMonthSales
    ] = await Promise.all([
      // 1. Vendas do período
      db.collection('sales').find(
        { createdAt: { $gte: currentStart, $lt: currentEnd }, status: 'FINALIZED' },
        { projection: { total: 1, items: 1, _id: 0 } }
      ).toArray(),
      
      // 2. Estatísticas de produtos (count)
      db.collection('products').countDocuments(),
      
      // 3. Produtos com estoque baixo
      db.collection('products').find({
        $expr: {
          $lte: [
            { $ifNull: ['$quantity', 0] },
            { $ifNull: ['$minStock', 20] }
          ]
        }
      }, {
        projection: { name: 1, sku: 1, quantity: 1, minStock: 1, maxStock: 1, perishable: 1, expiryDate: 1, validade: 1, expirationDate: 1 }
      }).toArray(),
      
      // 4. Produtos com excesso de estoque
      db.collection('products').find({
        $expr: {
          $and: [
            { $gt: ['$maxStock', 0] },
            { $gte: [{ $ifNull: ['$quantity', 0] }, '$maxStock'] }
          ]
        }
      }).toArray(),
      
      // 5. Entradas nas últimas 24h
      db.collection('products').find(
        { createdAt: { $gte: oneDayAgo } },
        { projection: { _id: 1 } }
      ).toArray(),
      
      // Vendas recentes do período (últimas 10)
      db.collection('sales')
        .find({ createdAt: { $gte: currentStart, $lt: currentEnd } }, { projection: { _id: 1, saleNumber: 1, total: 1, status: 1, createdAt: 1, items: 1 } })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray(),
      
      // Produtos recentes do período (últimos 10)
      db.collection('products')
        .find({ createdAt: { $gte: currentStart, $lt: currentEnd } }, { projection: { _id: 1, name: 1, sku: 1, quantity: 1, price: 1, createdAt: 1 } })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray(),

      // Movimentos de caixa do período (sangrias e suprimentos)
      db.collection('retiradas_caixa')
        .find({ createdAt: { $gte: currentStart, $lt: currentEnd } })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray(),
      
      // Vendas pendentes (reservadas há mais de 24h)
      db.collection('sales').find(
        { status: 'RESERVED', createdAt: { $lte: oneDayAgo } },
        { projection: { _id: 1, saleNumber: 1, createdAt: 1 } }
      ).toArray(),
      
      // Movimentações recentes (últimos 7 dias) - apenas sku
      db.collection('movimentacoes_estoque')
        .find({ timestamp: { $gte: sevenDaysAgo } }, { projection: { sku: 1, _id: 0 } })
        .toArray(),
      
      // Produtos parados (sem movimento nos últimos 7 dias)
      (async () => {
        const movements = await db.collection('movimentacoes_estoque')
          .find({ timestamp: { $gte: sevenDaysAgo } }, { projection: { sku: 1, _id: 0 } })
          .toArray();
        const activeSkus = new Set(movements.map(m => m.sku).filter(Boolean));
        
        return db.collection('products').find(
          { 
            quantity: { $gt: 0 }, 
            sku: { $nin: Array.from(activeSkus) } 
          },
          { 
            projection: { name: 1, sku: 1, quantity: 1, minStock: 1, maxStock: 1, perishable: 1, expiryDate: 1, validade: 1, expirationDate: 1 } 
          }
        ).limit(10).toArray();
      })(),
      
      // Produtos próximos ao vencimento (próximos 14 dias)
      db.collection('products').find({
        $or: [
          { expiryDate: { $gte: todayStart, $lte: fourteenDaysFromNow } },
          { validade: { $gte: todayStart, $lte: fourteenDaysFromNow } },
          { expirationDate: { $gte: todayStart, $lte: fourteenDaysFromNow } }
        ]
      }, {
        projection: { name: 1, sku: 1, quantity: 1, minStock: 1, maxStock: 1, perishable: 1, expiryDate: 1, validade: 1, expirationDate: 1 }
      }).toArray(),
      
      // Movimentações de estoque recentes (últimas 24h)
      db.collection('movimentacoes_estoque')
        .find({ timestamp: { $gte: oneDayAgo } })
        .sort({ timestamp: -1 })
        .toArray(),

      // Contas a pagar vencidas
      db.collection('accounts_payable').find({
        status: { $nin: ['paid', 'cancelled'] },
        paidDate: { $in: [null, undefined] },
        dueDate: { $lt: todayStart }
      }, {
        projection: { description: 1, supplier: 1, amount: 1, dueDate: 1, _id: 1 }
      }).sort({ dueDate: 1 }).limit(10).toArray(),

      // Contas a pagar com vencimento próximo (3 dias)
      (async () => {
        const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        threeDaysFromNow.setHours(23, 59, 59, 999);
        return db.collection('accounts_payable').find({
          status: { $nin: ['paid', 'cancelled'] },
          paidDate: { $in: [null, undefined] },
          dueDate: { $gte: todayStart, $lte: threeDaysFromNow }
        }, {
          projection: { description: 1, supplier: 1, amount: 1, dueDate: 1, _id: 1 }
        }).sort({ dueDate: 1 }).limit(10).toArray();
      })(),

      // Vendas do período anterior (comparativo)
      db.collection('sales').find(
        { createdAt: { $gte: prevStart, $lt: prevEnd }, status: 'FINALIZED' },
        { projection: { total: 1, items: 1, _id: 0 } }
      ).toArray()
    ]);

    // Calcular faturamento e lucro
    const revenue = dailySales.reduce((acc, sale) => acc + (Number(sale.total) || 0), 0);
    let estimatedProfit = 0;
    for (const sale of dailySales) {
      if (sale.items && sale.items.length > 0) {
        for (const item of sale.items) {
          const qty = Number(item.qty) || 1;
          const lineTotal = Number(item.lineTotal) || (Number(item.price) || 0) * qty;
          const unitCost = Number(item.costPrice) || (Number(item.price) || 0) * 0.7;
          estimatedProfit += lineTotal - unitCost * qty;
        }
      } else {
        const saleTotal = Number(sale.total) || 0;
        estimatedProfit += saleTotal * 0.25;
      }
    }

    // Comparativo com mês anterior
    const prevRevenue = prevMonthSales.reduce((acc, sale) => acc + (Number(sale.total) || 0), 0);
    const revenueChange = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue * 100).toFixed(1) : null;

    // Top 10 produtos mais vendidos no período
    const productSales = {};
    for (const sale of dailySales) {
      if (sale.items && sale.items.length > 0) {
        for (const item of sale.items) {
          const name = item.name || 'Produto';
          if (!productSales[name]) {
            productSales[name] = { name, qty: 0, revenue: 0, category: item.category || '', productId: item.id || null };
          }
          productSales[name].qty += Number(item.qty) || 0;
          productSales[name].revenue += Number(item.lineTotal) || (Number(item.price) || 0) * (Number(item.qty) || 0);
        }
      }
    }
    const topProducts = Object.values(productSales)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    // Enriquecer com dados atuais do produto (estoque, custo)
    const prodIds = topProducts.filter(p => p.productId).map(p => new ObjectId(p.productId));
    if (prodIds.length > 0) {
      const prodMap = {};
      const produtos = await db.collection('products').find(
        { _id: { $in: prodIds } },
        { projection: { _id: 1, quantity: 1, costPrice: 1, price: 1, name: 1 } }
      ).toArray();
      for (const prod of produtos) {
        prodMap[prod._id.toString()] = prod;
      }
      for (const p of topProducts) {
        const prod = prodMap[p.productId];
        if (prod) {
          p.stock = prod.quantity || 0;
          p.costPrice = prod.costPrice || 0;
        } else {
          p.stock = 0;
          p.costPrice = 0;
        }
      }
    } else {
      for (const p of topProducts) {
        p.stock = 0;
        p.costPrice = 0;
      }
    }

    // Caixa aberto (alerta para o dono/gerente)
    const caixaAbertoDoc = await db.collection('caixa').findOne({ status: 'aberto' });
    const caixaAberto = caixaAbertoDoc ? {
      id: caixaAbertoDoc._id.toString(),
      numeroCaixa: caixaAbertoDoc.numeroCaixa || '01',
      dataAbertura: caixaAbertoDoc.dataAbertura,
      horasAbertas: caixaAbertoDoc.dataAbertura ? Math.floor((now.getTime() - new Date(caixaAbertoDoc.dataAbertura).getTime()) / 3600000) : 0,
      abertoPor: caixaAbertoDoc.userName || null
    } : null;

    return {
      statusCode: 200,
      body: JSON.stringify({
        revenue,
        salesCount: dailySales.length,
        lowStockCount: lowStockProducts.length,
        totalProducts: productsColStats,
        estimatedProfit,
        recentSales,
        recentProducts,
        cashMovements,
        prevRevenue,
        revenueChange,
        topProducts,
        caixaAberto,
      }),
    };
    });
    return payload;
  } catch (error) {
    console.error('Dashboard function error:', error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ 
        message: 'Erro ao carregar dashboard'
      }) 
    };
  }
});
