# Phase 3 verification — dashboard

## 1. Typecheck + build

```bash
pnpm --filter @jarvis/dashboard typecheck && pnpm --filter @jarvis/dashboard build
```

Executed 2026-07-24: both clean; all 11 routes static; first-load JS ≈110 kB
(inside the app-page budget).

## 2. Playwright smoke — pair, send a chat, approve an action

```bash
pnpm -r build                                   # harness imports packages/*/dist
cd apps/dashboard
pnpm exec playwright install chromium
pnpm test:e2e
```

Executed 2026-07-24 — 3/3 passed (plus 2 screenshot jobs):

1. **pairing** — unpaired browser lands on the pairing screen; connecting to the
   harness gateway (real daemon on :4821, deterministic token) validates via
   /health + /config and renders the rail.
2. **chat** — ws streaming turn: the scripted model calls `webhook_post`
   (outbound) → an approval card renders inline mid-stream → Approve →
   the action executes and the turn resumes to "Done — webhook sent."
3. **audit** — the audit page shows `webhook_post` with status `ok`.

Found & fixed during this run (both are real product bugs, not test issues):

- **Gateway had no CORS** — the dashboard is always cross-origin (other port
  locally, Vercel in prod). Added `@fastify/cors` (reflected origin; bearer
  token remains the access control) and let OPTIONS preflight through auth.
- **Mobile layout** — the fixed 220px rail crushed content at 375px. Rail is
  now md+; small screens get a sticky top bar with horizontally scrollable nav.
  Verified by screenshot at 375×812 (no horizontal overflow).

## 3. Visual check

`pnpm test:e2e --grep screenshots` writes `test-results/shot-*.png` at 1440
and 375 for overview/approvals/settings. Reviewed 2026-07-24 against the design
spec (paper/ink/signal tokens, hairline chrome, mono data, designed empty
states) — matches.

## 4. Vercel deploy

`vercel.json` + `.env.example` ship in `apps/dashboard`; the README there
documents the cloudflared pairing flow. Deploy is an operator step (needs a
Vercel account): import repo → root `apps/dashboard` → set
`NEXT_PUBLIC_JARVIS_GATEWAY_URL` (optional) → pair with tunnel URL + token.
