import type { GatewayWsEvent, Risk } from "./types";

/** Pure state machine for the chat transcript. All updates are immutable. */

export type ToolPartStatus = "running" | "ok" | "error" | "denied";

export type ChatPart =
  | { kind: "text"; text: string }
  | { kind: "tool"; tool: string; risk?: Risk; status: ToolPartStatus }
  | {
      kind: "approval";
      approvalId: string;
      tool: string;
      args: unknown;
      decided?: "approved" | "denied";
    };

export interface AssistantTurn {
  role: "assistant";
  parts: ChatPart[];
}

export type ChatTurn =
  | { role: "user"; text: string }
  | AssistantTurn
  | { role: "notice"; text: string };

export interface ChatState {
  turns: ChatTurn[];
  sessionId: string | null;
  busy: boolean;
}

export const initialChatState: ChatState = { turns: [], sessionId: null, busy: false };

export type ChatAction =
  | { type: "send"; text: string }
  | { type: "event"; event: GatewayWsEvent }
  | { type: "decided"; approvalId: string; approved: boolean }
  | { type: "disconnected" }
  | { type: "reset" };

function withLastAssistant(
  turns: ChatTurn[],
  update: (turn: AssistantTurn) => AssistantTurn,
): ChatTurn[] {
  const idx = turns.findLastIndex((turn) => turn.role === "assistant");
  if (idx < 0) return [...turns, update({ role: "assistant", parts: [] })];
  return turns.map((turn, i) => (i === idx ? update(turn as AssistantTurn) : turn));
}

function appendText(turn: AssistantTurn, text: string): AssistantTurn {
  const last = turn.parts[turn.parts.length - 1];
  if (last?.kind === "text") {
    const parts = [...turn.parts.slice(0, -1), { ...last, text: last.text + text }];
    return { ...turn, parts };
  }
  return { ...turn, parts: [...turn.parts, { kind: "text", text }] };
}

function settleTool(turn: AssistantTurn, tool: string, status: string): AssistantTurn {
  const idx = turn.parts.findLastIndex(
    (part) => part.kind === "tool" && part.tool === tool && part.status === "running",
  );
  if (idx < 0) return turn;
  const settled: ToolPartStatus =
    status === "ok" || status === "error" || status === "denied" ? status : "ok";
  const parts = turn.parts.map((part, i) =>
    i === idx && part.kind === "tool" ? { ...part, status: settled } : part,
  );
  return { ...turn, parts };
}

function settleApproval(turns: ChatTurn[], approvalId: string, approved: boolean): ChatTurn[] {
  return turns.map((turn) => {
    if (turn.role !== "assistant") return turn;
    if (!turn.parts.some((p) => p.kind === "approval" && p.approvalId === approvalId)) {
      return turn;
    }
    return {
      ...turn,
      parts: turn.parts.map((part) =>
        part.kind === "approval" && part.approvalId === approvalId
          ? { ...part, decided: approved ? ("approved" as const) : ("denied" as const) }
          : part,
      ),
    };
  });
}

function applyEvent(state: ChatState, event: GatewayWsEvent): ChatState {
  switch (event.type) {
    case "session":
      return { ...state, sessionId: event.sessionId };
    case "text-delta":
      return { ...state, turns: withLastAssistant(state.turns, (t) => appendText(t, event.text)) };
    case "tool-start":
      return {
        ...state,
        turns: withLastAssistant(state.turns, (turn) => ({
          ...turn,
          parts: [
            ...turn.parts,
            { kind: "tool", tool: event.tool, risk: event.risk, status: "running" },
          ],
        })),
      };
    case "tool-end":
      return {
        ...state,
        turns: withLastAssistant(state.turns, (t) => settleTool(t, event.tool, event.status)),
      };
    case "approval-pending":
      // Only the chat-local variant carries `tool`; the global broadcast
      // duplicate (no tool field) is ignored here.
      if (event.tool === undefined) return state;
      return {
        ...state,
        turns: withLastAssistant(state.turns, (turn) => ({
          ...turn,
          parts: [
            ...turn.parts,
            {
              kind: "approval",
              approvalId: event.approval.id,
              tool: event.tool as string,
              args: event.args,
            },
          ],
        })),
      };
    case "approval-decided":
      return {
        ...state,
        turns: settleApproval(
          state.turns,
          event.approval.id,
          event.approval.status !== "denied",
        ),
      };
    case "turn-complete":
      return { ...state, busy: false, sessionId: event.sessionId };
    case "error":
      return {
        ...state,
        busy: false,
        turns: [...state.turns, { role: "notice", text: `Gateway error: ${event.error}` }],
      };
    default:
      return state;
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "send":
      return {
        ...state,
        busy: true,
        turns: [
          ...state.turns,
          { role: "user", text: action.text },
          { role: "assistant", parts: [] },
        ],
      };
    case "event":
      return applyEvent(state, action.event);
    case "decided":
      return { ...state, turns: settleApproval(state.turns, action.approvalId, action.approved) };
    case "disconnected":
      if (!state.busy) return state;
      return {
        ...state,
        busy: false,
        turns: [...state.turns, { role: "notice", text: "Connection to the gateway dropped." }],
      };
    case "reset":
      return { ...initialChatState };
    default:
      return state;
  }
}
