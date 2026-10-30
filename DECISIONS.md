# DECISIONS

Every decision that was not explicitly specified in the build brief, with rationale.
Format: **D-N — decision** · rationale.

## Naming & layout

- **D-1 — The project is named "Jarvis".** The brief used the placeholder `NAME`; the
  working directory was `~/Work/Jarvis`, so all placeholders resolve to: CLI binary
  `jarvis`, config dir `~/.jarvis/`, workspace `~/jarvis-workspace/`, env prefix
  `JARVIS_`. Trivial to rename later (single constant in `packages/core/src/paths.ts`).
- **D-2 — `JARVIS_HOME` and `JARVIS_WORKSPACE` env overrides.** `~/.jarvis` and
  `~/jarvis-workspace` are defaults; tests and Docker need relocatable state, so both
  are overridable via env vars.
- **D-3 — Package scope `@jarvis/*`** for internal workspace packages
  (`@jarvis/core`, `@jarvis/tools`, `@jarvis/gateway`, `@jarvis/cli`, `@jarvis/skills`).

## Toolchain

- **D-4 — ESM throughout, compiled with `tsc` to `dist/`.** `"type": "module"`,
  NodeNext resolution. Vitest tests alias `@jarvis/*` to package `src/` so tests run
  without a prior build.
- **D-5 — pnpm 11 installed via npm global** (corepack shim couldn't symlink into
  `/usr/local/bin` without sudo). `onlyBuiltDependencies` allowlists native
  postinstall builds (better-sqlite3, esbuild, sharp, tailwind oxide).
- **D-6 — ESLint 9 flat config + typescript-eslint, kept minimal** (recommended rules,
  no style bikeshedding — formatting is left to editors). CI runs typecheck, lint, test.

## Architecture

- **D-7 — Custom agent loop over `streamText` single-step calls,** instead of the AI
  SDK's built-in multi-step (`stopWhen`) loop. Rationale: the approval gate must be able
  to (a) audit BEFORE execution, (b) block on human approval for unbounded time, and
  (c) return a refusal to the model on denial — owning the loop keeps that logic
  testable with a scripted fake stream, with a thin adapter wrapping the AI SDK.
- **D-8 — Gateway bearer token stored at `~/.jarvis/gateway.token` (mode 0600),**
  not in config.json, so config.json can be shared/backed up without leaking the token.
- **D-9 — Approval wait strategy:** interactive channels (CLI chat, dashboard ws chat)
  block the tool call until decided. Non-interactive runs (scheduled jobs) wait up to
  `approvalTimeoutMs` (default 60s); on timeout the model receives "queued — pending
  human approval" and the gateway executes the stored `action_json` later when the
  approval is granted (via Telegram button, dashboard, or CLI). This keeps cron jobs
  from hanging forever while still honoring "never auto-run".
- **D-10 — Fastify 5 + @fastify/websocket** for the gateway (mature, typed, small).
- **D-11 — Session model:** one `sessions` row per channel conversation (cli / telegram
  / ws / job); `messages` stores the full model-message JSON so context replays exactly.
- **D-12 — memories is an FTS5 table** (`text`, `created_at` unindexed); rowid is the
  memory id. Simplest schema that satisfies FTS5 search + "50 newest" recall.
- **D-13 — Path sandbox = resolve + realpath prefix check.** Paths are resolved against
  the workspace root; the nearest existing ancestor is `realpath`ed to defeat symlink
  escapes; anything resolving outside the workspace is rejected before audit/execution.
- **D-14 — shell_exec** uses `execFile("/bin/sh", ["-c", cmd])` with `cwd` locked to the
  workspace, 60s timeout, 1MB output cap. It is risk `exec`, so it always goes through
  approval; the sandbox is the approval gate, not an OS jail (documented in SECURITY).
- **D-15 — http_request blocks requests to private/loopback address literals**
  (basic SSRF hygiene) except when the URL targets the local gateway explicitly; GET is
  risk `read`, all other methods `outbound`.
- **D-16 — Google OAuth:** installed-app flow. Client credentials go in config
  (`google.clientId` + `google.clientSecretEnv`), tokens cached at
  `~/.jarvis/google-token.json` (0600). `jarvis google auth` runs a loopback-redirect
  flow. gmail_search/calendar_read are risk `read`; gmail_create_draft is `outbound`
  (creates data in your account visible to nobody else, but it writes to an external
  service, so it gates).
- **D-17 — Brave Search API key env var name is configurable** (`brave.apiKeyEnv`,
  default `BRAVE_API_KEY`), consistent with the "keys only from env" rule.
- **D-18 — Audit rows are written with status `pending` before execution** and updated
  to `ok` / `error` / `denied` / `queued` after. `result_summary` truncated to 500 chars.
- **D-19 — Iteration cap:** 20 model calls per turn (per brief); on hitting the cap the
  turn ends with a note appended to the reply.
- **D-20 — Out-of-band approval replay rule.** The broker tracks live waiters
  (`hasWaiter`). A decider (gateway route, Telegram button) snapshots `hasWaiter(id)`
  BEFORE calling `decide()`: if a loop is still blocked on the approval it resumes and
  executes; only waiter-less (timed-out/queued) approvals are replayed via
  `executeApprovedAction`, which consumes the approval (`status: executed`) so nothing
  can run twice.
- **D-21 — "@brief" job prompt sentinel.** A job whose prompt is exactly `@brief` is
  rendered deterministically by `composeBrief()` (calendar + unread count + pending
  approvals) without a model call — reliable and token-free. Any other prompt runs
  through the agent. The seeded 07:00 job uses `@brief`; the 18:00 follow-up sweep is a
  real agent prompt.
- **D-22 — Session shapes per channel.** CLI: new session per REPL start (`/new` to
  rotate). Telegram: one rolling session for the configured chat. ws/dashboard: client
  passes `sessionId` to continue, else a new session. Jobs: fresh session per run.
- **D-23 — Telegram hard-locked to one chat id.** Updates from any other chat are
  silently dropped; if `chatId` is unset the bot replies once with the sender's id to
  make setup discoverable. Bot token comes from the env var named in config.
- **D-24 — Gateway API envelope** `{ success, data, error? }`; all routes bearer-token
  authed except `/health`; websocket authenticates via `?token=` query param.
- **D-25 — Skill manifest semantics.** `tools` = built-in tools the skill's CODE may
  invoke via `ctx.callTool` (the only bridge back into Jarvis — it runs through
  `executeToolCall`, so audit + approval apply and cannot be bypassed).
  `permissions` = risk ceiling for the skill's own exported tools (loader refuses a
  custom tool whose risk isn't declared). Custom tool names may not shadow built-ins.
- **D-26 — Skill folders need no npm install.** The loader runs tools.ts through jiti
  with `zod` aliased to the runtime's own copy (`createRequire` resolution —
  `import.meta.resolve` is unavailable under vitest's SSR transform).
- **D-27 — Hot reload = in-place swap of the shared tools array.** Built-ins stay
  pinned at the front; `attachSkills().reload()` splices the skill tail and refreshes
  prompt sections; REST enable/disable emits `skills-changed`, which the daemon wires
  to reload. `jarvis skills reload` hits POST /skills/reload on the daemon, falling
  back to a local validation pass when the daemon is down.
