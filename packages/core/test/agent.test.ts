import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runAgentTurn, executeToolCall, executeApprovedAction, MAX_ITERATIONS } from "../src/agent.js";
import { ApprovalBroker } from "../src/approvals.js";
import { listAudit } from "../src/audit.js";
import { createSession, loadMessages } from "../src/sessions.js";
import type { Db } from "../src/db.js";
import {
  makeDb,
  makeConfig,
  makeTempHome,
  scriptedStream,
  textEvents,
  toolCallEvents,
  makeFakeTool,
} from "./helpers.js";

let db: Db;
let env: ReturnType<typeof makeTempHome>;

beforeEach(() => {
  env = makeTempHome();
  db = makeDb();
});

afterEach(() => {
  db.close();
  env.restore();
});

describe("runAgentTurn", () => {
  it("streams a plain text answer and persists the conversation", async () => {
    const { streamFn } = scriptedStream([textEvents("Hello Akhil!")]);
    const broker = new ApprovalBroker(db);
    const session = createSession(db, "cli");
    const deltas: string[] = [];

    const reply = await runAgentTurn({
      db,
      config: makeConfig(),
      tools: [],
      streamFn,
      broker,
      source: "cli",
      sessionId: session.id,
      userText: "hi",
      onEvent: (e) => {
        if (e.type === "text-delta") deltas.push(e.text);
      },
    });

    expect(reply).toBe("Hello Akhil!");
    expect(deltas.join("")).toBe("Hello Akhil!");
    const messages = loadMessages(db, session.id);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "user", content: "hi" });
    expect(messages[1]).toMatchObject({ role: "assistant", content: "Hello Akhil!" });
  });

  it("executes a read tool call, feeds the result back, and loops to a final answer", async () => {
    const tool = makeFakeTool({ name: "lookup", result: "42 degrees" });
    const { streamFn, requests } = scriptedStream([
      toolCallEvents("lookup", { value: "weather" }),
      textEvents("It is 42 degrees."),
    ]);
    const broker = new ApprovalBroker(db);
    const session = createSession(db, "cli");

    const reply = await runAgentTurn({
      db,
      config: makeConfig(),
      tools: [tool],
      streamFn,
      broker,
      source: "cli",
      sessionId: session.id,
      userText: "weather?",
    });

    expect(reply).toBe("It is 42 degrees.");
    expect(tool.executions).toEqual([{ value: "weather" }]);
    // Second model call must include the tool result message.
    expect(requests).toHaveLength(2);
    const secondCallMessages = requests[1]!.messages;
    const toolMessage = secondCallMessages.find((m) => m.role === "tool");
    expect(JSON.stringify(toolMessage)).toContain("42 degrees");
    // Audit: exactly one row, ok, written for the tool.
    const audit = listAudit(db);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ tool: "lookup", risk: "read", status: "ok" });
  });

  it("writes the audit row BEFORE the tool executes", async () => {
    let auditRowsAtExecutionTime = -1;
    const tool = makeFakeTool({
      name: "probe",
      onExecute: () => {
        auditRowsAtExecutionTime = listAudit(db).length;
      },
    });
    const { streamFn } = scriptedStream([
      toolCallEvents("probe", { value: "x" }),
      textEvents("done"),
    ]);
    const session = createSession(db, "cli");

    await runAgentTurn({
      db,
      config: makeConfig(),
      tools: [tool],
      streamFn,
      broker: new ApprovalBroker(db),
      source: "cli",
      sessionId: session.id,
      userText: "go",
    });

    expect(auditRowsAtExecutionTime).toBe(1);
  });

  it("stops at the iteration cap when the model keeps calling tools", async () => {
    const tool = makeFakeTool({ name: "spin" });
    const { streamFn, requests } = scriptedStream([toolCallEvents("spin", { value: "again" })]);
    const session = createSession(db, "cli");

    const reply = await runAgentTurn({
      db,
      config: makeConfig(),
      tools: [tool],
      streamFn,
      broker: new ApprovalBroker(db),
      source: "cli",
      sessionId: session.id,
      userText: "loop forever",
    });

    expect(requests).toHaveLength(MAX_ITERATIONS);
    expect(tool.executions).toHaveLength(MAX_ITERATIONS);
    expect(reply).toContain("20-iteration limit");
  });

  it("returns an error result to the model for unknown tools without crashing", async () => {
    const { streamFn, requests } = scriptedStream([
      toolCallEvents("does_not_exist", { value: "x" }),
      textEvents("ok"),
    ]);
    const session = createSession(db, "cli");

    const reply = await runAgentTurn({
      db,
      config: makeConfig(),
      tools: [],
      streamFn,
      broker: new ApprovalBroker(db),
      source: "cli",
      sessionId: session.id,
      userText: "go",
    });

    expect(reply).toBe("ok");
    expect(JSON.stringify(requests[1]!.messages)).toContain('Unknown tool');
    expect(listAudit(db)[0]).toMatchObject({ status: "error" });
  });
});

