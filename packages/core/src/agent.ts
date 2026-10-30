import type { ModelMessage } from "ai";
import type { Db } from "./db.js";
import type { Config } from "./config.js";
import { finishAudit, recordAuditStart, truncateSummary, type AuditStatus } from "./audit.js";
import { ApprovalBroker, type ApprovalRow } from "./approvals.js";
import { effectiveRisk, requiresApproval, type AnyTool, type Risk, type ToolContext } from "./toolTypes.js";
import type { ModelStreamFn, ToolCallRequest } from "./stream.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { appendMessage, loadMessages } from "./sessions.js";
import { workspaceDir } from "./paths.js";

export const MAX_ITERATIONS = 20;

export type AgentEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-start"; tool: string; args: unknown; risk: Risk }
  | { type: "tool-end"; tool: string; status: AuditStatus; result: string }
  | { type: "approval-pending"; approval: ApprovalRow; tool: string; args: unknown }
  | { type: "done"; reply: string };

export interface ExecuteToolCallOptions {
  db: Db;
  config: Config;
  tools: AnyTool[];
  broker: ApprovalBroker;
  source: string;
  sessionId?: string;
  toolName: string;
  args: unknown;
  onEvent?: (event: AgentEvent) => void;
  /** Infinity for interactive channels; defaults to config.approvalTimeoutMs. */
  approvalTimeoutMs?: number;
  toolContextExtras?: Partial<ToolContext>;
}

export interface ToolCallOutcome {
  status: AuditStatus;
  result: string;
}

/**
 * The single gate every tool call passes through:
 *   parse args → AUDIT (before anything runs) → validate → approval if
 *   outbound/exec → execute → audit update.
 */
export async function executeToolCall(opts: ExecuteToolCallOptions): Promise<ToolCallOutcome> {
  const { db, config, broker, source, sessionId, toolName, args, onEvent } = opts;
  const tool = opts.tools.find((t) => t.name === toolName);

  if (!tool) {
    const id = recordAuditStart(db, { source, tool: toolName, args, risk: "read" });
    const result = `Unknown tool "${toolName}".`;
    finishAudit(db, id, "error", result);
    return { status: "error", result };
  }

  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    const id = recordAuditStart(db, { source, tool: toolName, args, risk: tool.risk });
    const result = `Invalid arguments for ${toolName}: ${parsed.error.message}`;
    finishAudit(db, id, "error", result);
    return { status: "error", result };
  }

  const risk = effectiveRisk(tool, parsed.data as never);
  const ctx: ToolContext = {
    db,
    config,
    workspaceDir: workspaceDir(),
    source,
    sessionId,
    ...opts.toolContextExtras,
  };

  onEvent?.({ type: "tool-start", tool: tool.name, args: parsed.data, risk });

  // Invariant: the audit row exists BEFORE validation, approval, or execution.
  const auditId = recordAuditStart(db, { source, tool: tool.name, args: parsed.data, risk });

  const rejection = tool.validate?.(parsed.data as never, ctx);
  if (rejection) {
    finishAudit(db, auditId, "error", rejection);
    const outcome: ToolCallOutcome = { status: "error", result: `Refused: ${rejection}` };
    onEvent?.({ type: "tool-end", tool: tool.name, status: outcome.status, result: outcome.result });
    return outcome;
  }

  if (requiresApproval(risk)) {
    const approval = broker.create({ tool: tool.name, args: parsed.data, source, risk, sessionId });
    onEvent?.({ type: "approval-pending", approval, tool: tool.name, args: parsed.data });
    const timeoutMs = opts.approvalTimeoutMs ?? config.approvalTimeoutMs;
    const decision = await broker.waitForDecision(approval.id, timeoutMs);

    if (decision === "denied") {
      finishAudit(db, auditId, "denied", "Denied by user");
      const outcome: ToolCallOutcome = {
        status: "denied",
        result: `The user DENIED ${tool.name}. Do not retry this action; explain what you wanted to do and ask how to proceed.`,
      };
      onEvent?.({ type: "tool-end", tool: tool.name, status: outcome.status, result: outcome.result });
      return outcome;
    }
    if (decision === "pending") {
      finishAudit(db, auditId, "queued", "Awaiting human approval");
      const outcome: ToolCallOutcome = {
        status: "queued",
        result: `${tool.name} is queued and has NOT run — it awaits human approval and will execute only if approved later. Do not assume it happened.`,
      };
      onEvent?.({ type: "tool-end", tool: tool.name, status: outcome.status, result: outcome.result });
      return outcome;
    }
    // approved → falls through to execution; mark executed so it can't replay.
    broker.markExecuted(approval.id);
  }

  try {
    const result = await tool.execute(parsed.data as never, ctx);
    finishAudit(db, auditId, "ok", truncateSummary(result));
    onEvent?.({ type: "tool-end", tool: tool.name, status: "ok", result });
    return { status: "ok", result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    finishAudit(db, auditId, "error", message);
    const outcome: ToolCallOutcome = { status: "error", result: `${tool.name} failed: ${message}` };
    onEvent?.({ type: "tool-end", tool: tool.name, status: outcome.status, result: outcome.result });
    return outcome;
  }
}

