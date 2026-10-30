# Phase 2 verification — gateway + Telegram + scheduler

## 1. Tests

```bash
pnpm --filter @jarvis/gateway test
```

26 tests:

| Requirement | Test |
|---|---|
| Auth middleware on every route (401 without/with wrong token; /health open) | `test/server.test.ts` auth suite |
| REST chat, approvals decide (replay exactly once, deny never executes), jobs CRUD + cron validation, memories, config validate/persist, audit filters | `test/server.test.ts` |
| Telegram round-trip with mocked bot (grammY transformer, zero HTTP) | `test/telegram.test.ts` "full chat round-trip" |
| Telegram locked to configured chat id | `test/telegram.test.ts` "ignores messages from other chats" |
| /brief command | `test/telegram.test.ts` |
| Inline Approve/Deny buttons decide + execute (audited), deny never runs | `test/telegram.test.ts` approval tests |
| Cron fires under a mocked clock (07:00 with vi.setSystemTime + advanceTimersByTimeAsync) | `test/scheduler.test.ts` |
| Seeded jobs: 07:00 daily brief (deterministic @brief), 18:00 follow-up sweep (agent prompt → gmail drafts as approvals) | `test/scheduler.test.ts` "seeds the two default jobs" |
| @brief bypasses the model entirely | `test/scheduler.test.ts` |

## 2. Daemon boot (executed 2026-07-24)

```bash
JARVIS_HOME=$(mktemp -d) JARVIS_WORKSPACE=$(mktemp -d) ANTHROPIC_API_KEY=dummy jarvis start
```

- [x] boots: "gateway listening on http://127.0.0.1:4820", "scheduler running 2 job(s)"
- [x] GET /health → `{"ok":true}` without auth
- [x] GET /jobs with bearer token → both seeded jobs
- [x] GET /jobs without token → 401
- [x] SIGTERM stops cleanly

## 3. Docs

- [x] `docs/daemon.md` — pm2, launchd, systemd setups

## Live Telegram round-trip (needs a real bot token — final checklist item)

1. `@BotFather` → create bot → `export TELEGRAM_BOT_TOKEN=...`
2. `jarvis onboard` (enable Telegram, set chat id from @userinfobot)
3. `jarvis start`, message the bot; ask it to send a webhook → Approve/Deny buttons appear; `/brief` returns the daily brief.
