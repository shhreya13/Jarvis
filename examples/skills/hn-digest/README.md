# hn-digest — example Jarvis skill

Fetches the Hacker News front page and has the agent write a compact digest.

## Install (local folders only — by design)

```bash
cp -r examples/skills/hn-digest ~/.jarvis/skills/
jarvis skills reload      # or restart `jarvis start`
```

Jarvis deliberately has **no remote skill installation** in v1 — skills are code
that runs inside your agent, so the only trusted source is a folder you put on
your own disk and can read first.

## What it demonstrates

- `skill.json` manifest: instructions injected into the system prompt,
  `tools: ["http_request"]` (the only built-in this skill's code may call), and
  `permissions: ["read"]` (its custom tools may not declare higher risk).
- `tools.ts`: a custom `hn_top` tool that reaches the network **through**
  `ctx.callTool("http_request", …)` — so the call is audited like any other and
  the loader's permission wall applies. Calling an undeclared tool throws.

## Wire it as a scheduled job

Send this through the dashboard's Jobs page, or:

```bash
TOKEN=$(jarvis token)
curl -X PUT http://127.0.0.1:4820/jobs/hn-digest \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"cron":"30 8 * * *","prompt":"Use the hn-digest skill: fetch the top 10 Hacker News stories and send me the digest.","channel":"telegram","enabled":true}'
```

Every morning at 08:30 the digest lands in your Telegram chat.
