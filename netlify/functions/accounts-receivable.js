// Contas a Receber — espelho de accounts-payable com status de recebimento.
const { getDb } = require("../../src/lib/mongodb");
const { withAuth, badRequest, notFound, conflict } = require("../../src/lib/helpers");
const { ObjectId } = require("mongodb");
const { parseBody, sanitizeString, sanitizeOptionalString, toFiniteNumber, toPositiveNumber, missingFields } = require("../../src/lib/validate");

const WRITE_ROLES = ["Admin", "Gerente"];

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
  if (bill.status === "received" || bill.receivedDate) return "received";
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
    openQuery = { status: { $ne: "cancelled" }, receivedDate: { $in: [null, undefined] } };
  } else {
    openQuery = { ...extraQuery };
    if (!extraQuery.status && !extraQuery.receivedDate) {
      openQuery.status = { $ne: "cancelled" };
      openQuery.receivedDate = { $in: [null, undefined] };
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

  const receivedQuery = {
    receivedDate: { $gte: monthStart, $lte: monthEnd },
    status: "received",
  };
  if (!isDefault && extraQuery.category) receivedQuery.category = extraQuery.category;
  const receivedThisMonth = await collection.find(receivedQuery).toArray();

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
    receivedThisMonth: sum(receivedThisMonth),
    countReceivedThisMonth: receivedThisMonth.length,
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
  const collection = db.collection("accounts_receivable");
  const today = startOfDay();
  const params = event.queryStringParameters || {};

  switch (event.httpMethod) {
    case "GET": {
      if (params.groupId) {
        const groupBills = await collection
          .find({ installmentGroupId: params.groupId })
          .sort({ installmentNumber: 1 })
          .toArray();
        return { statusCode: 200, body: JSON.stringify(groupBills.map((b) => enrichBill(b, today))) };
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
        if (sStatus === "received") {
          filterQuery.status = "received";
        } else if (sStatus === "cancelled") {
          filterQuery.status = "cancelled";
        } else if (sStatus === "overdue") {
          filterQuery.status = { $nin: ["received", "cancelled"] };
          filterQuery.dueDate = { ...(filterQuery.dueDate || {}), $lt: today };
        } else if (sStatus === "pending") {
          filterQuery.status = { $nin: ["received", "cancelled"] };
          filterQuery.dueDate = { ...(filterQuery.dueDate || {}), $gte: today };
        }
        if (sSearch) {
          filterQuery.$or = [
            { description: { $regex: sSearch, $options: "i" } },
            { customerName: { $regex: sSearch, $options: "i" } },
            { documentNumber: { $regex: sSearch, $options: "i" } },
          ];
        }

        const summary = await buildSummary(collection, today, filterQuery);
        return { statusCode: 200, body: JSON.stringify(summary) };
      }

      const { search, status, category, from, to, page = 1, limit = "all" } = params;
      const query = {};

      if (category && category !== "all") query.category = category;
      if (from || to) {
        query.dueDate = {};
        if (from) query.dueDate.$gte = startOfDay(new Date(from));
        if (to) query.dueDate.$lte = endOfDay(new Date(to));
      }

      if (status === "received") {
        query.status = "received";
      } else if (status === "cancelled") {
        query.status = "cancelled";
      } else if (status === "overdue") {
        query.status = { $nin: ["received", "cancelled"] };
        query.dueDate = { ...(query.dueDate || {}), $lt: today };
      } else if (status === "pending") {
        query.status = { $nin: ["received", "cancelled"] };
        query.dueDate = { ...(query.dueDate || {}), $gte: today };
      }

      if (search) {
        query.$or = [
          { description: { $regex: search, $options: "i" } },
          { customerName: { $regex: search, $options: "i" } },
          { documentNumber: { $regex: search, $options: "i" } },
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
      if (!WRITE_ROLES.includes(user.role)) {
        return { statusCode: 403, body: JSON.stringify({ message: "Acesso negado" }) };
      }

      const parsed = parseBody(event);
      if (parsed.error) return badRequest(parsed.error);
      const body = parsed.value;

      const missing = missingFields(body, ["description", "amount", "dueDate"]);
      if (missing.length) return badRequest("Descrição, valor e vencimento são obrigatórios");

      const amount = toPositiveNumber(body.amount);
      if (amount === null) return badRequest("Valor inválido");

      const now = new Date();
      const installmentNumber = body.installmentNumber ? parseInt(body.installmentNumber, 10) : null;
      const totalInstallments = body.totalInstallments ? parseInt(body.totalInstallments, 10) : null;
      const installmentGroupId = body.installmentGroupId || null;

      let customerId = null;
      let customerName = sanitizeOptionalString(body.customerName, 120);
      if (body.customerId) {
        customerId = new ObjectId(String(body.customerId));
        const customer = await db.collection("customers").findOne({ _id: customerId });
        if (!customer) return badRequest("Cliente não encontrado");
        customerName = customer.name;
      }

      const baseBill = {
        description: sanitizeString(body.description, 200),
        customerId,
        customerName,
        category: body.category || "vendas",
        amount,
        dueDate: startOfDay(parseLocalDate(body.dueDate)),
        receivedDate: null,
        status: "pending",
        paymentMethod: body.paymentMethod || "pix",
        documentNumber: sanitizeOptionalString(body.documentNumber, 60),
        notes: sanitizeOptionalString(body.notes, 500),
        reminderDays: Math.max(0, Math.min(30, Number(body.reminderDays) || 3)),
        recurring: body.recurring?.enabled
          ? { enabled: true, frequency: body.recurring.frequency || "monthly", endDate: body.recurring.endDate ? startOfDay(new Date(body.recurring.endDate)) : null }
          : { enabled: false },
        tags: Array.isArray(body.tags) ? body.tags.slice(0, 10) : [],
        createdBy: user.userId || user.email,
        createdAt: now,
        updatedAt: now,
      };

      // Criação em parcelas
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
          action: "CREATE_RECEIVABLE_BULK",
          entity: "accounts_receivable",
          entityId: groupId,
          timestamp: now,
          details: `Recebimento "${baseBill.description}" cadastrado em ${totalInstallments}x de R$ ${installmentAmount.toFixed(2)}`,
        });

        const created = await collection.find({ _id: { $in: ids } }).sort({ installmentNumber: 1 }).toArray();
        return { statusCode: 201, body: JSON.stringify(created.map((b) => enrichBill(b, today))) };
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
        action: "CREATE_RECEIVABLE",
        entity: "accounts_receivable",
        entityId: result.insertedId,
        timestamp: now,
        details: `Recebimento "${bill.description}" cadastrado - vencimento ${bill.dueDate.toLocaleDateString("pt-BR")}`,
      });

      return {
        statusCode: 201,
        body: JSON.stringify(enrichBill({ ...bill, _id: result.insertedId }, today)),
      };
    }

    case "PUT": {
      if (!WRITE_ROLES.includes(user.role)) {
        return { statusCode: 403, body: JSON.stringify({ message: "Acesso negado" }) };
      }

      const parsed = parseBody(event);
      if (parsed.error) return badRequest(parsed.error);
      const { id, action, ...updates } = parsed.value;
      if (!id) return badRequest("ID é obrigatório");

      const existing = await collection.findOne({ _id: new ObjectId(id) });
      if (!existing) return notFound("Recebimento não encontrado");

      const now = new Date();

      if (action === "receive") {
        const receivedDate = updates.receivedDate ? startOfDay(parseLocalDate(updates.receivedDate)) : today;
        await collection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status: "received",
              receivedDate,
              paymentMethod: updates.paymentMethod || existing.paymentMethod,
              updatedAt: now,
            },
          },
        );

        if (existing.recurring?.enabled) {
          const nextDue = nextDueDate(existing.dueDate, existing.recurring.frequency);
          const endDate = existing.recurring.endDate ? startOfDay(existing.recurring.endDate) : null;
          if (!endDate || nextDue <= endDate) {
            const { _id, receivedDate: _rd, ...template } = existing;
            await collection.insertOne({
              ...template,
              dueDate: nextDue,
              status: "pending",
              receivedDate: null,
              createdAt: now,
              updatedAt: now,
            });
          }
        }

        await db.collection("logs").insertOne({
          userId: user.userId,
          action: "RECEIVE_RECEIVABLE",
          entity: "accounts_receivable",
          entityId: new ObjectId(id),
          timestamp: now,
          details: `Recebimento "${existing.description}" marcado como recebido`,
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
        "customerId",
        "customerName",
        "category",
        "amount",
        "dueDate",
        "paymentMethod",
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
        const value = toPositiveNumber(patch.amount);
        if (value === null) return badRequest("Valor inválido");
        patch.amount = value;
      }
      if (patch.dueDate) patch.dueDate = startOfDay(parseLocalDate(patch.dueDate));
      if (patch.reminderDays !== undefined) {
        patch.reminderDays = Math.max(0, Math.min(30, Number(patch.reminderDays) || 3));
      }
      if (patch.customerId !== undefined) {
        patch.customerId = new ObjectId(String(patch.customerId));
        const customer = await db.collection("customers").findOne({ _id: patch.customerId });
        if (!customer) return badRequest("Cliente não encontrado");
        patch.customerName = customer.name;
      }
      patch.updatedAt = now;
      if (existing.status !== "received" && existing.status !== "cancelled") {
        patch.status = computeStatus({ ...existing, ...patch }, today);
      }

      await collection.updateOne({ _id: new ObjectId(id) }, { $set: patch });
      const updated = await collection.findOne({ _id: new ObjectId(id) });
      return { statusCode: 200, body: JSON.stringify(enrichBill(updated, today)) };
    }

    case "DELETE": {
      if (!WRITE_ROLES.includes(user.role)) {
        return { statusCode: 403, body: JSON.stringify({ message: "Acesso negado" }) };
      }
      const parsed = parseBody(event);
      if (parsed.error) return badRequest(parsed.error);
      const { id } = parsed.value;
      if (!id) return badRequest("ID é obrigatório");
      const existing = await collection.findOne({ _id: new ObjectId(id) });
      if (!existing) return notFound("Recebimento não encontrado");
      await collection.deleteOne({ _id: new ObjectId(id) });
      return { statusCode: 200, body: JSON.stringify({ message: "Recebimento excluído" }) };
    }

    default:
      return { statusCode: 405, body: JSON.stringify({ message: "Método não permitido" }) };
  }
});
