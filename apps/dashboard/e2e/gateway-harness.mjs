// Real gateway daemon booted against a throwaway JARVIS_HOME with a scripted
// model. Imports the BUILT workspace packages (dist/) — run `pnpm build` in
// packages/core and packages/gateway first.
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

// Env MUST be set before the packages are imported — they resolve paths lazily
// but the db opens at createDeps time.
const home = await mkdtemp(path.join(tmpdir(), "jarvis-e2e-home-"));
const workspace = await mkdtemp(path.join(tmpdir(), "jarvis-e2e-workspace-"));
process.env.JARVIS_HOME = home;
process.env.JARVIS_WORKSPACE = workspace;

await mkdir(home, { recursive: true });
// requireToken() keeps an existing token file, so writing it first makes the
// bearer token deterministic for the spec.
export const E2E_TOKEN = "e2e-test-token-0123456789abcdef";
await writeFile(path.join(home, "gateway.token"), E2E_TOKEN, { mode: 0o600 });

const core = await import("../../../packages/core/dist/index.js");
const gateway = await import("../../../packages/gateway/dist/index.js");

// Use the exact zod instance the core package validates with.
const require = createRequire(
  new URL("../../../packages/core/package.json", import.meta.url),
);
const { z } = require("zod");

const config = core.defaultConfig();
config.gateway.port = 4821;
config.approvalTimeoutMs = 120_000;

let calls = 0;

/** Scripted model: first call requests the webhook tool, later calls reply. */
async function* streamFn() {
  calls += 1;
  if (calls === 1) {
    yield {
      type: "tool-call",
      call: {
        toolCallId: "c1",
        toolName: "webhook_post",
        input: { url: "https://hooks.example.com/e2e" },
      },
    };
    yield { type: "finish", finishReason: "tool-calls" };
    return;
  }
  for (const text of ["Done — ", "webhook sent."]) {
    yield { type: "text-delta", text };
  }
  yield { type: "finish", finishReason: "stop" };
}

const tools = [
  {
    name: "webhook_post",
    description: "e2e",
    risk: "outbound",
    schema: z.object({ url: z.string() }),
    execute: async () => "posted",
  },
];

const daemon = await gateway.startDaemon({ deps: { config, streamFn, tools } });
process.stdout.write(`[harness] gateway up at ${daemon.url} (home=${home})\n`);

const shutdown = () => {
  daemon
    .stop()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Keep the event loop alive for the duration of the test run.
setInterval(() => {}, 60_000);
