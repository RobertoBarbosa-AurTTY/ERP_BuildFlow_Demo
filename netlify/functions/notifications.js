const { getDb } = require('../../src/lib/mongodb');
const { verifyToken } = require('../../src/lib/auth');

exports.handler = async (event, context) => {
  const user = verifyToken(event);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ message: 'Não autorizado' }) };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  try {
    const db = await getDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    threeDaysFromNow.setHours(23, 59, 59, 999);

    const [
      dismissedNotifications,
      lowStockProducts,
      pendingSales,
      overduePayables,
      dueSoonPayables
    ] = await Promise.all([

      db.collection('dismissed_notifications').find({}, { projection: { notificationKey: 1, _id: 0 } }).toArray(),

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

      db.collection('sales').find(
        { status: 'RESERVED', createdAt: { $lte: oneDayAgo } },
        { projection: { _id: 1, saleNumber: 1, createdAt: 1 } }
      ).toArray(),

      db.collection('accounts_payable').find({
        status: { $nin: ['paid', 'cancelled'] },
        paidDate: { $in: [null, undefined] },
        dueDate: { $lt: today }
      }, {
        projection: { description: 1, supplier: 1, amount: 1, dueDate: 1, _id: 1 }
      }).sort({ dueDate: 1 }).limit(10).toArray(),

      (async () => {
        const movements = await db.collection('movimentacoes_estoque')
          .find({ timestamp: { $gte: sevenDaysAgo } }, { projection: { sku: 1, _id: 0 } })
          .toArray();
        const activeSkus = new Set(movements.map(m => m.sku).filter(Boolean));

        return db.collection('products').find(
          { quantity: { $gt: 0 }, sku: { $nin: Array.from(activeSkus) } },
          { projection: { name: 1, sku: 1, quantity: 1, minStock: 1, maxStock: 1, perishable: 1, expiryDate: 1, validade: 1, expirationDate: 1 } }
        ).limit(10).toArray();
      })(),

      db.collection('accounts_payable').find({
        status: { $nin: ['paid', 'cancelled'] },
        paidDate: { $in: [null, undefined] },
        dueDate: { $gte: today, $lte: threeDaysFromNow }
      }, {
        projection: { description: 1, supplier: 1, amount: 1, dueDate: 1, _id: 1 }
      }).sort({ dueDate: 1 }).limit(10).toArray()
    ]);

    const dismissedKeys = new Set(dismissedNotifications.map(item => item.notificationKey));

    const notifications = [];
    if (lowStockProducts.length) {
      notifications.push({
        title: 'Produtos em baixa',
        description: `${lowStockProducts.length} produto(s) no limite mínimo de estoque`,
        href: '/pages/estoque.html',
        count: lowStockProducts.length,
        items: lowStockProducts.slice(0, 5)
      });
    }
    if (pendingSales.length) {
      notifications.push({
        title: 'Vendas paradas há mais de 24h',
        description: `${pendingSales.length} venda(s) reservada(s) aguardando conclusão`,
        href: '/pages/historico-vendas.html',
        count: pendingSales.length
      });
    }
    if (overduePayables.length) {
      const totalOverdue = overduePayables.reduce((acc, b) => acc + (Number(b.amount) || 0), 0);
      notifications.push({
        title: 'Contas a pagar vencidas',
        description: `${overduePayables.length} boleto(s) em atraso — total R$ ${totalOverdue.toFixed(2).replace('.', ',')}`,
        href: '/pages/contas-a-pagar.html',
        count: overduePayables.length,
        items: overduePayables.slice(0, 5)
      });
    }
    if (dueSoonPayables.length) {
      notifications.push({
        title: 'Vencimentos próximos',
        description: `${dueSoonPayables.length} conta(s) vencem nos próximos 3 dias`,
        href: '/pages/contas-a-pagar.html',
        count: dueSoonPayables.length,
        items: dueSoonPayables.slice(0, 5)
      });
    }

    // idleStockProducts (produtos parados)
    const movements = await db.collection('movimentacoes_estoque')
      .find({ timestamp: { $gte: sevenDaysAgo } }, { projection: { sku: 1, _id: 0 } })
      .toArray();
    const activeSkus = new Set(movements.map(m => m.sku).filter(Boolean));
    const idleStockProducts = await db.collection('products').find(
      { quantity: { $gt: 0 }, sku: { $nin: Array.from(activeSkus) } },
      { projection: { name: 1, sku: 1, quantity: 1 } }
    ).limit(10).toArray();

    if (idleStockProducts.length) {
      notifications.push({
        title: 'Estoque parado/inativo',
        description: `${idleStockProducts.length} produto(s) sem movimento nos últimos 7 dias`,
        href: '/pages/auditoria-estoque.html',
        count: idleStockProducts.length,
        items: idleStockProducts.slice(0, 5)
      });
    }

    const activeNotifications = notifications.filter(item => !dismissedKeys.has(
      `${item.title}||${item.description}`
    ));

    return {
      statusCode: 200,
      body: JSON.stringify(activeNotifications)
    };
  } catch (error) {
    console.error('Notifications function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro ao carregar notificações', error: error.message })
    };
  }
};
