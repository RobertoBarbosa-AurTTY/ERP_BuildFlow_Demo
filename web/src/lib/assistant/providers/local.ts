// Assistente local: funciona sem chave de API e sem internet. Reconhece
// intenções por palavras-chave e usa as MESMAS ferramentas dos provedores de IA,
// então consultas, ajustes de estoque e importação de NF-e funcionam igual —
// só a conversa é mais limitada.
import { FAQ, MODULES } from "@/lib/help/content";
import { executeTool, findTool, outcomeSummary, PERIOD_LABEL } from "../tools";
import type { AssistantSession, ToolContext, TurnCallbacks } from "../types";

type Row = Record<string, unknown>;

function norm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const CAPABILITIES = `Sou o **assistente local** do BuildFlow (sem IA externa). Entendo pedidos diretos, como:

- **Estoque:** "o que está com estoque baixo?", "produtos sem estoque", "quanto tem de cimento?"
- **Corrigir estoque:** "ajustar estoque do MAT-001 para 118", "retirar 2 do TIN-018 motivo avaria", "adicionar 10 ao HID-042"
- **Vendas:** "vendas de hoje", "resumo de vendas do mês", "venda #1234"
- **Caixa:** "resumo do caixa", "resumo do caixa 58"
- **Contas:** "contas a pagar vencidas", "o que vence esta semana a receber"
- **Notas:** anexe o XML e diga "importar nota"; ou "notas recebidas"
- **Dúvidas:** "como fazer sangria?", "como parcelar uma conta?"

Para conversas mais livres, configure o Claude ou a OpenAI em **Configurar**.`;

function detectPeriod(text: string) {
  if (/mes passado|ultimo mes/.test(text)) return "last_month" as const;
  if (/\bmes\b|mensal/.test(text)) return "month" as const;
  if (/30 dias/.test(text)) return "30d" as const;
  if (/semana|7 dias/.test(text)) return "7d" as const;
  if (/ontem/.test(text)) return "yesterday" as const;
  return "today" as const;
}

/** Referência de produto: SKU (ABC-123), código de barras ou o texto depois de "do/da/de". */
function productRef(original: string) {
  const sku = original.match(/\b[A-Za-z]{2,5}-\d{1,4}\b/);
  if (sku) return sku[0].toUpperCase();
  const ean = original.match(/\b\d{8,14}\b/);
  if (ean) return ean[0];
  const after = original.match(/\b(?:do|da|de|no|na|ao|em)\s+(?:produto\s+)?([^,.;]+?)(?:\s+(?:para|pra|motivo|por)\b|[,.;]|$)/i);
  return after?.[1]?.trim();
}

function quantityIn(original: string) {
  const m = original.match(/(?:para|pra|em)\s+(\d+(?:[.,]\d+)?)/i) ?? original.match(/(\d+(?:[.,]\d+)?)/);
  return m ? Number(m[1].replace(",", ".")) : null;
}

function reasonIn(original: string) {
  return original.match(/motivo[:\s]+(.+)$/i)?.[1]?.trim();
}

// ---------------------------------------------------------------------------
// Formatação das respostas
// ---------------------------------------------------------------------------

function table(rows: Row[], columns: [key: string, label: string][]) {
  if (!rows.length) return "_Nenhum registro._";
  const head = `| ${columns.map(([, l]) => l).join(" | ")} |\n| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${columns.map(([k]) => String(r[k] ?? "—").replace(/\|/g, "/")).join(" | ")} |`).join("\n");
  return `${head}\n${body}`;
}

