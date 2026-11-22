"use client";

import { useSyncExternalStore } from "react";
import type { AssistantConfig, ProviderId } from "./types";

// As chaves de API ficam só no localStorage deste navegador e são enviadas
// direto ao provedor escolhido (Anthropic ou OpenAI). Não há servidor no meio.

const KEY = "buildflow:assistant-config";

export const DEFAULT_CONFIG: AssistantConfig = {
  provider: "local",
  anthropicApiKey: "",
  anthropicModel: "claude-opus-5-5",
  openaiApiKey: "",
  openaiModel: "gpt-5",
};

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: "Claude (Anthropic)",
  openai: "OpenAI",
  local: "Assistente local",
};

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: AssistantConfig = DEFAULT_CONFIG;

function read(): AssistantConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cached;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = raw ? { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<AssistantConfig>) } : DEFAULT_CONFIG;
    } catch {
      cached = DEFAULT_CONFIG;
    }
  }
  return cached;
}

export function saveAssistantConfig(config: AssistantConfig) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // navegação privada: segue só nesta aba
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useAssistantConfig() {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_CONFIG);
}

/** Provedor efetivo: sem chave configurada, cai no assistente local. */
export function effectiveProvider(config: AssistantConfig): ProviderId {
  if (config.provider === "anthropic" && !config.anthropicApiKey.trim()) return "local";
  if (config.provider === "openai" && !config.openaiApiKey.trim()) return "local";
  return config.provider;
}
