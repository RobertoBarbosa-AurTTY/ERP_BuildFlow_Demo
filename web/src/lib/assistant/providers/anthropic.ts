// Provedor Claude: Messages API (beta, por causa dos fallbacks) com loop de
// ferramentas manual em streaming. Roda no navegador com a chave do próprio
// usuário (BYOK) — por isso `dangerouslyAllowBrowser`.
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, turnContext } from "../knowledge";
import { executeTool, findTool, outcomeSummary, TOOLS, toolJsonSchema } from "../tools";
import type { AssistantSession, ToolContext, TurnCallbacks } from "../types";

// Modelos com fallback automático no servidor quando o modelo recusa um pedido.
const FALLBACK_MODELS = new Set(["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
const MAX_STEPS = 12;

const tools: Anthropic.Beta.BetaTool[] = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: toolJsonSchema(t) as Anthropic.Beta.BetaTool.InputSchema,
  // Streaming + ferramentas: entradas chegam sem buffer; validamos com Zod em executeTool.
  eager_input_streaming: true,
}));

export function friendlyAnthropicError(error: unknown) {
  if (error instanceof Anthropic.AuthenticationError) return "Chave de API da Anthropic inválida. Confira em Configurar.";
  if (error instanceof Anthropic.PermissionDeniedError) return "Esta chave não tem permissão para usar o modelo escolhido.";
  if (error instanceof Anthropic.NotFoundError) return "Modelo não encontrado. Confira o nome do modelo em Configurar.";
  if (error instanceof Anthropic.RateLimitError) return "Limite de uso atingido na Anthropic. Tente de novo em instantes.";
  if (error instanceof Anthropic.APIConnectionError) return "Não foi possível conectar à API da Anthropic. Verifique sua internet.";
  if (error instanceof Anthropic.APIError) return `Erro da API da Anthropic (${error.status ?? "?"}): ${error.message}`;
  return error instanceof Error ? error.message : "Erro inesperado";
}

export function createAnthropicSession(apiKey: string, model: string, ctx: ToolContext): AssistantSession {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const history: Anthropic.Beta.BetaMessageParam[] = [];

  return {
    async send(text: string, cb: TurnCallbacks) {
      history.push({
        role: "user",
        content: [
          { type: "text", text: turnContext(ctx.userName, ctx.userRole, [...ctx.attachments.values()]) },
          { type: "text", text },
        ],
      });

      let jsonRetries = 0;
      for (let step = 0; step < MAX_STEPS; step++) {
        const stream = client.beta.messages.stream(
          {
            model,
            max_tokens: 64000,
            ...(FALLBACK_MODELS.has(model)
              ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
              : {}),
            thinking: { type: "adaptive" },
            output_config: { effort: "medium" },
            system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
            tools,
            messages: history,
          },
          { signal: cb.signal },
        );
        stream.on("text", (delta) => cb.onText(delta));

        let message: Anthropic.Beta.BetaMessage;
        try {
          message = await stream.finalMessage();
          jsonRetries = 0;
        } catch (error) {
          // Entrada de ferramenta impossível de ler: refaz a rodada (até 2x). Erros da API sobem.
          if (error instanceof Anthropic.APIError || cb.signal.aborted || jsonRetries++ >= 2) throw error;
          continue;
        }

        // Recusa pode cortar uma chamada de ferramenta no meio: nunca execute essa rodada.
        if (message.stop_reason === "refusal") {
          cb.onText("\n\nNão posso ajudar com esse pedido. Posso ajudar com estoque, vendas, caixa, contas ou dúvidas do sistema.");
          history.push({ role: "assistant", content: message.content });
          return;
        }

        // Devolve o conteúdo completo (inclui blocos de raciocínio) ao histórico.
        history.push({ role: "assistant", content: message.content });

        if (message.stop_reason === "pause_turn") continue;

        const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
        if (!toolUses.length) return;

        if (message.stop_reason === "max_tokens") {
          throw new Error("A resposta foi cortada antes de concluir a ação. Tente pedir de forma mais curta.");
        }

        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const use of toolUses) {
          const info = { id: use.id, name: use.name, label: findTool(use.name)?.label ?? use.name, input: use.input };
          cb.onToolStart(info);
          const outcome = await executeTool(use.name, use.input, ctx, cb.confirm);
          cb.onToolEnd(info, { ok: outcome.ok, summary: outcomeSummary(outcome) });
          results.push({
            type: "tool_result",
            tool_use_id: use.id,
            is_error: !outcome.ok,
            content: JSON.stringify(outcome.ok ? outcome.result : { erro: outcome.error }),
          });
        }
        history.push({ role: "user", content: results });
      }
      cb.onText("\n\n(Parei aqui para não ficar em loop. Pode reformular o pedido?)");
    },
  };
}