/**
 * Executes a previously queued action after a human approves it out-of-band
 * (Telegram button / dashboard / CLI). Bypasses the broker wait — the approval
 * row IS the authorization — but still audits.
 */
export async function executeApprovedAction(
  opts: Omit<ExecuteToolCallOptions, "toolName" | "args" | "approvalTimeoutMs"> & {
    approvalId: string;
  },
): Promise<ToolCallOutcome> {
  const row = opts.broker.get(opts.approvalId);
  if (!row) return { status: "error", result: `Approval ${opts.approvalId} not found` };
  if (row.status !== "approved") {
    return { status: "error", result: `Approval ${opts.approvalId} is ${row.status}, not approved` };
  }
  const action = opts.broker.parseAction(row);
  const tool = opts.tools.find((t) => t.name === action.tool);
  if (!tool) return { status: "error", result: `Unknown tool "${action.tool}"` };

  opts.broker.markExecuted(row.id);
  const auditId = recordAuditStart(opts.db, {
    source: action.source,
    tool: action.tool,
    args: action.args,
    risk: action.risk,
  });
  const ctx: ToolContext = {
    db: opts.db,
    config: opts.config,
    workspaceDir: workspaceDir(),
    source: action.source,
    sessionId: action.sessionId,
    ...opts.toolContextExtras,
  };
  try {
    const result = await tool.execute(action.args as never, ctx);
    finishAudit(opts.db, auditId, "ok", truncateSummary(result));
    return { status: "ok", result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    finishAudit(opts.db, auditId, "error", message);
    return { status: "error", result: message };
  }
}

export interface RunTurnOptions {
  db: Db;
  config: Config;
  tools: AnyTool[];
  streamFn: ModelStreamFn;
  broker: ApprovalBroker;
  source: string;
  sessionId: string;
  userText: string;
  /** Skill instructions merged into the system prompt (Phase 4). */
  skillInstructions?: string[];
  systemOverride?: string;
  onEvent?: (event: AgentEvent) => void;
  approvalTimeoutMs?: number;
  maxIterations?: number;
  toolContextExtras?: Partial<ToolContext>;
}

/**
 * One conversational turn: user message → model ↔ tools loop (max 20 model
 * calls) → final assistant text. All messages are persisted per session.
 */
export async function runAgentTurn(opts: RunTurnOptions): Promise<string> {
  const { db, config, streamFn, broker, source, sessionId, onEvent } = opts;
  const maxIterations = opts.maxIterations ?? MAX_ITERATIONS;
  const system =
    opts.systemOverride ?? buildSystemPrompt(db, config, opts.skillInstructions ?? []);

  appendMessage(db, sessionId, { role: "user", content: opts.userText });
  const messages: ModelMessage[] = loadMessages(db, sessionId);

  const replyParts: string[] = [];
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration += 1;
    let text = "";
    const calls: ToolCallRequest[] = [];
    let streamError: unknown;

    for await (const event of streamFn({ system, messages, tools: opts.tools })) {
      switch (event.type) {
        case "text-delta":
          text += event.text;
          onEvent?.({ type: "text-delta", text: event.text });
          break;
        case "tool-call":
          calls.push(event.call);
          break;
        case "error":
          streamError = event.error;
          break;
        case "finish":
          break;
      }
    }

    if (streamError) {
      const message = streamError instanceof Error ? streamError.message : String(streamError);
      throw new Error(`Model call failed: ${message}`);
    }

    if (text) replyParts.push(text);

    if (calls.length === 0) {
      if (text) appendMessage(db, sessionId, { role: "assistant", content: text });
      break;
    }

    const assistantContent: Extract<ModelMessage, { role: "assistant" }>["content"] = [];
    if (text) assistantContent.push({ type: "text", text });
    for (const call of calls) {
      assistantContent.push({
        type: "tool-call",
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: call.input,
      });
    }
    const assistantMessage: ModelMessage = { role: "assistant", content: assistantContent };
    messages.push(assistantMessage);
    appendMessage(db, sessionId, assistantMessage);

    const toolResults: Extract<ModelMessage, { role: "tool" }>["content"] = [];
    for (const call of calls) {
      const outcome = await executeToolCall({
        db,
        config,
        tools: opts.tools,
        broker,
        source,
        sessionId,
        toolName: call.toolName,
        args: call.input,
        onEvent,
        approvalTimeoutMs: opts.approvalTimeoutMs,
        toolContextExtras: opts.toolContextExtras,
      });
      toolResults.push({
        type: "tool-result",
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: { type: "text", value: outcome.result },
      });
    }
    const toolMessage: ModelMessage = { role: "tool", content: toolResults };
    messages.push(toolMessage);
    appendMessage(db, sessionId, toolMessage);

    if (iteration === maxIterations) {
      const note = `\n[Stopped: reached the ${maxIterations}-iteration limit for one turn.]`;
      replyParts.push(note);
      appendMessage(db, sessionId, { role: "assistant", content: note });
    }
  }

  const reply = replyParts.join("");
  onEvent?.({ type: "done", reply });
  return reply;
}
