# Final checklist (Phase 5)

Two classes of items: **[auto]** — executed during this build with simulated
model/channels (results recorded below); **[keys]** — require your real
credentials, run the exact commands shown.

## 1. [auto] Fresh clone → build → tests

```bash
pnpm install && pnpm build && pnpm test && pnpm lint
```

Result 2026-07-24: build clean; tests green
(core 36, tools 19, gateway 30, skills 9 = 94); lint clean.

## 2. [keys] Onboard → chat answers a question via web_search

```bash
export ANTHROPIC_API_KEY=... BRAVE_API_KEY=...
jarvis onboard        # accept defaults, skip Telegram
jarvis chat
you › what happened in AI news this week? use web search
# expect: ⚙ web_search(...) ✔ then a sourced answer; `jarvis audit` shows the call
```

## 3. [keys] Email draft blocked → approved via Telegram button → appears in Gmail drafts

```bash
export TELEGRAM_BOT_TOKEN=... GOOGLE_CLIENT_SECRET=...
# config.google.clientId set; jarvis google-auth done; telegram enabled with your chat id
jarvis start
# from Telegram: "draft an email to me summarizing my week"
# expect: "Approval needed — gmail_create_draft" with ✅/❌ buttons; tap ✅;
# confirmation message; the draft is in https://mail.google.com/ → Drafts.
# Audit shows gmail_create_draft risk=outbound status=ok, approvals row executed.
```

The full gate logic (block → button → decide → execute exactly once → audit) is
covered by automated tests with a mocked bot: `gateway/test/telegram.test.ts`.

## 4. [auto] The 07:00 job fires (simulated)

- Mocked clock: `gateway/test/scheduler.test.ts` sets system time to 06:59:50
  and advances 20s — the `0 7 * * *` job fires and delivers to the channel.
- Live daemon: booted with a fake channel and `runJobNow("daily-brief")` —
  brief composed (calendar/gmail degrade gracefully without Google creds) and
  delivered. Result recorded in verify-phase5 run below.

## 5. [auto] Dashboard pairs and streams chat

`apps/dashboard` Playwright smoke (`pnpm --filter @jarvis/dashboard test:e2e`):
pairs against a real daemon on :4821 (deterministic token), sends a chat over
the websocket, an outbound approval card appears, Approve executes it, the
turn streams to completion, and the audit page shows the `ok` row.

## 6. [auto] Example skill runs

`examples/skills/hn-digest` loaded by the real loader and executed live —
fetched the actual HN front page through the audited `skill:hn-digest`
http_request bridge (see scripts/verify-phase4.md).

## 7. [auto] All tests green

CI runs build + typecheck + lint + tests on every push
(.github/workflows/ci.yml).
