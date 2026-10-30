import fs from "node:fs";
import type { Db } from "./db.js";
import type { Config } from "./config.js";
import { identityPath, workspaceDir } from "./paths.js";
import { newestMemories } from "./memory.js";

const MEMORY_RECALL_COUNT = 50;

function defaultIdentity(config: Config): string {
  return `You are ${config.assistantName}, a personal AI agent. Be concise, direct, and useful.`;
}

/**
 * System prompt = IDENTITY.md + 50 newest memories + enabled skill instructions
 * + fixed ground rules about the sandbox and the approval gate.
 */
export function buildSystemPrompt(
  db: Db,
  config: Config,
  skillInstructions: string[] = [],
): string {
  const parts: string[] = [];

  const idPath = identityPath();
  parts.push(fs.existsSync(idPath) ? fs.readFileSync(idPath, "utf8").trim() : defaultIdentity(config));

  const memories = newestMemories(db, MEMORY_RECALL_COUNT);
  if (memories.length > 0) {
    const lines = memories.map((m) => `- ${m.text}`).join("\n");
    parts.push(`# Memories (${memories.length} most recent)\n${lines}`);
  }

  if (skillInstructions.length > 0) {
    parts.push(`# Active skills\n${skillInstructions.join("\n\n---\n\n")}`);
  }

  parts.push(
    [
      "# Ground rules",
      `- File tools operate only inside the workspace at ${workspaceDir()}; paths outside are rejected.`,
      "- Tools that reach outside (outbound) or execute commands (exec) require explicit human approval. If a call comes back denied, do not retry it — explain and ask.",
      "- If a call comes back queued/pending, it has NOT run yet; never claim it happened.",
      "- Use remember(text) for durable facts worth keeping; use search_memory(query) before saying you don't know something personal.",
    ].join("\n"),
  );

  return parts.join("\n\n");
}
