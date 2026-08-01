const { getDb } = require('../../src/lib/mongodb');
const { verifyToken } = require('../../src/lib/auth');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

exports.handler = async (event, context) => {
  const user = verifyToken(event);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ message: 'Não autorizado' }) };
  }

  const db = await getDb();
  const caixa = db.collection('caixa');

  try {
    switch (event.httpMethod) {
      case 'GET': {
        const { id, status } = event.queryStringParameters || {};

        if (id) {
          const registro = await caixa.findOne({ _id: new ObjectId(id) });
          if (!registro) {
            return { statusCode: 404, body: JSON.stringify({ message: 'Registro de caixa não encontrado' }) };
          }
          return { statusCode: 200, body: JSON.stringify(registro) };
        }

        if (status === 'aberto') {
          const aberto = await caixa.findOne({ status: 'aberto' });
          if (aberto) {
            return { statusCode: 200, body: JSON.stringify(aberto) };
          }
          const ultimo = await caixa.findOne({ status: 'fechado' }, { sort: { dataFechamento: -1 } });
          return {
            statusCode: 200,
            body: JSON.stringify({
              status: 'fechado',
              ultimoFechamento: ultimo ? {
                valorFinal: ultimo.valorFinal,
                totalDinheiro: ultimo.totalDinheiro,
                dataFechamento: ultimo.dataFechamento,
                numeroVendas: ultimo.numeroVendas
              } : null
            })
          };
        }

        const registros = await caixa.find({}).sort({ dataAbertura: -1 }).limit(50).toArray();
        return { statusCode: 200, body: JSON.stringify(registros) };
      }

      case 'POST': {
        const body = JSON.parse(event.body);
        const { action } = body;

        if (action === 'verificar-senha') {
          const { password } = body;
          if (!password) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Senha não informada.' }) };
          }
          const users = db.collection('users');
          const userDoc = await users.findOne({ _id: new ObjectId(user.userId) });
          if (!userDoc) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Usuário não encontrado.' }) };
          }
          const valid = await bcrypt.compare(password, userDoc.password);
          if (!valid) {
            return { statusCode: 401, body: JSON.stringify({ message: 'Senha incorreta.' }) };
          }
          return { statusCode: 200, body: JSON.stringify({ message: 'Senha verificada.' }) };
        }

        if (action === 'abrir') {
          const aberto = await caixa.findOne({ status: 'aberto' });
          if (aberto) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Já existe um caixa aberto. Feche-o antes de abrir um novo.' }) };
          }

          const valorInicial = Math.max(0, Number(body.valorInicial) || 0);
          const observacao = String(body.observacao || '').trim();
          const userName = body.userName || user.name || 'Operador';
          const numeroCaixa = String(body.numeroCaixa || '01').trim();

          const registro = {
            status: 'aberto',
            dataAbertura: new Date(),
            dataFechamento: null,
            valorInicial,
            valorFinal: 0,
            totalVendas: 0,
            totalDinheiro: 0,
            totalCartaoCredito: 0,
            totalCartaoDebito: 0,
            totalPIX: 0,
            totalDescontos: 0,
            numeroVendas: 0,
            observacao,
            numeroCaixa,
            userId: user.userId || user.id,
            userName,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          const result = await caixa.insertOne(registro);

          await db.collection('logs').insertOne({
            userId: user.userId,
            action: 'OPEN_CAIXA',
            entity: 'caixa',
            entityId: result.insertedId,
            timestamp: new Date(),
            details: `Caixa aberto com valor inicial de R$ ${valorInicial.toFixed(2)} por ${userName}`
          });

          return {
            statusCode: 201,
            body: JSON.stringify({
              message: 'Caixa aberto com sucesso',
              caixa: { ...registro, _id: result.insertedId }
            })
          };
        }

        if (action === 'fechar') {
          const aberto = await caixa.findOne({ status: 'aberto' });
          if (!aberto) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Nenhum caixa está aberto para fechar.' }) };
          }

          const observacao = String(body.observacao || '').trim();

          const salesCol = db.collection('sales');
          // Vendas da sessão: por caixaId quando disponível; fallback para vendas antigas sem o campo
          const sales = await salesCol.find({
            status: 'FINALIZED',
            $or: [
              { caixaId: aberto._id },
              { caixaId: { $exists: false }, createdAt: { $gte: aberto.dataAbertura, $lte: new Date() } }
            ]
          }, {
            projection: { total: 1, totalDiscount: 1, paymentMethod: 1, splitPayment: 1 }
          }).toArray();

          const retiradasCol = db.collection('retiradas_caixa');
          const retiradas = await retiradasCol.find({
            caixaId: aberto._id,
            createdAt: {
              $gte: aberto.dataAbertura,
              $lte: new Date()
            }
          }).toArray();

          let totalVendas = 0;
          let totalDinheiro = 0;
          let totalCartaoCredito = 0;
          let totalCartaoDebito = 0;
          let totalPIX = 0;
          let totalDescontos = 0;
          let numeroVendas = 0;

          for (const sale of sales) {
            totalVendas += Number(sale.total) || 0;
            totalDescontos += Number(sale.totalDiscount) || 0;
            numeroVendas++;

            if (sale.paymentMethod === 'Dividido' && sale.splitPayment && sale.splitPayment.cash != null) {
              totalDinheiro += Number(sale.splitPayment.cash) || 0;
              const rest = Number(sale.splitPayment.rest) || 0;
              switch (sale.splitPayment.method) {
                case 'Cartão de Crédito':
                  totalCartaoCredito += rest;
                  break;
                case 'Cartão de Débito':
                  totalCartaoDebito += rest;
                  break;
                case 'PIX':
                  totalPIX += rest;
                  break;
                default:
                  break;
              }
              continue;
            }

            switch (sale.paymentMethod) {
              case 'Dinheiro':
                totalDinheiro += Number(sale.total) || 0;
                break;
              case 'Cartão de Crédito':
                totalCartaoCredito += Number(sale.total) || 0;
                break;
              case 'Cartão de Débito':
                totalCartaoDebito += Number(sale.total) || 0;
                break;
              case 'PIX':
                totalPIX += Number(sale.total) || 0;
                break;
              default:
                break;
            }
          }

          let totalRetiradas = 0;
          let totalSuprimentos = 0;
          for (const ret of retiradas) {
            if (ret.tipo === 'suprimento') {
              totalSuprimentos += Number(ret.valor) || 0;
            } else {
              totalRetiradas += Number(ret.valor) || 0;
            }
          }

          const valorFinal = Number(aberto.valorInicial) + totalVendas - totalRetiradas + totalSuprimentos;

          const update = {
            $set: {
              status: 'fechado',
              dataFechamento: new Date(),
              valorFinal,
              totalVendas,
              totalDinheiro,
              totalCartaoCredito,
              totalCartaoDebito,
              totalPIX,
              totalDescontos,
              totalRetiradas,
              totalSuprimentos,
              numeroVendas,
              observacao: observacao || aberto.observacao || '',
              updatedAt: new Date()
            }
          };

          await caixa.updateOne({ _id: aberto._id }, update);

          await db.collection('logs').insertOne({
            userId: user.userId,
            action: 'CLOSE_CAIXA',
            entity: 'caixa',
            entityId: aberto._id,
            timestamp: new Date(),
            details: `Caixa fechado. Total de vendas: R$ ${totalVendas.toFixed(2)}${totalRetiradas > 0 ? `, Sangrias: R$ ${totalRetiradas.toFixed(2)}` : ''}${totalSuprimentos > 0 ? `, Suprimentos: R$ ${totalSuprimentos.toFixed(2)}` : ''}, Nº vendas: ${numeroVendas}`
          });

          const registroFinal = await caixa.findOne({ _id: aberto._id });

          return {
            statusCode: 200,
            body: JSON.stringify({
              message: 'Caixa fechado com sucesso',
              caixa: registroFinal,
              resumo: {
                valorInicial: aberto.valorInicial,
                totalVendas,
                totalRetiradas,
                totalSuprimentos,
                valorFinal,
                numeroVendas,
                totalDinheiro,
                totalCartaoCredito,
                totalCartaoDebito,
                totalPIX,
                totalDescontos
              }
            })
          };
        }

        return { statusCode: 400, body: JSON.stringify({ message: 'Ação inválida. Use "abrir" ou "fechar".' }) };
      }

      default:
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
  } catch (error) {
    console.error('Caixa function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro ao processar operação de caixa', error: error.message })
    };
  }
};
