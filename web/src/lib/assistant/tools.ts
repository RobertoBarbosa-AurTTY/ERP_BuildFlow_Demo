// Ferramentas do assistente: um único conjunto, usado pelos três provedores
// (Claude, OpenAI e o assistente local). Cada ferramenta valida a entrada com
// Zod e chama os services do sistema — as mesmas funções que as telas usam.
import { z } from "zod";
import { round2, stockStatus, STOCK_STATUS_LABEL, billStatus, daysUntil, BILL_STATUS_LABEL } from "@/lib/domain/calc";
import { PAYMENT_METHODS, type Product } from "@/lib/domain/types";
import { formatCurrency, formatDate, formatDateTime, formatPercent, toDateInput } from "@/lib/format";
import { parseNfeXml, type NfeDocument } from "@/components/inventory/nfe";
import { toUnit } from "@/components/inventory/utils";
import {
  adjustStock,
  getProductByCode,
  listProducts,
  listStockMovements,
  registerReceiving,
  listReceivings,
} from "@/lib/services/products";
import { listSales } from "@/lib/services/sales";
import { getSalesReport } from "@/lib/services/analytics";
import { getOpenSession, getSessionDetail, listSessionSummaries } from "@/lib/services/cash";
import { listPayables } from "@/lib/services/payables";
import { listReceivables } from "@/lib/services/receivables";
import type { ConfirmRequest, ToolContext } from "./types";

export interface AssistantTool<S extends z.ZodType = z.ZodType> {
  name: string;
  /** Rótulo curto mostrado na UI enquanto a ferramenta roda. */
  label: string;
  description: string;
  schema: S;
  /** Se definido, a ação altera dados e precisa de confirmação do usuário. */
  confirm?: (input: z.infer<S>, ctx: ToolContext) => Promise<ConfirmRequest>;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}

