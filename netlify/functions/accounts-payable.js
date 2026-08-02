const { getDb } = require("../../src/lib/mongodb");
const { checkPermission } = require("../../src/lib/auth");
const { withAuth } = require("../../src/lib/helpers");
const { ObjectId } = require("mongodb");

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function parseLocalDate(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function computeStatus(bill, today = startOfDay()) {
  if (bill.status === "cancelled") return "cancelled";
  if (bill.status === "paid" || bill.paidDate) return "paid";
  const due = startOfDay(bill.dueDate);
  if (due < today) return "overdue";
  return "pending";
}

function enrichBill(bill, today = startOfDay()) {
  const status = computeStatus(bill, today);
  const due = startOfDay(bill.dueDate);
  const daysUntilDue = Math.round((due - today) / (24 * 60 * 60 * 1000));
  return {
    ...bill,
    status,
    daysUntilDue,
    isOverdue: status === "overdue",
    isDueSoon: status === "pending" && daysUntilDue >= 0 && daysUntilDue <= (bill.reminderDays ?? 3),
  };
}

function nextDueDate(currentDueDate, frequency) {
  const base = new Date(currentDueDate);
  if (frequency === "weekly") return addDays(base, 7);
  if (frequency === "yearly") return addDays(base, 365);
  return addDays(base, 30);
}

async function buildSummary(collection, today, extraQuery = {}) {
  const weekEnd = endOfDay(addDays(today, 7));
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0, 23, 59, 59, 999));

  const isDefault = Object.keys(extraQuery).length === 0;

  let openQuery;
  if (isDefault) {
    openQuery = { status: { $ne: "cancelled" }, paidDate: { $in: [null, undefined] } };
  } else {
    openQuery = { ...extraQuery };
    if (!extraQuery.status && !extraQuery.paidDate) {
      openQuery.status = { $ne: "cancelled" };
      openQuery.paidDate = { $in: [null, undefined] };
    }
  }

  const openBills = await collection.find(openQuery).toArray();
  const enriched = openBills.map((b) => enrichBill(b, today));

  const pending = enriched.filter((b) => b.status === "pending");
  const overdue = enriched.filter((b) => b.status === "overdue");
  const dueThisWeek = enriched.filter(
    (b) => b.status === "pending" && startOfDay(b.dueDate) <= weekEnd,
  );
  const dueSoon = enriched.filter((b) => b.isDueSoon);

  let paidQuery;
  if (isDefault) {
    paidQuery = {
      paidDate: { $gte: monthStart, $lte: monthEnd },
      status: "paid",
    };
  } else {
    paidQuery = {
      paidDate: { $gte: monthStart, $lte: monthEnd },
      status: "paid",
    };
    if (extraQuery.category) paidQuery.category = extraQuery.category;
    if (extraQuery.$or) paidQuery.$or = extraQuery.$or;
  }
  const paidThisMonth = await collection.find(paidQuery).toArray();

  const sum = (items) => items.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  const cashFlow = [];
  for (let i = 0; i < 30; i++) {
    const day = addDays(today, i);
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    const dayBills = enriched.filter((b) => {
      const due = startOfDay(b.dueDate);
      return due >= dayStart && due <= dayEnd;
    });
    cashFlow.push({
      date: dayStart.toISOString(),
      count: dayBills.length,
      total: sum(dayBills),
    });
  }

  const byCategory = {};
  for (const bill of enriched) {
    const cat = bill.category || "outros";
    if (!byCategory[cat]) byCategory[cat] = { count: 0, total: 0 };
    byCategory[cat].count += 1;
    byCategory[cat].total += Number(bill.amount) || 0;
  }

  return {
    totalPending: sum(pending),
    totalOverdue: sum(overdue),
    countPending: pending.length,
    countOverdue: overdue.length,
    countDueThisWeek: dueThisWeek.length,
    totalDueThisWeek: sum(dueThisWeek),
    countDueSoon: dueSoon.length,
    totalDueSoon: sum(dueSoon),
    paidThisMonth: sum(paidThisMonth),
    countPaidThisMonth: paidThisMonth.length,
    cashFlow,
    byCategory,
    alerts: {
      overdue: overdue.slice(0, 10),
      dueSoon: dueSoon.slice(0, 10),
    },
  };
}