function formatResult(tool: string, data: Row): string {
  if ("erro" in data) {
    const opts = (data.opcoes as Row[] | undefined)?.map((o) => `- ${o.sku} · ${o.nome} (estoque ${o.estoque})`).join("\n");
    return `${data.erro}${opts ? `\n\n${opts}\n\nRepita o pedido usando o SKU.` : ""}`;
  }
  switch (tool) {
    case "buscar_produtos":
      return `Encontrei **${data.total_encontrado}** produto(s).${data.observacao ? ` ${data.observacao}` : ""}\n\n${table(data.produtos as Row[], [
        ["sku", "SKU"],
        ["nome", "Produto"],
        ["estoque", "Estoque"],
        ["status", "Situação"],
        ["preco", "Preço"],
      ])}\n\n[Abrir Estoque](/stock)`;
    case "ajustar_estoque":
      return `Estoque ajustado: **${data.produto}** passou de ${data.estoque_anterior} para **${data.estoque_atual}**.\n\n[Ver no Estoque](/stock)`;
    case "relatorio_vendas": {
      const pay = (data.por_pagamento as Row[]).map((p) => `- ${p.forma}: ${p.total} (${p.vendas})`).join("\n");
      const top = (data.mais_vendidos as Row[]).map((p, i) => `${i + 1}. ${p.produto} — ${p.qtd} un · ${p.receita}`).join("\n");
      const dre = data.dre as Row;
      return `**Vendas — ${data.periodo}**

- Faturamento: **${data.faturamento}** em ${data.vendas} vendas (ticket médio ${data.ticket_medio})
- Lucro estimado: **${data.lucro_estimado}** (margem ${data.margem})
- Descontos: ${data.descontos} · Canceladas: ${(data.canceladas as Row).quantidade}

**Por forma de pagamento**
${pay || "_Sem vendas._"}

**Mais vendidos**
${top || "_Sem vendas._"}

**DRE simplificado:** receita líquida ${dre.receita_liquida} − CMV ${dre.cmv} = lucro bruto ${dre.lucro_bruto}; despesas pagas ${dre.despesas_pagas}; resultado **${dre.resultado}**.

[Abrir Relatórios](/reports)`;
    }
    case "listar_vendas":
      return `**${data.total_encontrado}** venda(s) encontrada(s).\n\n${table(data.vendas as Row[], [
        ["numero", "Nº"],
        ["data", "Data"],
        ["cliente", "Cliente"],
        ["pagamento", "Pagamento"],
        ["status", "Status"],
        ["total", "Total"],
      ])}\n\n[Abrir Histórico de vendas](/sales-history)`;
    case "resumo_caixa": {
      const methods = (data.por_forma_pagamento as Row[]).map((m) => `- ${m.forma}: ${m.total}`).join("\n");
      const moves = (data.movimentos as string[]).map((m) => `- ${m}`).join("\n");
      return `**Caixa ${data.caixa}** — ${data.status} · ${data.operador}
Abertura ${data.abertura} · Fechamento ${data.fechamento}

- Vendas: **${data.total_vendido}** (${data.vendas} vendas, ${data.canceladas} canceladas)
- Valor inicial: ${data.valor_inicial} · Suprimentos: ${data.suprimentos} · Sangrias: ${data.sangrias}
- Dinheiro esperado na gaveta: **${data.dinheiro_esperado}**${data.contado ? `\n- Contado: ${data.contado} · Diferença: **${data.diferenca}**` : ""}${data.alerta ? `\n- ⚠️ ${data.alerta}` : ""}

**Por forma de pagamento**
${methods || "_Sem vendas._"}${moves ? `\n\n**Movimentos**\n${moves}` : ""}

[Abrir Auditoria de caixa](/cash-audit)`;
    }
    case "contas":
      return `**${data.tipo}:** ${data.quantidade} conta(s), total **${data.total}**.\n\n${table(data.contas as Row[], [
        ["descricao", "Descrição"],
        [Object.keys((data.contas as Row[])[0] ?? {}).includes("fornecedor") ? "fornecedor" : "cliente", "Quem"],
        ["valor", "Valor"],
        ["vencimento", "Vencimento"],
        ["situacao", "Situação"],
      ])}\n\n[Abrir](${data.link})`;
    case "movimentacoes_estoque":
      return table((data as unknown as Row[]) ?? [], [
        ["data", "Data"],
        ["produto", "Produto"],
        ["tipo", "Tipo"],
        ["quantidade", "Qtd"],
        ["para", "Saldo"],
      ]);
    case "notas_recebidas":
      return `${table(data.notas as Row[], [
        ["nota", "Nota"],
        ["fornecedor", "Fornecedor"],
        ["data", "Data"],
        ["itens", "Itens"],
        ["unidades", "Unidades"],
      ])}\n\n[Abrir Entradas](/receiving)`;
    case "previa_importar_nfe":
      return `**NF ${data.nota}** — ${data.fornecedor} · ${data.valor_total}${data.ja_registrada ? "\n\n⚠️ Esta nota parece já ter sido registrada." : ""}\n\n${table(
        (data.itens as Row[]).map((i) => ({ ...i, produto_existente: i.produto_existente ?? "novo" })),
        [
          ["descricao", "Item"],
          ["quantidade", "Qtd"],
          ["custo_unitario", "Custo"],
          ["produto_existente", "Cadastro"],
        ],
      )}`;
    case "importar_nfe":
      return `Entrada registrada (**${data.referencia}**): ${data.itens_lancados} item(ns), ${data.produtos_criados} produto(s) novo(s), total ${data.valor}.${Number(data.ignorados) ? ` ${data.ignorados} ignorado(s).` : ""}\n\n[Abrir Entradas](/receiving)`;
    default:
      return "```json\n" + JSON.stringify(data, null, 2) + "\n```";
  }
}