function tool<S extends z.ZodType>(def: AssistantTool<S>): AssistantTool<S> {
  return def;
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

const PERIODS = ["today", "yesterday", "7d", "30d", "month", "last_month"] as const;
type Period = (typeof PERIODS)[number];

export const PERIOD_LABEL: Record<Period, string> = {
  today: "hoje",
  yesterday: "ontem",
  "7d": "últimos 7 dias",
  "30d": "últimos 30 dias",
  month: "este mês",
  last_month: "mês passado",
};

export function periodRange(period: Period): { from: string; to: string } {
  const today = new Date();
  const shift = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return toDateInput(d);
  };
  switch (period) {
    case "today":
      return { from: shift(0), to: shift(0) };
    case "yesterday":
      return { from: shift(-1), to: shift(-1) };
    case "7d":
      return { from: shift(-6), to: shift(0) };
    case "30d":
      return { from: shift(-29), to: shift(0) };
    case "month":
      return { from: toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)), to: shift(0) };
    case "last_month":
      return {
        from: toDateInput(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: toDateInput(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
  }
}

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD");

const rangeInput = {
  period: z.enum(PERIODS).optional().describe("Período pronto. Ignorado se from/to forem informados."),
  from: dateKey.optional().describe("Data inicial AAAA-MM-DD"),
  to: dateKey.optional().describe("Data final AAAA-MM-DD"),
};

function resolveRange(input: { period?: Period; from?: string; to?: string }, fallback: Period = "today") {
  if (input.from || input.to) {
    const from = input.from ?? input.to!;
    const to = input.to ?? input.from!;
    return from <= to ? { from, to } : { from: to, to: from };
  }
  return periodRange(input.period ?? fallback);
}

function productView(p: Product) {
  const status = stockStatus(p);
  return {
    id: p._id,
    sku: p.sku,
    nome: p.name,
    categoria: p.category,
    estoque: p.quantity,
    unidade: p.unit,
    minimo: p.minStock,
    status: STOCK_STATUS_LABEL[status],
    preco: formatCurrency(p.price),
    custo: formatCurrency(p.costPrice),
    validade: p.expiryDate ? formatDate(p.expiryDate) : undefined,
    ativo: p.active,
  };
}

/** Encontra um produto por SKU/código de barras exato ou, senão, por nome. */
async function findProduct(reference: string) {
  const exact = await getProductByCode(reference);
  if (exact) return { product: exact, candidates: [] as Product[] };
  const list = await listProducts({ search: reference });
  if (list.length === 1) return { product: list[0], candidates: [] as Product[] };
  return { product: null, candidates: list.slice(0, 8) };
}

function ambiguity(reference: string, candidates: Product[]) {
  if (!candidates.length) return { erro: `Nenhum produto encontrado para "${reference}".` };
  return {
    erro: `"${reference}" corresponde a mais de um produto. Pergunte ao usuário qual deles.`,
    opcoes: candidates.map((p) => ({ sku: p.sku, nome: p.name, estoque: p.quantity })),
  };
}

// Prévia da NF-e: casamento dos itens com produtos já cadastrados.
async function nfePreview(doc: NfeDocument) {
  const all = await listProducts({ includeInactive: true });
  const items = doc.items.map((item) => {
    const match =
      all.find((p) => item.ean && p.barcode === item.ean) ??
      all.find((p) => p.sku.toUpperCase() === item.code.toUpperCase()) ??
      null;
    return { item, match };
  });
  return items;
}

async function readAttachment(id: string, ctx: ToolContext) {
  const file = ctx.attachments.get(id) ?? [...ctx.attachments.values()].find((a) => a.name === id);
  if (!file) throw new Error("Arquivo não encontrado. Peça para o usuário anexar o XML da NF-e.");
  try {
    return parseNfeXml(file.content);
  } catch {
    throw new Error(`O arquivo ${file.name} não parece ser um XML de NF-e válido.`);
  }
}

// ---------------------------------------------------------------------------
// Ferramentas
// ---------------------------------------------------------------------------

export const TOOLS = [
  tool({
    name: "buscar_produtos",
    label: "Consultando produtos",
    description:
      "Busca produtos do estoque por nome, SKU, código de barras ou marca, com filtros de categoria e situação de estoque. Use para perguntas como 'o que está com estoque baixo', 'quanto tem de cimento'.",
    schema: z.object({
      busca: z.string().optional().describe("Texto livre: nome, SKU, código de barras ou marca"),
      categoria: z.string().optional(),
      situacao: z.enum(["all", "ok", "low", "out", "over"]).optional().describe("low = baixo, out = sem estoque, over = acima do máximo"),
      limite: z.number().int().min(1).max(50).optional(),
    }),
    run: async (input) => {
      const list = await listProducts({ search: input.busca, category: input.categoria, status: input.situacao ?? "all" });
      const limit = input.limite ?? 15;
      return {
        total_encontrado: list.length,
        produtos: list.slice(0, limit).map(productView),
        observacao: list.length > limit ? `Mostrando ${limit} de ${list.length}.` : undefined,
      };
    },
  }),

  tool({
    name: "movimentacoes_estoque",
    label: "Consultando movimentações",
    description: "Lista as últimas movimentações de estoque (entradas, vendas, ajustes, estornos), opcionalmente de um produto.",
    schema: z.object({
      produto: z.string().optional().describe("SKU, código de barras ou nome do produto"),
      tipo: z.enum(["all", "ENTRADA", "SAIDA", "VENDA", "AJUSTE", "ESTORNO"]).optional(),
      limite: z.number().int().min(1).max(50).optional(),
    }),
    run: async (input) => {
      let productId: string | undefined;
      if (input.produto) {
        const { product, candidates } = await findProduct(input.produto);
        if (!product) return ambiguity(input.produto, candidates);
        productId = product._id;
      }
      const list = await listStockMovements({ productId, type: input.tipo ?? "all", limit: input.limite ?? 20 });
      return list.map((m) => ({
        data: formatDateTime(m.timestamp),
        produto: `${m.sku} · ${m.productName}`,
        tipo: m.type,
        quantidade: m.quantity,
        de: m.previousQuantity,
        para: m.newQuantity,
        motivo: m.reason,
        referencia: m.reference,
        usuario: m.userName,
      }));
    },
  }),

  tool({
    name: "ajustar_estoque",
    label: "Ajustando estoque",
    description:
      "Corrige o estoque de um produto: 'add' soma, 'remove' subtrai (perda, avaria) e 'set' define a quantidade contada no inventário. Exige motivo. O usuário confirma na tela antes de aplicar.",
    schema: z.object({
      produto: z.string().describe("SKU, código de barras ou nome exato do produto"),
      modo: z.enum(["add", "remove", "set"]),
      quantidade: z.number().min(0),
      motivo: z.string().min(3).describe("Motivo do ajuste, ex.: 'Inventário mensal', 'Avaria no recebimento'"),
    }),
    confirm: async (input) => {
      const { product } = await findProduct(input.produto);
      const current = product?.quantity ?? 0;
      const next =
        input.modo === "add" ? current + input.quantidade : input.modo === "remove" ? current - input.quantidade : input.quantidade;
      const action = { add: "Adicionar", remove: "Retirar", set: "Definir contagem de" }[input.modo];
      return {
        tool: "ajustar_estoque",
        title: `${action} ${input.quantidade} ${product?.unit ?? ""} — ${product?.name ?? input.produto}`,
        details: product
          ? [
              `SKU ${product.sku}`,
              `Estoque atual: ${current} → novo: ${round2(next)}`,
              `Motivo: ${input.motivo}`,
            ]
          : [`Produto "${input.produto}" não identificado com certeza.`],
      };
    },
    run: async (input) => {
      const { product, candidates } = await findProduct(input.produto);
      if (!product) return ambiguity(input.produto, candidates);
      const movement = await adjustStock({ productId: product._id, mode: input.modo, quantity: input.quantidade, reason: input.motivo });
      return {
        ok: true,
        produto: `${product.sku} · ${product.name}`,
        estoque_anterior: movement.previousQuantity,
        estoque_atual: movement.newQuantity,
        link: "/stock",
      };
    },
  }),

  tool({
    name: "relatorio_vendas",
    label: "Calculando vendas",
    description:
      "Resumo de vendas de um período: faturamento, nº de vendas, ticket médio, lucro estimado, descontos, vendas por forma de pagamento, produtos mais vendidos e DRE simplificado. Vendas canceladas e orçamentos ficam de fora.",
    schema: z.object(rangeInput),
    run: async (input) => {
      const { from, to } = resolveRange(input, "today");
      const report = await getSalesReport(from, to);
      const s = report.summary;
      return {
        periodo: `${formatDate(`${from}T12:00:00`)} a ${formatDate(`${to}T12:00:00`)}`,
        faturamento: formatCurrency(s.revenue),
        vendas: s.count,
        ticket_medio: formatCurrency(s.avgTicket),
        lucro_estimado: formatCurrency(s.profit),
        margem: formatPercent(s.margin),
        descontos: formatCurrency(s.discounts),
        itens_vendidos: s.itemsSold,
        canceladas: { quantidade: report.cancelled.count, valor: formatCurrency(report.cancelled.total) },
        por_pagamento: report.payments.map((p) => ({ forma: p.method, total: formatCurrency(p.total), vendas: p.count })),
        mais_vendidos: report.products.slice(0, 5).map((p) => ({ produto: `${p.sku} · ${p.name}`, qtd: p.qty, receita: formatCurrency(p.revenue) })),
        dre: {
          receita_bruta: formatCurrency(report.dre.receitaBruta),
          descontos: formatCurrency(report.dre.descontos),
          receita_liquida: formatCurrency(report.dre.receitaLiquida),
          cmv: formatCurrency(report.dre.cmv),
          lucro_bruto: formatCurrency(report.dre.lucroBruto),
          despesas_pagas: formatCurrency(report.dre.despesasPagas),
          resultado: formatCurrency(report.dre.resultado),
        },
        link: "/reports",
      };
    },
  }),

  tool({
    name: "listar_vendas",
    label: "Listando vendas",
    description: "Lista vendas individuais com filtros (período, status, forma de pagamento, busca por número ou cliente). Use para achar uma venda específica.",
    schema: z.object({
      ...rangeInput,
      status: z.enum(["all", "FINALIZED", "QUOTE", "CANCELLED"]).optional(),
      forma_pagamento: z.enum(PAYMENT_METHODS as [string, ...string[]]).optional(),
      busca: z.string().optional().describe("Número da venda (#1234) ou nome do cliente"),
      limite: z.number().int().min(1).max(50).optional(),
    }),
    run: async (input) => {
      const range = input.busca && !input.period && !input.from && !input.to ? periodRange("30d") : resolveRange(input, "7d");
      const rows = await listSales({
        start: range.from,
        end: range.to,
        status: input.status ?? "all",
        paymentMethod: (input.forma_pagamento as (typeof PAYMENT_METHODS)[number] | undefined) ?? "all",
        search: input.busca,
      });
      const limit = input.limite ?? 15;
      return {
        total_encontrado: rows.length,
        vendas: rows.slice(0, limit).map((s) => ({
          numero: s.saleNumber,
          data: formatDateTime(s.createdAt),
          status: { FINALIZED: "Finalizada", QUOTE: "Orçamento", CANCELLED: "Cancelada" }[s.status],
          cliente: s.customerName ?? "Consumidor",
          pagamento: s.splitPayment ? `Dinheiro + ${s.splitPayment.method}` : s.paymentMethod,
          itens: s.items.length,
          total: formatCurrency(s.total),
        })),
        link: "/sales-history",
      };
    },
  }),

  tool({
    name: "resumo_caixa",
    label: "Montando resumo do caixa",
    description:
      "Resumo de uma sessão de caixa: vendas por forma de pagamento, suprimentos, sangrias, dinheiro esperado na gaveta e diferença no fechamento. Sem número, usa o caixa aberto (ou o último fechado).",
    schema: z.object({
      numero_caixa: z.number().int().optional().describe("Número da sessão de caixa"),
    }),
    run: async (input) => {
      let id: string | null = null;
      if (input.numero_caixa) {
        id = `cx${input.numero_caixa}`;
      } else {
        const open = await getOpenSession();
        id = open?.session._id ?? (await listSessionSummaries({ status: "fechado" }))[0]?.session._id ?? null;
      }
      if (!id) return { erro: "Nenhum caixa encontrado." };
      const d = await getSessionDetail(id);
      const methods = Object.entries(d.byMethod)
        .filter(([, v]) => v > 0)
        .map(([forma, total]) => ({ forma, total: formatCurrency(total) }));
      return {
        caixa: d.session.number,
        status: d.session.status,
        operador: d.session.operatorName,
        abertura: formatDateTime(d.session.openedAt),
        fechamento: d.session.closedAt ? formatDateTime(d.session.closedAt) : "em aberto",
        valor_inicial: formatCurrency(d.session.openingAmount),
        vendas: d.salesCount,
        canceladas: d.cancelledCount,
        total_vendido: formatCurrency(d.totalSales),
        descontos: formatCurrency(d.totalDiscounts),
        por_forma_pagamento: methods,
        suprimentos: formatCurrency(d.suprimentos),
        sangrias: formatCurrency(d.retiradas),
        dinheiro_esperado: formatCurrency(d.expectedCash),
        contado: d.counted !== null ? formatCurrency(d.counted) : undefined,
        diferenca: d.difference !== null ? formatCurrency(d.difference) : undefined,
        alerta: d.longOpen ? "Caixa aberto há mais de 24h" : undefined,
        movimentos: d.movements.map((m) => `${formatDateTime(m.timestamp)} ${m.type} ${formatCurrency(m.amount)} — ${m.reason}`),
        link: "/cash-audit",
      };
    },
  }),

  tool({
    name: "contas",
    label: "Consultando contas",
    description:
      "Lista contas a pagar ou a receber com totais: pendentes, vencidas, que vencem nos próximos dias. Use para 'o que vence esta semana', 'quem está devendo'.",
    schema: z.object({
      tipo: z.enum(["pagar", "receber"]),
      situacao: z.enum(["abertas", "vencidas", "pagas", "todas"]).optional(),
      vence_em_dias: z.number().int().min(0).max(365).optional().describe("Só contas que vencem até N dias a partir de hoje"),
      limite: z.number().int().min(1).max(50).optional(),
    }),
    run: async (input) => {
      const raw = input.tipo === "pagar" ? await listPayables() : await listReceivables();
      const rows = raw
        .map((b) => ({ bill: b, status: billStatus(b), days: daysUntil(b.dueDate) }))
        .filter(({ status }) => {
          const s = input.situacao ?? "abertas";
          if (s === "todas") return true;
          if (s === "pagas") return status === "paid";
          if (s === "vencidas") return status === "overdue";
          return status === "pending" || status === "overdue";
        })
        .filter(({ days }) => input.vence_em_dias === undefined || days <= input.vence_em_dias);
      const total = rows.reduce((s, r) => s + r.bill.amount, 0);
      const limit = input.limite ?? 20;
      return {
        tipo: input.tipo === "pagar" ? "Contas a pagar" : "Contas a receber",
        quantidade: rows.length,
        total: formatCurrency(total),
        contas: rows.slice(0, limit).map(({ bill, status, days }) => ({
          descricao: bill.description,
          [input.tipo === "pagar" ? "fornecedor" : "cliente"]: "supplier" in bill ? bill.supplier : bill.customerName,
          valor: formatCurrency(bill.amount),
          vencimento: formatDate(bill.dueDate),
          situacao: BILL_STATUS_LABEL[status],
          dias: days === Infinity ? undefined : days,
        })),
        link: input.tipo === "pagar" ? "/bills" : "/receivables",
      };
    },
  }),

  tool({
    name: "notas_recebidas",
    label: "Consultando notas recebidas",
    description: "Lista as últimas notas fiscais de entrada já registradas (fornecedor, número, itens, valor).",
    schema: z.object({ limite: z.number().int().min(1).max(30).optional() }),
    run: async (input) => {
      const list = await listReceivings(input.limite ?? 10);
      return {
        notas: list.map((r) => ({
          nota: r.reference,
          fornecedor: r.supplier || "não informado",
          data: formatDateTime(r.timestamp),
          itens: r.items,
          unidades: r.units,
        })),
        link: "/receiving",
      };
    },
  }),

  tool({
    name: "previa_importar_nfe",
    label: "Lendo a NF-e",
    description:
      "Lê um XML de NF-e anexado pelo usuário e mostra fornecedor, número, valor e itens, indicando quais já existem no cadastro e quais seriam criados. Não altera nada. Use antes de importar.",
    schema: z.object({ arquivo_id: z.string().describe("Id do arquivo anexado") }),
    run: async (input, ctx) => {
      const doc = await readAttachment(input.arquivo_id, ctx);
      const items = await nfePreview(doc);
      const already = (await listReceivings(50)).some((r) => JSON.stringify(r).includes(`NF ${doc.number}`));
      return {
        nota: doc.number,
        serie: doc.series,
        emissao: doc.issueDate ? formatDate(doc.issueDate) : undefined,
        fornecedor: doc.supplier.name,
        cnpj: doc.supplier.cnpj,
        valor_total: formatCurrency(doc.totalValue),
        ja_registrada: already,
        itens: items.map(({ item, match }) => ({
          descricao: item.description,
          codigo: item.code,
          ean: item.ean || undefined,
          quantidade: item.quantity,
          custo_unitario: formatCurrency(item.unitPrice),
          produto_existente: match ? `${match.sku} · ${match.name}` : null,
        })),
      };
    },
  }),

  tool({
    name: "importar_nfe",
    label: "Importando a NF-e",
    description:
      "Registra a entrada de uma NF-e anexada: soma as quantidades ao estoque dos produtos encontrados e, se 'criar_novos' for verdadeiro, cadastra os itens que não existem (preço de venda = custo + margem). O usuário confirma antes.",
    schema: z.object({
      arquivo_id: z.string(),
      atualizar_custo: z.boolean().describe("Atualiza o preço de custo dos produtos com o valor da nota"),
      criar_novos: z.boolean().describe("Cadastra os itens que ainda não existem"),
      margem_percentual: z.number().min(0).max(500).optional().describe("Margem para o preço de venda dos itens novos (padrão 40)"),
    }),
    confirm: async (input, ctx) => {
      const doc = await readAttachment(input.arquivo_id, ctx);
      const items = await nfePreview(doc);
      const existing = items.filter((i) => i.match).length;
      const created = items.length - existing;
      return {
        tool: "importar_nfe",
        title: `Registrar entrada da NF ${doc.number} — ${doc.supplier.name}`,
        details: [
          `${items.length} itens · ${formatCurrency(doc.totalValue)}`,
          `${existing} produtos já cadastrados recebem estoque`,
          created
            ? input.criar_novos
              ? `${created} produtos novos serão cadastrados (margem ${input.margem_percentual ?? 40}%)`
              : `${created} itens sem cadastro serão ignorados`
            : "Nenhum produto novo",
          input.atualizar_custo ? "Preço de custo será atualizado" : "Preço de custo mantido",
        ],
      };
    },
    run: async (input, ctx) => {
      const doc = await readAttachment(input.arquivo_id, ctx);
      const items = await nfePreview(doc);
      const markup = 1 + (input.margem_percentual ?? 40) / 100;
      const selected = items.filter((i) => i.match || input.criar_novos);
      if (!selected.length) return { erro: "Nenhum item para importar." };
      const result = await registerReceiving({
        document: doc.number,
        supplier: doc.supplier.tradeName || doc.supplier.name,
        issueDate: doc.issueDate?.slice(0, 10),
        updateCost: input.atualizar_custo,
        notes: "Importada pelo Assistente BuildFlow",
        items: selected.map(({ item, match }) =>
          match
            ? { productId: match._id, quantity: item.quantity, unitCost: item.unitPrice }
            : {
                quantity: item.quantity,
                unitCost: item.unitPrice,
                newProduct: {
                  name: item.description,
                  sku: (item.code || `NF${doc.number}-${item.index}`).toUpperCase(),
                  barcode: item.ean || undefined,
                  category: "Materiais",
                  brand: doc.supplier.name,
                  supplier: doc.supplier.name,
                  unit: toUnit(item.unit),
                  quantity: 0,
                  minStock: 0,
                  maxStock: 0,
                  price: round2(item.unitPrice * markup),
                  costPrice: item.unitPrice,
                  perishable: false,
                  active: true,
                },
              },
        ),
      });
      return {
        ok: true,
        referencia: result.reference,
        itens_lancados: result.movements.length,
        produtos_criados: result.createdProducts,
        valor: formatCurrency(result.total),
        ignorados: items.length - selected.length,
        link: "/receiving",
      };
    },
  }),
] as const satisfies readonly AssistantTool[];

export type ToolName = (typeof TOOLS)[number]["name"];

export function findTool(name: string) {
  return (TOOLS as readonly AssistantTool[]).find((t) => t.name === name);
}

/** JSON Schema de cada ferramenta (para Claude e OpenAI). */
export function toolJsonSchema(t: AssistantTool) {
  const schema = z.toJSONSchema(t.schema, { target: "draft-7", io: "input" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

export type ToolOutcome = { ok: true; result: unknown } | { ok: false; error: string; declined?: boolean };

/**
 * Valida, pede confirmação (quando a ação altera dados) e executa.
 * Usado igualmente pelos três provedores.
 */
export async function executeTool(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
  confirm: (request: ConfirmRequest) => Promise<boolean>,
): Promise<ToolOutcome> {
  const t = findTool(name);
  if (!t) return { ok: false, error: `Ferramenta desconhecida: ${name}` };
  const parsed = t.schema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { ok: false, error: `Entrada inválida: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
  }
  try {
    if (t.confirm) {
      const request = await t.confirm(parsed.data, ctx);
      const approved = await confirm(request);
      if (!approved) return { ok: false, declined: true, error: "O usuário recusou a ação. Nada foi alterado." };
    }
    return { ok: true, result: await t.run(parsed.data, ctx) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro ao executar a ferramenta" };
  }
}

/** Resumo curto do resultado para a linha de status da ferramenta na UI. */
export function outcomeSummary(outcome: ToolOutcome) {
  if (!outcome.ok) return outcome.declined ? "Cancelado pelo usuário" : outcome.error;
  const r = outcome.result as Record<string, unknown> | unknown[];
  if (Array.isArray(r)) return `${r.length} registro(s)`;
  if (r && typeof r === "object") {
    if ("erro" in r) return String(r.erro);
    if ("total_encontrado" in r) return `${r.total_encontrado} encontrado(s)`;
    if ("ok" in r) return "Concluído";
  }
  return "Concluído";
}
