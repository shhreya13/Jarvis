import fs from "node:fs";
import { createInterface, type Interface } from "node:readline/promises";
import {
  configPath,
  dbPath,
  defaultConfig,
  ensureDirs,
  identityPath,
  openDb,
  requireToken,
  saveConfig,
  workspaceDir,
  type Config,
} from "@jarvis/core";

type ProviderType = Config["provider"]["type"];

interface ProviderAnswers {
  type: ProviderType;
  model: string;
  apiKeyEnv: string;
  baseURL?: string;
}

const PROVIDER_DEFAULTS: Record<ProviderType, { model: string; apiKeyEnv: string }> = {
  anthropic: { model: "claude-sonnet-5", apiKeyEnv: "ANTHROPIC_API_KEY" },
  openai: { model: "gpt-5", apiKeyEnv: "OPENAI_API_KEY" },
  "openai-compatible": { model: "llama3.1", apiKeyEnv: "OPENAI_COMPAT_API_KEY" },
};

const OLLAMA_BASE_URL = "http://localhost:11434/v1";
const TOKEN_PREVIEW_LENGTH = 8;

/**
 * Line reader that works for both interactive TTYs and piped stdin. Plain
 * rl.question drops lines that arrive while no question is pending (piped
 * input delivers everything at once) and hangs forever on EOF; this queues
 * lines and resolves EOF as "" so defaults apply.
 */
class Prompter {
  private readonly rl: Interface;
  private readonly queue: string[] = [];
  private readonly waiters: ((line: string) => void)[] = [];
  private closed = false;

  constructor() {
    this.rl = createInterface({ input: process.stdin, output: process.stdout });
    this.rl.on("line", (line) => {
      const waiter = this.waiters.shift();
      if (waiter) waiter(line);
      else this.queue.push(line);
    });
    this.rl.on("close", () => {
      this.closed = true;
      for (const waiter of this.waiters.splice(0)) waiter("");
    });
  }

  async ask(question: string, fallback = ""): Promise<string> {
    const suffix = fallback ? ` [${fallback}]` : "";
    process.stdout.write(`${question}${suffix}: `);
    const line = await this.next();
    const answer = line.trim();
    if (!process.stdin.isTTY) process.stdout.write(`${answer}\n`);
    return answer.length > 0 ? answer : fallback;
  }

  private next(): Promise<string> {
    const queued = this.queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    if (this.closed) return Promise.resolve("");
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  close(): void {
    this.rl.close();
  }
}

async function ask(rl: Prompter, question: string, fallback = ""): Promise<string> {
  return rl.ask(question, fallback);
}

function warnIfEnvMissing(envVar: string, keyOptional = false): void {
  if (process.env[envVar]) return;
  console.log(`  WARNING: ${envVar} is not set. Add this line to your shell profile:`);
  console.log(`    export ${envVar}="..."`);
  if (keyOptional) {
    console.log("  (Local openai-compatible servers such as Ollama usually need no key — safe to skip.)");
  }
}

async function askProvider(rl: Prompter): Promise<ProviderAnswers> {
  const choice = await ask(rl, "Provider — 1) anthropic  2) openai  3) openai-compatible", "1");
  const type: ProviderType =
    choice === "2" || choice === "openai"
      ? "openai"
      : choice === "3" || choice === "openai-compatible"
        ? "openai-compatible"
        : "anthropic";

  const defaults = PROVIDER_DEFAULTS[type];
  const model = await ask(rl, "Model id", defaults.model);
  const apiKeyEnv = await ask(rl, "API key env var name", defaults.apiKeyEnv);
  warnIfEnvMissing(apiKeyEnv, type === "openai-compatible");

  if (type !== "openai-compatible") return { type, model, apiKeyEnv };

  let baseURL = "";
  while (baseURL === "") {
    const candidate = await ask(rl, "Base URL (Ollama users: use the default)", OLLAMA_BASE_URL);
    try {
      new URL(candidate);
      baseURL = candidate;
    } catch {
      console.log(`  "${candidate}" is not a valid URL — try again.`);
    }
  }
  return { type, model, apiKeyEnv, baseURL };
}

async function askTelegram(rl: Prompter, base: Config["telegram"]): Promise<Config["telegram"]> {
  const enable = (await ask(rl, "Enable Telegram? (y/N)", "n")).toLowerCase().startsWith("y");
  if (!enable) return { ...base, enabled: false };

  const botTokenEnv = await ask(rl, "Bot token env var name", base.botTokenEnv);
  warnIfEnvMissing(botTokenEnv);
  console.log("  Tip: message @userinfobot on Telegram to get your chat id (you can fill it in later).");
  const chatId = await ask(rl, "Chat id (blank to fill in later)");
  return { enabled: true, botTokenEnv, chatId };
}

function identityMarkdown(assistantName: string, userName: string): string {
  const user = userName || "the user";
  return `# ${assistantName} — Identity

You are ${assistantName}, the personal AI agent of ${user}.

- Be concise and direct; skip filler and pleasantries.
- Ask before doing anything risky, irreversible, or outbound (messages, emails, purchases).
- Never invent facts about ${user} — say so plainly when you do not know something.
- Use remember() to store durable facts worth keeping across sessions.
- Be timezone-aware when discussing times, dates, and scheduling.
- Refer to the user as ${user}.
- Prefer completing the task over describing how you would do it.
- Admit mistakes plainly and correct course immediately.
`;
}

function writeIdentity(assistantName: string, userName: string): void {
  const file = identityPath();
  if (fs.existsSync(file)) {
    console.log(`IDENTITY.md already exists — keeping the existing one (${file}).`);
    return;
  }
  fs.writeFileSync(file, identityMarkdown(assistantName, userName));
  console.log(`Wrote ${file}`);
}

function printSummary(token: string): void {
  const lines = [
    "Jarvis is ready",
    "",
    `Config:     ${configPath()}`,
    `Database:   ${dbPath()}`,
    `Workspace:  ${workspaceDir()}`,
    `Token:      ${token.slice(0, TOKEN_PREVIEW_LENGTH)}…`,
    "",
    "Next steps:",
    "  jarvis chat     talk to Jarvis in the terminal",
    "  jarvis token    print the full gateway token",
    "  jarvis start    run the gateway (later phase)",
  ];
  const width = Math.max(...lines.map((line) => line.length)) + 2;
  console.log("");
  console.log(`┌${"─".repeat(width)}┐`);
  for (const line of lines) console.log(`│ ${line.padEnd(width - 2)} │`);
  console.log(`└${"─".repeat(width)}┘`);
}

export async function runOnboard(): Promise<void> {
  const rl = new Prompter();
  try {
    console.log("");
    console.log("Jarvis onboarding");
    console.log("─".repeat(40));

    const base = defaultConfig();
    const assistantName = await ask(rl, "Assistant name", base.assistantName);
    const userName = await ask(rl, "Your name");
    const provider = await askProvider(rl);
    const telegram = await askTelegram(rl, base.telegram);
    const braveApiKeyEnv = await ask(rl, "Brave Search API key env var", base.brave.apiKeyEnv);
    warnIfEnvMissing(braveApiKeyEnv);

    const config: Config = {
      ...base,
      assistantName,
      userName,
      provider: { ...base.provider, ...provider },
      telegram,
      brave: { apiKeyEnv: braveApiKeyEnv },
    };
    saveConfig(config);
    console.log(`Saved ${configPath()}`);

    writeIdentity(assistantName, userName);

    ensureDirs();
    const db = openDb();
    db.close();
    const token = requireToken();

    printSummary(token);
  } finally {
    rl.close();
  }
}
