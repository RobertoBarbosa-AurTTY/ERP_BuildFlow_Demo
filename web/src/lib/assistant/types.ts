// Tipos neutros de provedor para o assistente do BuildFlow.

export type ProviderId = "anthropic" | "openai" | "local";

export interface AssistantConfig {
  provider: ProviderId;
  anthropicApiKey: string;
  anthropicModel: string;
  openaiApiKey: string;
  openaiModel: string;
}

/** Arquivo anexado pelo usuário (ex.: XML de NF-e), referenciado pelas ferramentas por id. */
export interface Attachment {
  id: string;
  name: string;
  content: string;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  label: string;
  input: unknown;
}

export interface ConfirmRequest {
  tool: string;
  title: string;
  details: string[];
}

/** Callbacks que a UI recebe durante uma resposta. */
export interface TurnCallbacks {
  onText: (delta: string) => void;
  onToolStart: (call: ToolCallInfo) => void;
  onToolEnd: (call: ToolCallInfo, result: { ok: boolean; summary: string }) => void;
  /** Ações que alteram dados pedem confirmação do usuário antes de rodar. */
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  signal: AbortSignal;
}

export interface AssistantSession {
  send(text: string, callbacks: TurnCallbacks): Promise<void>;
}

export interface ToolContext {
  userName: string;
  userRole: string;
  attachments: Map<string, Attachment>;
}
