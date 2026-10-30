# Phase 1 verification — core + tools + CLI

Run every step from the repo root. All steps must pass before Phase 2.

## 1. Install & build

```bash
pnpm install
pnpm build          # tsc for packages/core, tools, cli
```

Expected: zero errors.

## 2. Unit tests

```bash
pnpm --filter @jarvis/core test
pnpm --filter @jarvis/tools test
```

Expected: all green. The suites cover, per the phase requirements:

| Requirement | Test |
|---|---|
| Agent loop: message → model → tools → loop, streaming | `core/test/agent.test.ts` ("streams a plain text answer…", "executes a read tool call…") |
| Max 20 iterations | `core/test/agent.test.ts` ("stops at the iteration cap…") |
| Audit written BEFORE execution | `core/test/agent.test.ts` ("writes the audit row BEFORE…") |
| Sandbox path rejection (incl. symlink escape) | `core/test/sandbox.test.ts`, `tools/test/files.test.ts` |
| Approval gate: outbound/exec never auto-run; denial → refusal to model; queue + replay-once | `core/test/agent.test.ts` (approval gate suite), `core/test/approvals.test.ts` |
| Keys only from env, never persisted | `core/test/config.test.ts` |
| FTS5 memory | `core/test/memory.test.ts`, `tools/test/memoryTools.test.ts` |
| http_request GET=read / other=outbound | `tools/test/http.test.ts` |
| webhook whitelist enforcement | `tools/test/webhook.test.ts` |

## 3. Typecheck + lint

```bash
pnpm typecheck
pnpm lint
```

## 4. CLI smoke (manual / scripted)

Use an isolated state dir so your real `~/.jarvis` is untouched:

```bash
export JARVIS_HOME=$(mktemp -d) JARVIS_WORKSPACE=$(mktemp -d)
node packages/cli/dist/index.js --help          # lists onboard/chat/audit/token
node packages/cli/dist/index.js token           # prints a 64-char hex token
node packages/cli/dist/index.js token --rotate  # prints a DIFFERENT token
node packages/cli/dist/index.js audit           # "No audit entries."
printf 'Jarvis\nAkhil\n1\n\n\n\nn\n\n' | node packages/cli/dist/index.js onboard
cat "$JARVIS_HOME/config.json"                  # provider anthropic, no API key inside
cat "$JARVIS_HOME/IDENTITY.md"                  # persona file exists
```

## 5. Live chat (requires a real API key — optional here, mandatory before release)

```bash
export ANTHROPIC_API_KEY=...   # or provider of choice via onboard
node packages/cli/dist/index.js chat
# → ask: "write the text 'hello' to hello.txt then read it back"
#   read/write tools auto-run; check `jarvis audit` afterwards
# → ask something requiring shell_exec; expect an inline y/N approval prompt;
#   answer n; the model must acknowledge the denial without retrying.
```

## Result log

Executed 2026-07-24 during the build:

- [x] pnpm build clean (core, tools, cli via tsc)
- [x] core tests green (36: agent loop, iteration cap, audit-before-exec, approval deny/approve/queue/replay-once, sandbox incl. symlink escapes, FTS5 memory, config/token)
- [x] tools tests green (19: files sandbox, http risk mapping + private-IP guard, webhook whitelist, memory tools, registry risk matrix)
- [x] typecheck + lint clean (tsc strict, eslint flat)
- [x] CLI smoke passed: --help, token (64-hex) + rotation, empty audit, piped onboard
      wizard writes config.json (no API key inside), IDENTITY.md, data.db, gateway.token
      (fixed a real bug found here: readline dropped piped lines — see Prompter in onboard.ts)
- [ ] Live chat against a real provider key — deferred to the final checklist (Phase 5)