exports.handler = withAuth(async (event, context, user) => {
  

  const db = await getDb();
  const collection = db.collection("accounts_payable");
  const today = startOfDay();
  const params = event.queryStringParameters || {};

  try {
    switch (event.httpMethod) {
      case "GET": {
        if (params.groupId) {
          const groupBills = await collection
            .find({ installmentGroupId: params.groupId })
            .sort({ installmentNumber: 1 })
            .toArray();
          return {
            statusCode: 200,
            body: JSON.stringify(groupBills.map((b) => enrichBill(b, today))),
          };
        }

        if (params.summary === "true") {
          const { search: sSearch, status: sStatus, category: sCategory, from: sFrom, to: sTo } = params;
          const filterQuery = {};

          if (sCategory && sCategory !== "all") filterQuery.category = sCategory;
          if (sFrom || sTo) {
            filterQuery.dueDate = {};
            if (sFrom) filterQuery.dueDate.$gte = startOfDay(new Date(sFrom));
            if (sTo) filterQuery.dueDate.$lte = endOfDay(new Date(sTo));
          }
          if (sStatus === "paid") {
            filterQuery.status = "paid";
          } else if (sStatus === "cancelled") {
            filterQuery.status = "cancelled";
          } else if (sStatus === "overdue") {
            filterQuery.status = { $nin: ["paid", "cancelled"] };
            filterQuery.dueDate = { ...(filterQuery.dueDate || {}), $lt: today };
          } else if (sStatus === "pending") {
            filterQuery.status = { $nin: ["paid", "cancelled"] };
            filterQuery.dueDate = { ...(filterQuery.dueDate || {}), $gte: today };
          }
          if (sSearch) {
            filterQuery.$or = [
              { description: { $regex: sSearch, $options: "i" } },
              { supplier: { $regex: sSearch, $options: "i" } },
              { documentNumber: { $regex: sSearch, $options: "i" } },
              { barcode: { $regex: sSearch, $options: "i" } },
            ];
          }

          const summary = await buildSummary(collection, today, filterQuery);
          return { statusCode: 200, body: JSON.stringify(summary) };
        }

        const { search, status, category, from, to, page = 1, limit = 'all' } = params;
        const query = {};

        if (category && category !== "all") query.category = category;
        if (from || to) {
          query.dueDate = {};
          if (from) query.dueDate.$gte = startOfDay(new Date(from));
          if (to) query.dueDate.$lte = endOfDay(new Date(to));
        }

        if (status === "paid") {
          query.status = "paid";
        } else if (status === "cancelled") {
          query.status = "cancelled";
        } else if (status === "overdue") {
          query.status = { $nin: ["paid", "cancelled"] };
          query.dueDate = { ...(query.dueDate || {}), $lt: today };
        } else if (status === "pending") {
          query.status = { $nin: ["paid", "cancelled"] };
          query.dueDate = { ...(query.dueDate || {}), $gte: today };
        }

        if (search) {
          query.$or = [
            { description: { $regex: search, $options: "i" } },
            { supplier: { $regex: search, $options: "i" } },
            { documentNumber: { $regex: search, $options: "i" } },
            { barcode: { $regex: search, $options: "i" } },
          ];
        }

        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = limit === "all" ? 0 : Math.min(100, Math.max(1, parseInt(limit, 10)));
        const skip = limitNum === 0 ? 0 : (pageNum - 1) * limitNum;

        const [total, dataRaw] = await Promise.all([
          collection.countDocuments(query),
          collection.find(query).sort({ dueDate: 1 }).skip(skip).limit(limitNum).toArray(),
        ]);
        const data = dataRaw.map((bill) => enrichBill(bill, today));

        return {
          statusCode: 200,
          body: JSON.stringify({
            data,
            pagination: {
              page: pageNum,
              limit: limitNum,
              total,
              totalPages: limitNum === 0 ? 1 : Math.ceil(total / limitNum),
            },
          }),
        };
      }

      case "POST": {
        if (!checkPermission(user, ["Admin", "Gerente"])) {
          return { statusCode: 403, body: JSON.stringify({ message: "Acesso negado" }) };
        }

        const body = JSON.parse(event.body || "{}");
        const amount = Number(body.amount);
        if (!body.description?.trim()) {
          return { statusCode: 400, body: JSON.stringify({ message: "Descrição é obrigatória" }) };
        }
        if (!Number.isFinite(amount) || amount <= 0) {
          return { statusCode: 400, body: JSON.stringify({ message: "Valor inválido" }) };
        }
        if (!body.dueDate) {
          return { statusCode: 400, body: JSON.stringify({ message: "Data de vencimento é obrigatória" }) };
        }

        const now = new Date();
        const installmentNumber = body.installmentNumber ? parseInt(body.installmentNumber, 10) : null;
        const totalInstallments = body.totalInstallments ? parseInt(body.totalInstallments, 10) : null;
        const installmentGroupId = body.installmentGroupId || null;

        const baseBill = {
          description: body.description.trim(),
          supplier: (body.supplier || "").trim(),
          category: body.category || "outros",
          amount,
          dueDate: startOfDay(parseLocalDate(body.dueDate)),
          paidDate: null,
          status: "pending",
          paymentMethod: body.paymentMethod || "boleto",
          barcode: (body.barcode || "").trim(),
          documentNumber: (body.documentNumber || "").trim(),
          notes: (body.notes || "").trim(),
          reminderDays: Math.max(0, Math.min(30, Number(body.reminderDays) || 3)),
          recurring: body.recurring?.enabled
            ? { enabled: true, frequency: body.recurring.frequency || "monthly", endDate: body.recurring.endDate ? startOfDay(parseLocalDate(body.recurring.endDate)) : null }
            : { enabled: false },
          tags: Array.isArray(body.tags) ? body.tags.slice(0, 10) : [],
          createdBy: user.userId || user.email,
          createdAt: now,
          updatedAt: now,
        };

        // Installment bulk creation
        if (totalInstallments > 1 && !installmentNumber) {
          const groupId = installmentGroupId || new ObjectId().toString();
          const installmentAmount = totalInstallments > 0 ? Math.round((amount / totalInstallments) * 100) / 100 : amount;
          const bills = [];
          for (let i = 1; i <= totalInstallments; i++) {
            const due = new Date(baseBill.dueDate);
            due.setMonth(due.getMonth() + (i - 1));
            bills.push({
              ...baseBill,
              amount: installmentAmount,
              dueDate: due,
              installmentNumber: i,
              totalInstallments,
              installmentGroupId: groupId,
            });
          }

          const insertResult = await collection.insertMany(bills);
          const ids = Object.values(insertResult.insertedIds);

          await db.collection("logs").insertOne({
            userId: user.userId,
            action: "CREATE_PAYABLE_BULK",
            entity: "accounts_payable",
            entityId: groupId,
            timestamp: now,
            details: `Conta "${baseBill.description}" cadastrada em ${totalInstallments}x de R$ ${installmentAmount.toFixed(2)}`,
          });

          const created = await collection.find({ _id: { $in: ids } }).sort({ installmentNumber: 1 }).toArray();
          return {
            statusCode: 201,
            body: JSON.stringify(created.map((b) => enrichBill(b, today))),
          };
        }

        const bill = {
          ...baseBill,
          installmentNumber: installmentNumber || (totalInstallments > 1 ? 1 : null),
          totalInstallments: totalInstallments || null,
          installmentGroupId: installmentGroupId || null,
        };

        const result = await collection.insertOne(bill);

        await db.collection("logs").insertOne({
          userId: user.userId,
          action: "CREATE_PAYABLE",
          entity: "accounts_payable",
          entityId: result.insertedId,
          timestamp: now,
          details: `Conta "${bill.description}" cadastrada - vencimento ${bill.dueDate.toLocaleDateString("pt-BR")}`,
        });

        return {
          statusCode: 201,
          body: JSON.stringify(enrichBill({ ...bill, _id: result.insertedId }, today)),
        };
      }

      case "PUT": {
        if (!checkPermission(user, ["Admin", "Gerente"])) {
          return { statusCode: 403, body: JSON.stringify({ message: "Acesso negado" }) };
        }

        const { id, action, ...updates } = JSON.parse(event.body || "{}");
        if (!id) {
          return { statusCode: 400, body: JSON.stringify({ message: "ID é obrigatório" }) };
        }

        const existing = await collection.findOne({ _id: new ObjectId(id) });
        if (!existing) {
          return { statusCode: 404, body: JSON.stringify({ message: "Conta não encontrada" }) };
        }

        const now = new Date();

        if (action === "pay") {
          const paidDate = updates.paidDate ? startOfDay(parseLocalDate(updates.paidDate)) : today;
          await collection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                status: "paid",
                paidDate,
                paymentMethod: updates.paymentMethod || existing.paymentMethod,
                updatedAt: now,
              },
            },
          );

          if (existing.recurring?.enabled) {
            const nextDue = nextDueDate(existing.dueDate, existing.recurring.frequency);
            const endDate = existing.recurring.endDate ? startOfDay(existing.recurring.endDate) : null;
            if (!endDate || nextDue <= endDate) {
              const { _id, paidDate: _pd, ...template } = existing;
              await collection.insertOne({
                ...template,
                dueDate: nextDue,
                status: "pending",
                paidDate: null,
                createdAt: now,
                updatedAt: now,
              });
            }
          }

          await db.collection("logs").insertOne({
            userId: user.userId,
            action: "PAY_PAYABLE",
            entity: "accounts_payable",
            entityId: new ObjectId(id),
            timestamp: now,
            details: `Conta "${existing.description}" marcada como paga`,
          });

          const updated = await collection.findOne({ _id: new ObjectId(id) });
          return { statusCode: 200, body: JSON.stringify(enrichBill(updated, today)) };
        }

        if (action === "cancel") {
          await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: "cancelled", updatedAt: now } },
          );
          const updated = await collection.findOne({ _id: new ObjectId(id) });
          return { statusCode: 200, body: JSON.stringify(enrichBill(updated, today)) };
        }

        const allowed = [
          "description",
          "supplier",
          "category",
          "amount",
          "dueDate",
          "paymentMethod",
          "barcode",
          "documentNumber",
          "notes",
          "reminderDays",
          "recurring",
          "tags",
          "installmentNumber",
          "totalInstallments",
          "installmentGroupId",
        ];
        const patch = {};
        for (const key of allowed) {
          if (updates[key] !== undefined) patch[key] = updates[key];
        }
        if (patch.amount !== undefined) {
          patch.amount = Number(patch.amount);
          if (!Number.isFinite(patch.amount) || patch.amount <= 0) {
            return { statusCode: 400, body: JSON.stringify({ message: "Valor inválido" }) };
          }
        }
        if (patch.dueDate) patch.dueDate = startOfDay(parseLocalDate(patch.dueDate));
        if (patch.reminderDays !== undefined) {
          patch.reminderDays = Math.max(0, Math.min(30, Number(patch.reminderDays) || 3));
        }
        patch.updatedAt = now;
        if (existing.status !== "paid" && existing.status !== "cancelled") {
          patch.status = computeStatus({ ...existing, ...patch }, today);
        }

        await collection.updateOne({ _id: new ObjectId(id) }, { $set: patch });
        const updated = await collection.findOne({ _id: new ObjectId(id) });
        return { statusCode: 200, body: JSON.stringify(enrichBill(updated, today)) };
      }

      case "DELETE": {
        if (!checkPermission(user, ["Admin", "Gerente"])) {
          return { statusCode: 403, body: JSON.stringify({ message: "Acesso negado" }) };
        }
        const { id } = JSON.parse(event.body || "{}");
        if (!id) {
          return { statusCode: 400, body: JSON.stringify({ message: "ID é obrigatório" }) };
        }
        const existing = await collection.findOne({ _id: new ObjectId(id) });
        if (!existing) {
          return { statusCode: 404, body: JSON.stringify({ message: "Conta não encontrada" }) };
        }
        await collection.deleteOne({ _id: new ObjectId(id) });
        return { statusCode: 200, body: JSON.stringify({ message: "Conta excluída com sucesso" }) };
      }

      default:
        return { statusCode: 405, body: JSON.stringify({ message: "Método não permitido" }) };
    }
  } catch (error) {
    console.error("accounts-payable error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Erro no servidor" }),
    };
  }
});
