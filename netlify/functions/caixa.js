const { getDb } = require('../../src/lib/mongodb');
const { withAuth } = require('../../src/lib/helpers');
const { checkPermission } = require('../../src/lib/auth');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMoney(v) {
  return Number(v || 0).toFixed(2);
}

async function computeCaixaTotals(db, caixaDoc) {
  const fim = caixaDoc.dataFechamento ? new Date(caixaDoc.dataFechamento) : new Date();
  const salesCol = db.collection('sales');
  // Vendas da sessão: por caixaId quando disponível; fallback para vendas antigas sem o campo.
  // Em ambos os casos as vendas precisam estar dentro da janela [abertura, fechamento]
  // para que ajustes retroativos de data considerem apenas o período correto.
  const sales = await salesCol.find({
    status: 'FINALIZED',
    createdAt: { $gte: caixaDoc.dataAbertura, $lte: fim },
    $or: [
      { caixaId: caixaDoc._id },
      { caixaId: { $exists: false } }
    ]
  }, {
    projection: { total: 1, totalDiscount: 1, paymentMethod: 1, splitPayment: 1 }
  }).toArray();

  const retiradas = await db.collection('retiradas_caixa').find({
    caixaId: caixaDoc._id,
    createdAt: { $gte: caixaDoc.dataAbertura, $lte: fim }
  }).toArray();

  const totals = {
    totalVendas: 0,
    totalDinheiro: 0,
    totalCartaoCredito: 0,
    totalCartaoDebito: 0,
    totalPIX: 0,
    totalDescontos: 0,
    numeroVendas: 0,
    totalRetiradas: 0,
    totalSuprimentos: 0
  };

  for (const sale of sales) {
    totals.totalVendas += Number(sale.total) || 0;
    totals.totalDescontos += Number(sale.totalDiscount) || 0;
    totals.numeroVendas++;

    if (sale.paymentMethod === 'Dividido' && sale.splitPayment && sale.splitPayment.cash != null) {
      totals.totalDinheiro += Number(sale.splitPayment.cash) || 0;
      const rest = Number(sale.splitPayment.rest) || 0;
      switch (sale.splitPayment.method) {
        case 'Cartão de Crédito':
          totals.totalCartaoCredito += rest;
          break;
        case 'Cartão de Débito':
          totals.totalCartaoDebito += rest;
          break;
        case 'PIX':
          totals.totalPIX += rest;
          break;
        default:
          break;
      }
      continue;
    }

    switch (sale.paymentMethod) {
      case 'Dinheiro':
        totals.totalDinheiro += Number(sale.total) || 0;
        break;
      case 'Cartão de Crédito':
        totals.totalCartaoCredito += Number(sale.total) || 0;
        break;
      case 'Cartão de Débito':
        totals.totalCartaoDebito += Number(sale.total) || 0;
        break;
      case 'PIX':
        totals.totalPIX += Number(sale.total) || 0;
        break;
      default:
        break;
    }
  }

  for (const ret of retiradas) {
    if (ret.tipo === 'suprimento') {
      totals.totalSuprimentos += Number(ret.valor) || 0;
    } else {
      totals.totalRetiradas += Number(ret.valor) || 0;
    }
  }

  totals.valorFinal = Number(caixaDoc.valorInicial || 0) + totals.totalVendas - totals.totalRetiradas + totals.totalSuprimentos;
  return totals;
}

