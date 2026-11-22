// Provedor OpenAI: Chat Completions com function calling, em streaming,
// usando o SDK oficial. Mesmas ferramentas e prompt do provedor Claude.
import OpenAI from "openai";
import { SYSTEM_PROMPT, turnContext } from "../knowledge";
import { executeTool, findTool, outcomeSummary, TOOLS, toolJsonSchema } from "../tools";
import type { AssistantSession, ToolContext, TurnCallbacks } from "../types";

const MAX_STEPS = 12;

const tools: OpenAI.Chat.Completions.ChatCompletionFunctionTool[] = TOOLS.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: toolJsonSchema(t) },
}));

export function friendlyOpenAIError(error: unknown) {
  if (error instanceof OpenAI.AuthenticationError) return "Chave de API da OpenAI inválida. Confira em Configurar.";
  if (error instanceof OpenAI.NotFoundError) return "Modelo não encontrado na OpenAI. Confira o nome do modelo em Configurar.";
  if (error instanceof OpenAI.RateLimitError) return "Limite de uso atingido na OpenAI. Tente de novo em instantes.";
  if (error instanceof OpenAI.APIConnectionError) return "Não foi possível conectar à API da OpenAI. Verifique sua internet.";
  if (error instanceof OpenAI.APIError) return `Erro da API da OpenAI (${error.status ?? "?"}): ${error.message}`;
  return error instanceof Error ? error.message : "Erro inesperado";
}

export function createOpenAISession(apiKey: string, model: string, ctx: ToolContext): AssistantSession {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{ role: "system", content: SYSTEM_PROMPT }];

  return {
    async send(text: string, cb: TurnCallbacks) {
      history.push({
        role: "user",
        content: `${turnContext(ctx.userName, ctx.userRole, [...ctx.attachments.values()])}\n\n${text}`,
      });

      for (let step = 0; step < MAX_STEPS; step++) {
        const stream = client.chat.completions.stream({ model, messages: history, tools }, { signal: cb.signal });
        stream.on("content", (delta) => cb.onText(delta));
        const completion = await stream.finalChatCompletion();
        const choice = completion.choices[0];
        const message = choice?.message;
        if (!message) return;

        if (message.refusal) {
          cb.onText(message.refusal);
          return;
        }

        const calls = (message.tool_calls ?? []).filter(
          (c): c is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall => c.type === "function",
        );
        history.push({ role: "assistant", content: message.content ?? "", tool_calls: calls.length ? calls : undefined });
        if (!calls.length) return;

        if (choice.finish_reason === "length") {
          throw new Error("A resposta foi cortada antes de concluir a ação. Tente pedir de forma mais curta.");
        }

        for (const call of calls) {
          let input: unknown;
          try {
            input = JSON.parse(call.function.arguments || "{}");
          } catch {
            history.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ erro: "JSON inválido nos argumentos" }) });
            continue;
          }
          const info = { id: call.id, name: call.function.name, label: findTool(call.function.name)?.label ?? call.function.name, input };
          cb.onToolStart(info);
          const outcome = await executeTool(call.function.name, input, ctx, cb.confirm);
          cb.onToolEnd(info, { ok: outcome.ok, summary: outcomeSummary(outcome) });
          history.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(outcome.ok ? outcome.result : { erro: outcome.error }),
          });
        }
      }
      cb.onText("\n\n(Parei aqui para não ficar em loop. Pode reformular o pedido?)");
    },
  };
}