describe("approval gate", () => {
  it("never auto-runs an exec tool: denial blocks execution and informs the model", async () => {
    const tool = makeFakeTool({ name: "shell_exec", risk: "exec" });
    const broker = new ApprovalBroker(db);
    broker.on("pending", (row: { id: string }) => broker.decide(row.id, false));
    const { streamFn, requests } = scriptedStream([
      toolCallEvents("shell_exec", { value: "rm -rf /" }),
      textEvents("Understood, I won't."),
    ]);
    const session = createSession(db, "cli");

    const reply = await runAgentTurn({
      db,
      config: makeConfig(),
      tools: [tool],
      streamFn,
      broker,
      source: "cli",
      sessionId: session.id,
      userText: "wipe it",
      approvalTimeoutMs: Infinity,
    });

    expect(tool.executions).toHaveLength(0);
    expect(reply).toBe("Understood, I won't.");
    expect(JSON.stringify(requests[1]!.messages)).toContain("DENIED");
    expect(listAudit(db)[0]).toMatchObject({ tool: "shell_exec", risk: "exec", status: "denied" });
    expect(broker.list()[0]).toMatchObject({ status: "denied" });
  });

  it("runs an outbound tool only after approval", async () => {
    const tool = makeFakeTool({ name: "webhook_post", risk: "outbound", result: "sent" });
    const broker = new ApprovalBroker(db);
    broker.on("pending", (row: { id: string }) => broker.decide(row.id, true));
    const { streamFn } = scriptedStream([
      toolCallEvents("webhook_post", { value: "ping" }),
      textEvents("Sent."),
    ]);
    const session = createSession(db, "cli");

    const reply = await runAgentTurn({
      db,
      config: makeConfig(),
      tools: [tool],
      streamFn,
      broker,
      source: "cli",
      sessionId: session.id,
      userText: "notify",
      approvalTimeoutMs: Infinity,
    });

    expect(tool.executions).toEqual([{ value: "ping" }]);
    expect(reply).toBe("Sent.");
    expect(listAudit(db)[0]).toMatchObject({ status: "ok" });
    // approved → executed so it can never replay
    expect(broker.list()[0]).toMatchObject({ status: "executed" });
  });

  it("queues when nobody decides in time, then executes via executeApprovedAction", async () => {
    const tool = makeFakeTool({ name: "gmail_create_draft", risk: "outbound", result: "draft created" });
    const broker = new ApprovalBroker(db);
    const config = makeConfig();
    const session = createSession(db, "job:test");

    const outcome = await executeToolCall({
      db,
      config,
      tools: [tool],
      broker,
      source: "job:test",
      sessionId: session.id,
      toolName: "gmail_create_draft",
      args: { value: "reminder" },
      approvalTimeoutMs: 25,
    });

    expect(outcome.status).toBe("queued");
    expect(tool.executions).toHaveLength(0);
    expect(listAudit(db)[0]).toMatchObject({ status: "queued" });

    // Human approves later (e.g. Telegram button) → replay executes exactly once.
    const pending = broker.listPending();
    expect(pending).toHaveLength(1);
    broker.decide(pending[0]!.id, true);
    const replay = await executeApprovedAction({
      db,
      config,
      tools: [tool],
      broker,
      source: "gateway",
      approvalId: pending[0]!.id,
    });
    expect(replay).toMatchObject({ status: "ok", result: "draft created" });
    expect(tool.executions).toHaveLength(1);

    // Second replay must refuse — the approval is consumed.
    const second = await executeApprovedAction({
      db,
      config,
      tools: [tool],
      broker,
      source: "gateway",
      approvalId: pending[0]!.id,
    });
    expect(second.status).toBe("error");
    expect(tool.executions).toHaveLength(1);
  });

  it("read/write tools auto-run without any approval row", async () => {
    const tool = makeFakeTool({ name: "write_file", risk: "write" });
    const broker = new ApprovalBroker(db);
    const session = createSession(db, "cli");

    const outcome = await executeToolCall({
      db,
      config: makeConfig(),
      tools: [tool],
      broker,
      source: "cli",
      sessionId: session.id,
      toolName: "write_file",
      args: { value: "notes" },
    });

    expect(outcome.status).toBe("ok");
    expect(broker.list()).toHaveLength(0);
  });

  it("rejects invalid args before anything runs", async () => {
    const tool = makeFakeTool({ name: "typed", risk: "exec" });
    const broker = new ApprovalBroker(db);

    const outcome = await executeToolCall({
      db,
      config: makeConfig(),
      tools: [tool],
      broker,
      source: "cli",
      toolName: "typed",
      args: { wrong: 1 },
    });

    expect(outcome.status).toBe("error");
    expect(tool.executions).toHaveLength(0);
    expect(broker.list()).toHaveLength(0);
    expect(listAudit(db)[0]).toMatchObject({ status: "error" });
  });
});
