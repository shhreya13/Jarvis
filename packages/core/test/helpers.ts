import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { openDb, type Db } from "../src/db.js";
import { defaultConfig, type Config } from "../src/config.js";
import type { ModelStreamFn, StreamEvent, ModelTurnRequest } from "../src/stream.js";
import type { ToolDefinition } from "../src/toolTypes.js";

export function makeTempHome(): { home: string; workspace: string; restore: () => void } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-home-"));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-ws-"));
  const prevHome = process.env.JARVIS_HOME;
  const prevWs = process.env.JARVIS_WORKSPACE;
  process.env.JARVIS_HOME = home;
  process.env.JARVIS_WORKSPACE = workspace;
  return {
    home,
    workspace,
    restore: () => {
      if (prevHome === undefined) delete process.env.JARVIS_HOME;
      else process.env.JARVIS_HOME = prevHome;
      if (prevWs === undefined) delete process.env.JARVIS_WORKSPACE;
      else process.env.JARVIS_WORKSPACE = prevWs;
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(workspace, { recursive: true, force: true });
    },
  };
}

export function makeDb(): Db {
  return openDb(":memory:");
}

export function makeConfig(overrides: Partial<Config> = {}): Config {
  return { ...defaultConfig(), ...overrides };
}

/**
 * Scripted model: each call to the stream fn plays the next response in the
 * script. Also records every request it received for assertions.
 */
export function scriptedStream(script: StreamEvent[][]): {
  streamFn: ModelStreamFn;
  requests: ModelTurnRequest[];
} {
  const requests: ModelTurnRequest[] = [];
  let call = 0;
  const streamFn: ModelStreamFn = (req) => {
    requests.push(req);
    const events = script[Math.min(call, script.length - 1)] ?? [];
    call += 1;
    return (async function* () {
      for (const event of events) yield event;
    })();
  };
  return { streamFn, requests };
}

export function textEvents(text: string): StreamEvent[] {
  return [
    { type: "text-delta", text },
    { type: "finish", finishReason: "stop" },
  ];
}

export function toolCallEvents(toolName: string, input: unknown, id = "call-1"): StreamEvent[] {
  return [
    { type: "tool-call", call: { toolCallId: id, toolName, input } },
    { type: "finish", finishReason: "tool-calls" },
  ];
}

/** A configurable fake tool whose executions are recorded. */
export function makeFakeTool(opts: {
  name?: string;
  risk?: ToolDefinition["risk"];
  result?: string;
  onExecute?: () => void;
}): ToolDefinition<{ value: string }> & { executions: unknown[] } {
  const executions: unknown[] = [];
  return {
    name: opts.name ?? "fake_tool",
    description: "A fake tool for tests",
    risk: opts.risk ?? "read",
    schema: z.object({ value: z.string() }),
    executions,
    execute: async (args) => {
      executions.push(args);
      opts.onExecute?.();
      return opts.result ?? `executed:${args.value}`;
    },
  };
}
