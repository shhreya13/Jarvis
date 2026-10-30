/** Shared gateway API types. Timestamps are epoch milliseconds. */

export type Risk = "read" | "write" | "outbound" | "exec";

export type AuditStatus = "pending" | "ok" | "error" | "denied" | "queued";

export type ApprovalStatus = "pending" | "approved" | "denied" | "executed";

export interface SessionRow {
  id: string;
  channel: string;
  title: string | null;
  created_at: number;
  updated_at: number;
  message_count: number;
}

export type MessageContentPart =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolName: string; input: unknown }
  | { type: "tool-result"; toolName: string; output: { value: unknown } };

export interface ModelMessage {
  role: "user" | "assistant" | "tool" | "system";
  content: string | MessageContentPart[];
}

export interface ApprovalRow {
  id: string;
  action_json: string;
  status: ApprovalStatus;
  created_at: number;
  decided_at: number | null;
}

export interface ApprovalAction {
  tool: string;
  args: unknown;
  source: string;
  risk: Risk;
}

export function parseAction(row: ApprovalRow): ApprovalAction {
  try {
    return JSON.parse(row.action_json) as ApprovalAction;
  } catch {
    return { tool: "unknown", args: {}, source: "unknown", risk: "read" };
  }
}

export interface MemoryRow {
  id: number;
  text: string;
  created_at: number;
}

export interface AuditRow {
  id: number;
  ts: number;
  source: string;
  tool: string;
  args_json: string;
  risk: Risk;
  status: AuditStatus;
  result_summary: string | null;
}

export interface JobRow {
  id: string;
  cron: string;
  prompt: string;
  channel: string;
  enabled: boolean;
}

export interface SkillRow {
  id: string;
  path: string;
  enabled: boolean;
  permissions: string[];
}

export interface GatewayConfig {
  assistantName: string;
  userName: string;
  provider: {
    type: "anthropic" | "openai" | "openai-compatible";
    model: string;
    apiKeyEnv: string;
    baseURL?: string;
  };
  gateway: { host: string; port: number };
  telegram: { enabled: boolean; botTokenEnv: string; chatId: string };
  brave: { apiKeyEnv: string };
  google: { clientId: string; clientSecretEnv: string };
  webhookWhitelist: string[];
  approvalTimeoutMs: number;
}

/** Events arriving on the websocket (chat-local events + global broadcasts). */
export type GatewayWsEvent =
  | { type: "session"; sessionId: string }
  | { type: "text-delta"; text: string }
  | { type: "tool-start"; tool: string; args: unknown; risk: Risk }
  | { type: "tool-end"; tool: string; status: string; result: string }
  | {
      type: "approval-pending";
      approval: ApprovalRow;
      /** Present only on the chat socket that triggered the approval. */
      tool?: string;
      args?: unknown;
    }
  | { type: "approval-decided"; approval: ApprovalRow }
  | { type: "turn-complete"; sessionId: string; reply: string }
  | { type: "job-ran"; id: string; ok: boolean }
  | { type: "done"; reply: string }
  | { type: "error"; error: string };
