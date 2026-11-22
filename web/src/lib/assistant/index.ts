import { effectiveProvider } from "./config";
import { createAnthropicSession, friendlyAnthropicError } from "./providers/anthropic";
import { createLocalSession } from "./providers/local";
import { createOpenAISession, friendlyOpenAIError } from "./providers/openai";
import type { AssistantConfig, AssistantSession, ProviderId, ToolContext } from "./types";

export function createAssistantSession(config: AssistantConfig, ctx: ToolContext): { provider: ProviderId; session: AssistantSession } {
  const provider = effectiveProvider(config);
  switch (provider) {
    case "anthropic":
      return { provider, session: createAnthropicSession(config.anthropicApiKey.trim(), config.anthropicModel.trim(), ctx) };
    case "openai":
      return { provider, session: createOpenAISession(config.openaiApiKey.trim(), config.openaiModel.trim(), ctx) };
    default:
      return { provider, session: createLocalSession(ctx) };
  }
}

export function friendlyError(provider: ProviderId, error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return "Resposta interrompida.";
  if (provider === "anthropic") return friendlyAnthropicError(error);
  if (provider === "openai") return friendlyOpenAIError(error);
  return error instanceof Error ? error.message : "Erro inesperado";
}

export type { AssistantConfig, ProviderId } from "./types";
