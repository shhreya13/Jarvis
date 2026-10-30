# Jarvis Dashboard

Operator console for the Jarvis gateway. Pure client-side Next.js app: every
gateway call happens in **your browser** with a bearer token stored in
localStorage — the dashboard's own server never sees your token or your data.
That is what lets the same build run against `127.0.0.1` locally and deploy
unchanged to Vercel.

## Run locally

```bash
# from the repo root (daemon must be running)
jarvis daemon        # gateway on http://127.0.0.1:4820
jarvis token         # prints the bearer token

# dashboard
cd apps/dashboard
pnpm dev             # http://127.0.0.1:3300
```

Open http://127.0.0.1:3300, keep the default gateway URL, paste the token,
Connect.

## Deploy to Vercel

The app is static + client-side, so deployment is stock Next.js:

```bash
vercel deploy        # vercel.json pins framework=nextjs
```

Optionally set `NEXT_PUBLIC_JARVIS_GATEWAY_URL` in the Vercel project to
pre-fill the pairing screen. Nothing else is needed — there are no server
environment secrets because there is no server-side data path.

## Pair a deployed dashboard with your local gateway

The gateway listens on loopback. To reach it from a hosted dashboard, open a
tunnel on the gateway machine:

```bash
cloudflared tunnel --url http://127.0.0.1:4820
```

cloudflared prints a `https://<random>.trycloudflare.com` URL. On the deployed
dashboard's pairing screen, enter that URL plus your `jarvis token` output.
The browser then talks to your machine directly; websocket streaming works
through the tunnel too.

**Security note:** exposing the gateway through a tunnel means the bearer
token is the only lock on your agent — treat the tunnel URL as private, don't
post it anywhere, and rotate the token (`jarvis token --rotate`) if you
suspect either leaked. Anyone with URL + token can read your memory, approve
actions, and run tools.

## Scripts

| Script           | What it does                          |
| ---------------- | ------------------------------------- |
| `pnpm dev`       | dev server on port 3300               |
| `pnpm build`     | production build                      |
| `pnpm start`     | serve the production build            |
| `pnpm typecheck` | strict TypeScript check               |
| `pnpm test:e2e`  | Playwright smoke (pair→chat→approve)  |

The e2e suite boots a real gateway daemon (`e2e/gateway-harness.mjs`) against
a throwaway `JARVIS_HOME` with a scripted model — build `packages/core` and
`packages/gateway` first, and install a browser once with
`pnpm exec playwright install chromium`.
