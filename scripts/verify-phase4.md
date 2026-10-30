# Phase 4 verification — skill system

## 1. Tests

```bash
pnpm --filter @jarvis/skills test     # 9 tests
pnpm --filter @jarvis/gateway test    # 30 tests (incl. skillsRuntime suite)
```

| Requirement | Test |
|---|---|
| Manifest validation (kebab name, required fields, unknown declared tools, missing/invalid skill.json) | `skills/test/loader.test.ts` manifest suite |
| ENFORCEMENT: a skill cannot call tools it didn't declare | `loader.test.ts` "BLOCKS calls to tools the skill did not declare" |
| Custom tool risk ≤ declared permissions; built-in name collisions refused | `loader.test.ts` |
| Bridged calls are audited (source `skill:<id>`) and outbound/exec still hit the approval gate | `loader.test.ts` ("routes them through the audit trail", "outbound custom tools still hit the approval gate") |
| Hot reload picks up edits; disable removes tools+instructions; reload idempotent | `loader.test.ts` + `gateway/test/skillsRuntime.test.ts` |
| Enable/disable via REST triggers reload (`skills-changed` event) | daemon wiring + `skillsRuntime.test.ts` |

## 2. Example skill runs (executed 2026-07-24, live network)

```bash
mkdir -p ~/.jarvis/skills && cp -r examples/skills/hn-digest ~/.jarvis/skills/
jarvis skills reload
```

- [x] Loader loads `hn-digest` with zero problems (zod aliased to the runtime's copy — skill folders need no npm install)
- [x] `hn_top` fetched the real HN front page THROUGH the audited `http_request` bridge — audit row `{tool: http_request, source: skill:hn-digest, status: ok}`
- [x] Job wiring documented in `examples/skills/hn-digest/README.md` (PUT /jobs/hn-digest)

## 3. Security posture

- No remote skill installation in v1 — local folders only (deliberate; stated in READMEs).
- `ctx.callTool` is the only bridge back into Jarvis; it passes through `executeToolCall`,
  so audit-before-execution and the outbound/exec approval gate are impossible to skip.