// ---------------------------------------------------------------------------
// Ajuda: busca simples na base de conhecimento
// ---------------------------------------------------------------------------

const STOP = new Set(["como", "fazer", "faco", "que", "para", "uma", "um", "o", "a", "de", "do", "da", "no", "na", "e", "eu", "posso", "qual", "onde", "fica", "se", "com", "os", "as"]);

function searchHelp(text: string) {
  const words = norm(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return null;
  type Hit = { score: number; answer: string };
  const hits: Hit[] = [];
  for (const m of MODULES) {
    for (const t of m.topics) {
      const hay = norm(`${m.title} ${t.title} ${t.body ?? ""} ${(t.steps ?? []).join(" ")}`);
      const score = words.filter((w) => hay.includes(w)).length + (words.some((w) => norm(t.title).includes(w)) ? 1 : 0);
      if (score) {
        const steps = t.steps?.length ? `\n\n${t.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : "";
        hits.push({
          score,
          answer: `**${m.title} — ${t.title}**\n\n${t.body ?? ""}${steps}${t.tip ? `\n\n💡 ${t.tip}` : ""}\n\n[Abrir ${m.title}](${m.href})`,
        });
      }
    }
  }
  for (const f of FAQ) {
    const hay = norm(`${f.q} ${f.a}`);
    const score = words.filter((w) => hay.includes(w)).length + 0.5;
    if (score > 0.5) hits.push({ score, answer: `**${f.q}**\n\n${f.a}` });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits[0] && hits[0].score >= Math.min(2, words.length) ? hits[0].answer : null;
}

// ---------------------------------------------------------------------------
// Roteamento de intenções
// ---------------------------------------------------------------------------

interface Plan {
  tool: string;
  input: Row;
}

function plan(original: string, ctx: ToolContext): Plan | { reply: string } | null {
  const t = norm(original);
  const attachment = [...ctx.attachments.values()].at(-1);

  if (/^(oi|ola|bom dia|boa tarde|boa noite|ajuda|help)\b|o que (voce|vc) (faz|sabe)|como (voce|vc) funciona/.test(t)) {
    return { reply: CAPABILITIES };
  }

  // Importar NF-e
  const mentionsNote = /\b(nota|nf|nfe|xml|anexo|anexad[oa]|arquivo)\b/.test(t);
  const wantsImport = /(import|lanc|registr|dar entrada)/.test(t);
  if ((wantsImport && mentionsNote) || /\bnfe\b|\bxml\b/.test(t) || (attachment && mentionsNote && !/notas? (recebidas|de entrada|lancadas)/.test(t))) {
    if (!attachment) return { reply: "Para importar uma nota, anexe o **XML da NF-e** pelo botão de clipe e peça de novo: \"importar nota\"." };
    const preview = !wantsImport;
    return preview
      ? { tool: "previa_importar_nfe", input: { arquivo_id: attachment.id } }
      : {
          tool: "importar_nfe",
          input: { arquivo_id: attachment.id, atualizar_custo: !/sem atualizar|manter custo/.test(t), criar_novos: !/nao criar|sem criar|ignor/.test(t) },
        };
  }
  if (/notas? (recebidas|de entrada|lancadas)|ultimas notas|entradas recentes/.test(t)) {
    return { tool: "notas_recebidas", input: {} };
  }

  // Ajuste de estoque
  const isSet = /(ajust|corrig|defin|acert|contei|contagem).*(estoque|saldo|quantidade)|estoque .* para \d/.test(t);
  const isAdd = /\b(adicion|acrescent|soma|some|incluir|inclua|entrar com)/.test(t);
  const isRemove = /\b(retir|remov|tirar|tire|baixar|baixa de|perda|avaria|quebr|descart)/.test(t);
  if ((isSet || isAdd || isRemove) && /\d/.test(t)) {
    const ref = productRef(original);
    const qty = quantityIn(original);
    if (!ref || qty === null) {
      return { reply: "Não entendi o produto ou a quantidade. Exemplo: **ajustar estoque do MAT-001 para 118 motivo inventário**." };
    }
    const mode = isRemove ? "remove" : isAdd && !isSet ? "add" : "set";
    return {
      tool: "ajustar_estoque",
      input: {
        produto: ref,
        modo: mode,
        quantidade: qty,
        motivo: reasonIn(original) ?? { set: "Contagem de inventário", add: "Entrada manual", remove: "Baixa manual" }[mode] + " (assistente)",
      },
    };
  }

  // Caixa
  if (/\bcaixa\b|sangria|suprimento|fechamento/.test(t) && !/como /.test(t)) {
    const n = t.match(/caixa\s*(?:n[ºo.]?\s*)?(\d+)/);
    return { tool: "resumo_caixa", input: n ? { numero_caixa: Number(n[1]) } : {} };
  }

  // Contas
  if (/(conta|boleto|fatura|duplicata)s?|a pagar|a receber|vencid|vence|devendo|inadimpl/.test(t) && !/como /.test(t)) {
    const tipo = /receb|devendo|inadimpl|cliente/.test(t) ? "receber" : "pagar";
    const input: Row = { tipo, situacao: /vencid|atrasad|devendo|inadimpl/.test(t) ? "vencidas" : /pag(a|o)s\b|quitad/.test(t) ? "pagas" : "abertas" };
    if (/semana|7 dias/.test(t)) input.vence_em_dias = 7;
    else if (/hoje/.test(t)) input.vence_em_dias = 0;
    else if (/mes|30 dias/.test(t)) input.vence_em_dias = 30;
    return { tool: "contas", input };
  }

  // Vendas
  const saleNumber = original.match(/#\s?(\d{3,})|venda\s+(?:n[ºo.]?\s*)?(\d{3,})/i);
  if (saleNumber) return { tool: "listar_vendas", input: { busca: saleNumber[1] ?? saleNumber[2] } };
  if (/vend|faturament|fatur|ticket|lucro|receita|dre|cancelad/.test(t) && !/como /.test(t)) {
    if (/lista|quais|ultimas/.test(t)) return { tool: "listar_vendas", input: { period: detectPeriod(t), status: /cancelad/.test(t) ? "CANCELLED" : "all" } };
    return { tool: "relatorio_vendas", input: { period: detectPeriod(t) } };
  }

  // Movimentações
  if (/moviment|historico do produto|entradas e saidas/.test(t)) {
    const ref = productRef(original);
    return { tool: "movimentacoes_estoque", input: ref ? { produto: ref } : {} };
  }

  // Estoque / produtos
  if (/estoque baixo|acabando|repor|reposic|abaixo do minimo|baixo estoque/.test(t)) return { tool: "buscar_produtos", input: { situacao: "low" } };
  if (/sem estoque|zerad|em falta|esgotad/.test(t)) return { tool: "buscar_produtos", input: { situacao: "out" } };
  if (/acima do maximo|excesso/.test(t)) return { tool: "buscar_produtos", input: { situacao: "over" } };
  const productQuery =
    original.match(/(?:quanto (?:tem|temos|ha|há) (?:de|do|da)?|estoque (?:de|do|da)|pre[cç]o (?:de|do|da)|produto|buscar|procurar|consultar)\s+(.+?)[?.!]*$/i)?.[1];
  if (productQuery && !/como /.test(t)) return { tool: "buscar_produtos", input: { busca: productQuery.trim() } };

  // Dúvidas de uso
  const help = searchHelp(original);
  if (help) return { reply: help };

  return null;
}

export function createLocalSession(ctx: ToolContext): AssistantSession {
  return {
    async send(text: string, cb: TurnCallbacks) {
      const decided = plan(text, ctx);
      if (!decided) {
        cb.onText(`Não consegui entender esse pedido. ${CAPABILITIES}`);
        return;
      }
      if ("reply" in decided) {
        cb.onText(decided.reply);
        return;
      }
      const info = { id: `local-${Date.now()}`, name: decided.tool, label: findTool(decided.tool)?.label ?? decided.tool, input: decided.input };
      cb.onToolStart(info);
      const outcome = await executeTool(decided.tool, decided.input, ctx, cb.confirm);
      cb.onToolEnd(info, { ok: outcome.ok, summary: outcomeSummary(outcome) });
      if (!outcome.ok) {
        cb.onText(outcome.declined ? "Tudo bem, não alterei nada." : `Não deu certo: ${outcome.error}`);
        return;
      }
      let reply = formatResult(decided.tool, outcome.result as Row);
      if (decided.tool === "relatorio_vendas" && "period" in decided.input) {
        reply = reply.replace("**Vendas —", `**Vendas (${PERIOD_LABEL[decided.input.period as keyof typeof PERIOD_LABEL]}) —`);
      }
      cb.onText(reply);
    },
  };
}