exports.handler = withAuth(async (event, context, user) => {
  

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

        const registros = await caixa.find({}).sort({ dataAbertura: -1 }).limit(Math.min(parseInt(event.queryStringParameters?.limit) || 50, 500)).toArray();
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
          // Vendas da sessão: por caixaId quando disponível; fallback para vendas antigas sem o campo.
          // Restringe à janela do caixa para não contar vendas fora do período.
          const sales = await salesCol.find({
            status: 'FINALIZED',
            createdAt: { $gte: aberto.dataAbertura, $lte: new Date() },
            $or: [
              { caixaId: aberto._id },
              { caixaId: { $exists: false } }
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

        if (action === 'ajustar' || action === 'recalcular') {
          if (!checkPermission(user, ['Admin', 'Gerente'])) {
            return { statusCode: 403, body: JSON.stringify({ message: 'Acesso negado' }) };
          }

          const id = String(body.id || '');
          let parsedId;
          try {
            parsedId = new ObjectId(id);
          } catch {
            return { statusCode: 400, body: JSON.stringify({ message: 'ID do caixa inválido' }) };
          }

          const registro = await caixa.findOne({ _id: parsedId });
          if (!registro) {
            return { statusCode: 404, body: JSON.stringify({ message: 'Registro de caixa não encontrado' }) };
          }

          const mudancas = [];
          const set = {};

          const applyField = (campo, valor) => {
            const antes = registro[campo];
            const igual = antes instanceof Date && valor instanceof Date
              ? antes.getTime() === valor.getTime()
              : antes === valor;
            if (igual) return;
            set[campo] = valor;
            mudancas.push({ campo, antes, depois: valor });
          };

          if (action === 'ajustar') {
            const dataAbertura = parseDate(body.dataAbertura);
            if (body.dataAbertura !== undefined && !dataAbertura) {
              return { statusCode: 400, body: JSON.stringify({ message: 'Data de abertura inválida' }) };
            }
            if (dataAbertura) applyField('dataAbertura', dataAbertura);

            const dataFechamento = body.dataFechamento ? parseDate(body.dataFechamento) : null;
            if (body.dataFechamento !== undefined && body.dataFechamento !== null && body.dataFechamento !== '' && !dataFechamento) {
              return { statusCode: 400, body: JSON.stringify({ message: 'Data de fechamento inválida' }) };
            }
            if (body.dataFechamento !== undefined) {
              applyField('dataFechamento', dataFechamento);
              if (dataFechamento && registro.status === 'aberto') {
                applyField('status', 'fechado');
              }
            }

            if (body.valorInicial !== undefined) applyField('valorInicial', Math.max(0, Number(body.valorInicial) || 0));
            if (body.valorFinal !== undefined) applyField('valorFinal', Math.max(0, Number(body.valorFinal) || 0));
            if (body.totalDinheiro !== undefined) applyField('totalDinheiro', Math.max(0, Number(body.totalDinheiro) || 0));
            if (body.totalCartaoCredito !== undefined) applyField('totalCartaoCredito', Math.max(0, Number(body.totalCartaoCredito) || 0));
            if (body.totalCartaoDebito !== undefined) applyField('totalCartaoDebito', Math.max(0, Number(body.totalCartaoDebito) || 0));
            if (body.totalPIX !== undefined) applyField('totalPIX', Math.max(0, Number(body.totalPIX) || 0));
            if (body.totalDescontos !== undefined) applyField('totalDescontos', Math.max(0, Number(body.totalDescontos) || 0));
            if (body.observacao !== undefined) applyField('observacao', String(body.observacao || '').trim());
          }

          if (body.recalcular === true) {
            if (set.dataAbertura && set.dataFechamento && set.dataAbertura > set.dataFechamento) {
              return { statusCode: 400, body: JSON.stringify({ message: 'Abertura não pode ser após o fechamento' }) };
            }
            const paraCalcular = {
              _id: parsedId,
              dataAbertura: set.dataAbertura || registro.dataAbertura,
              dataFechamento: set.dataFechamento !== undefined ? set.dataFechamento : registro.dataFechamento,
              valorInicial: set.valorInicial !== undefined ? set.valorInicial : registro.valorInicial
            };
            const totals = await computeCaixaTotals(db, paraCalcular);
            for (const [campo, valor] of Object.entries(totals)) {
              applyField(campo, valor);
            }
          }

          const justificativa = String(body.justificativa || '').trim();
          if (mudancas.length === 0 && action === 'ajustar') {
            return { statusCode: 400, body: JSON.stringify({ message: 'Nenhuma alteração informada.' }) };
          }
          if ((mudancas.length > 0 || action === 'recalcular') && !justificativa) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Justificativa (observação) obrigatória.' }) };
          }

          set.updatedAt = new Date();
          await caixa.updateOne({ _id: parsedId }, { $set: set, $push: { ajustes: {
            quando: new Date(),
            userId: user.userId,
            por: user.name || 'Usuário',
            justificativa: justificativa || undefined,
            mudancas
          } } });

          const resumo = mudancas.length > 0
            ? mudancas.map((m) => {
              const formatValue = (v) => {
                if (typeof v === 'number') return formatMoney(v);
                if (!v) return '—';
                if (v instanceof Date) return v.toISOString();
                if (typeof v === 'string') {
                  const d = new Date(v);
                  return Number.isNaN(d.getTime()) ? v : d.toISOString();
                }
                return String(v);
              };
              return `${m.campo}: ${formatValue(m.antes)} → ${formatValue(m.depois)}`;
            }).join('; ')
            : 'recálculo sem alterações — totais conferidos';

          await db.collection('logs').insertOne({
            userId: user.userId,
            action: 'ADJUST_CAIXA',
            entity: 'caixa',
            entityId: parsedId,
            timestamp: new Date(),
            details: `Caixa ${registro.numeroCaixa || '01'} ajustado${body.recalcular === true ? ' (com recálculo do período)' : ''}: ${resumo}${justificativa ? ` — Justificativa: ${justificativa}` : ''}`
          });

          const registroFinal = await caixa.findOne({ _id: parsedId });
          return { statusCode: 200, body: JSON.stringify({ message: 'Caixa ajustado com sucesso', caixa: registroFinal }) };
        }

        return { statusCode: 400, body: JSON.stringify({ message: 'Ação inválida. Use "abrir", "fechar", "ajustar" ou "recalcular".' }) };
      }

      default:
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
  } catch (error) {
    console.error('Caixa function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro ao processar operação de caixa' })
    };
  }
});
