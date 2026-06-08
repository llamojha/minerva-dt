# Deploying Minerva to Vercel

Minerva runs on Vercel as **static site (CDN) + one serverless function for the API**, same-origin.

## Layout

| Path | Served by | Source |
|------|-----------|--------|
| `/` and static assets | Vercel CDN | `web/` (`outputDirectory` in `vercel.json`) |
| `/api/*` | Serverless function | `api/[...route].ts` → `handle(createApp())` |

`vercel.json` runs `npm run build` (tsc → `dist/`) first; the function imports the compiled
`dist/server/app.js`, so the bundler never resolves TypeScript. `fixtures/**` is force-included via
`includeFiles` (the fixture is read from disk at cold start).

## What works on Vercel vs. locally

- **Fixture replay (the hosted demo): yes.** Prod is fixture-backed — `MINERVA_LIVE` is unset.
- **Live agent: no.** It spawns the Dynatrace MCP server as a subprocess (`npx …`), which Vercel
  functions can't do. Live runs stay a **local** capability (`npm run dev:live`).
- **Export (dtctl notebook): no on Vercel.** It shells out to the `dtctl` binary. The export
  endpoint still resolves the opportunity statelessly and returns a clean `502`; the frontend then
  falls back to a simulated artifact ("Demo mode"). To make export work in prod later, swap
  `src/export/dtctl.ts` for a direct Dynatrace Document API HTTP call (no subprocess).

## Statelessness

There is **no cross-request in-memory state** (POST and the SSE GET can hit different function
instances). The run's objective is encoded into the `runId` (base64url); `GET …/events` and export
reconstruct it from the id. A module-level cache is only a same-process fast-path; a miss re-derives
from the fixture replay (cheap, in-memory).

## Env vars (Vercel dashboard)

- `MINERVA_REPLAY_SPEED` — optional, default `1`. Set e.g. `3` to compress the replay cadence so the
  SSE stream finishes well within the function's `maxDuration` (60s in `vercel.json`; >10s needs a
  Pro plan).
- `DT_*` / `GEMINI_API_KEY` — **not needed** for the fixture-backed prod demo. Only required for the
  local live agent.

## Deploy

```
vercel            # preview
vercel --prod     # production
```

Verify after first deploy: `/api/health` returns `{ok:true}`, `/` loads the app, and a picked
objective streams a full investigation → ranked board over SSE.

## Local dev (one origin, mirrors prod)

```
npm run dev       # serves web/ + /api on http://localhost:8787
```

(The legacy two-server split — `npm run web` on :8080 talking to :8787 — still works via the
`?api=` / port-8080 fallback in `web/minerva/transport.js`, but is no longer needed.)
