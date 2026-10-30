#!/usr/bin/env node
import { Command } from "commander";
import { runOnboard } from "./onboard.js";
import { runChat } from "./chat.js";
import { runAudit } from "./auditCmd.js";
import { runToken } from "./tokenCmd.js";
import { runGoogleAuth } from "./googleAuthCmd.js";


const program = new Command();

program.name("jarvis").description("Jarvis — self-hosted personal AI agent").version("0.1.0");

program
  .command("onboard")
  .description("Interactive setup wizard: identity, provider, integrations")
  .action(async () => {
    await runOnboard();
  });

program
  .command("chat")
  .description("Chat with Jarvis in the terminal")
  .action(async () => {
    await runChat();
  });

program
  .command("audit")
  .description("Show the tool-call audit log")
  .option("--tool <name>", "filter by tool name")
  .option("--risk <risk>", "filter by risk (read|write|outbound|exec)")
  .option("--status <status>", "filter by status (pending|ok|error|denied|queued)")
  .option("--source <source>", "filter by source channel (cli, telegram, ...)")
  .option("--limit <n>", "maximum entries to show (default 50)")
  .action((opts: { tool?: string; risk?: string; status?: string; source?: string; limit?: string }) => {
    runAudit(opts);
  });

program
  .command("token")
  .description("Print the gateway bearer token")
  .option("--rotate", "generate a fresh token (invalidates the old one)")
  .action((opts: { rotate?: boolean }) => {
    runToken(opts);
  });

program
  .command("google-auth")
  .description("Connect a Google account (tokens are cached locally)")
  .action(async () => {
    await runGoogleAuth();
  });

program
  .command("start")
  .description("Run the Jarvis daemon: gateway + Telegram + scheduler")
  .action(async () => {
    const { startDaemon } = await import("@jarvis/gateway");
    try {
      const daemon = await startDaemon();
      console.log(`Jarvis daemon running at ${daemon.url}`);
      console.log("Press Ctrl+C to stop. See docs/daemon.md for pm2/launchd setup.");
      const shutdown = (): void => {
        void daemon.stop().then(() => process.exit(0));
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const skills = program.command("skills").description("Manage Jarvis skills (local folders in ~/.jarvis/skills)");
skills
  .command("reload")
  .description("Validate and hot-reload skills on the running daemon")
  .action(async () => {
    const { runSkillsReload } = await import("./skillsCmd.js");
    await runSkillsReload();
  });

await program.parseAsync(process.argv);
