import { createInterface } from "node:readline/promises";
import {
  ApprovalBroker,
  aiSdkStream,
  buildModel,
  createSession,
  ensureDirs,
  loadConfig,
  openDb,
  runAgentTurn,
  type AgentEvent,
  type ApprovalRow,
} from "@jarvis/core";
import { buildBuiltinTools } from "@jarvis/tools";

const ARGS_PREVIEW_MAX = 200;
const PROMPT = "you › ";

function formatArgs(args: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(args) ?? String(args);
  } catch {
    json = String(args);
  }
  return json.length > ARGS_PREVIEW_MAX ? `${json.slice(0, ARGS_PREVIEW_MAX - 1)}…` : json;
}

function printHelp(): void {
  console.log("Commands:");
  console.log("  /new    start a fresh session");
  console.log("  /exit   leave the chat");
  console.log("  /help   show this help");
}

export async function runChat(): Promise<void> {
  const config = loadConfig();
  ensureDirs();
  const db = openDb();

  const model = ((): ReturnType<typeof buildModel> => {
    try {
      return buildModel(config);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      return process.exit(1);
    }
  })();

  const streamFn = aiSdkStream(model);
  const tools = buildBuiltinTools();
  const broker = new ApprovalBroker(db);
  let session = createSession(db, "cli");

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  let atLineStart = true;
  const write = (text: string): void => {
    process.stdout.write(text);
    atLineStart = text.endsWith("\n");
  };
  const ensureLineStart = (): void => {
    if (!atLineStart) write("\n");
  };

  // Inline approvals: serialize prompts through a chain so two simultaneous
  // approval requests never interleave on the same readline interface.
  const handleApproval = async (row: ApprovalRow): Promise<void> => {
    const action = broker.parseAction(row);
    ensureLineStart();
    write(`\nApproval required — risk: ${action.risk}\n`);
    write(`  ${action.tool} ${formatArgs(action.args)}\n`);
    const answer = await rl.question(`Approve ${action.tool}? [y/N] `);
    broker.decide(row.id, answer.trim().toLowerCase().startsWith("y"));
    atLineStart = true;
  };
  let approvalChain: Promise<void> = Promise.resolve();
  broker.on("pending", (row: ApprovalRow) => {
    approvalChain = approvalChain
      .then(() => handleApproval(row))
      .catch((err: unknown) => {
        console.error(`Approval prompt failed: ${err instanceof Error ? err.message : String(err)}`);
        broker.decide(row.id, false);
      });
  });

  const onEvent = (event: AgentEvent): void => {
    switch (event.type) {
      case "text-delta":
        write(event.text);
        break;
      case "tool-start":
        ensureLineStart();
        write(`⚙ ${event.tool}(${formatArgs(event.args)})\n`);
        break;
      case "tool-end": {
        const mark = event.status === "ok" ? "✔" : "✘";
        ensureLineStart();
        write(`${mark} ${event.tool} — ${event.status}\n`);
        break;
      }
      case "approval-pending":
      case "done":
        break;
    }
  };

  // First Ctrl+C returns to the prompt; a second one exits.
  let sigintCount = 0;
  let activeAbort: AbortController | null = null;
  let isClosed = false;
  rl.on("close", () => {
    isClosed = true;
  });
  rl.on("SIGINT", () => {
    sigintCount += 1;
    if (sigintCount >= 2) {
      write("\n");
      rl.close();
      db.close();
      process.exit(0);
    }
    write("\n(press Ctrl+C again to exit)\n");
    activeAbort?.abort();
  });

  console.log(`${config.assistantName} — chat (${config.provider.type} / ${config.provider.model})`);
  console.log("Type /help for commands, /exit to leave.");
  console.log("");

  while (!isClosed) {
    const abort = new AbortController();
    activeAbort = abort;
    let line: string;
    try {
      line = (await rl.question(PROMPT, { signal: abort.signal })).trim();
    } catch {
      if (isClosed) break;
      continue; // aborted by Ctrl+C — re-prompt
    } finally {
      activeAbort = null;
    }
    sigintCount = 0;

    if (line === "") continue;
    if (line === "/exit") break;
    if (line === "/help") {
      printHelp();
      continue;
    }
    if (line === "/new") {
      session = createSession(db, "cli");
      console.log("Started a fresh session.");
      continue;
    }

    try {
      await runAgentTurn({
        db,
        config,
        tools,
        streamFn,
        broker,
        source: "cli",
        sessionId: session.id,
        userText: line,
        approvalTimeoutMs: Infinity,
        onEvent,
      });
      ensureLineStart();
      write("\n");
    } catch (err) {
      ensureLineStart();
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  rl.close();
  db.close();
}
