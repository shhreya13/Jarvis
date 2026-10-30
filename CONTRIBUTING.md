# Contributing to Jarvis

## Setup

```bash
pnpm install          # Node 20+, pnpm 11 (native builds are allow-listed in pnpm-workspace.yaml)
pnpm build            # tsc for all packages/*
pnpm test             # vitest across packages
pnpm lint             # eslint flat config
```

If better-sqlite3 fails to load after install: `pnpm -r rebuild better-sqlite3`.

## Layout

| Path | What |
|---|---|
| `packages/core` | Agent loop, SQLite (FTS5), audit, approvals, sandbox, providers |
| `packages/tools` | The 12 built-in tools |
| `packages/gateway` | Daemon: REST + ws, Telegram, scheduler |
| `packages/cli` | `jarvis` binary |
| `packages/skills` | Skill manifest loader + permission enforcement |
| `apps/dashboard` | Next.js dashboard |
| `scripts/verify-phase*.md` | Executable per-phase verification docs |

## Rules that are not up for debate

1. **Every tool call is audited BEFORE it executes** (`recordAuditStart` in
   `executeToolCall`). Don't add a code path around `executeToolCall`.
2. **`outbound` and `exec` never auto-run.** They go through the ApprovalBroker.
   Denial returns a refusal string to the model; timeouts queue and replay
   exactly once (see DECISIONS.md D-9/D-20).
3. **File writes stay inside the workspace** — everything goes through
   `resolveWorkspacePath`.
4. **API keys live in env vars only.** Never write a key to disk or the DB.
5. **No telemetry.** Of any kind.

## Tests

- Unit tests live in each package's `test/` (vitest; `@jarvis/*` aliased to
  sibling `src/` so no build needed).
- Anything touching the loop, sandbox, approvals, or the skill permission wall
  needs a test in the same PR.
- Dashboard e2e: `pnpm exec playwright install chromium`, then
  `pnpm --filter @jarvis/dashboard test:e2e`.

## Commits

Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`).
Keep unrelated changes in separate commits. Record non-obvious design choices in
`DECISIONS.md`.
