# Minerva — Web Frontend

The interactive, demo-ready frontend for Minerva, built from the design wireframes
(`Minerva Dynatrace` design system). A self-contained React prototype — **no build step** —
that renders the four screens of the product flow with mock data.

## Run it

The app loads its `.jsx` files over HTTP via in-browser Babel, so it must be served (opening
`index.html` from `file://` won't work — the browser can't fetch the script sources).

```bash
npm run web          # serves web/ at http://localhost:8080
# or, with no Python:
npx serve web
```

Then open <http://localhost:8080>.

## Screens (all reachable from the UI)

1. **Objective Picker** (`minerva/objective.jsx`) — gallery of engineering goals. Pick
   *Improve Performance* (the demo path) to advance.
2. **Investigation Stream** (`minerva/investigation.jsx`) — the agent's plan executing step by
   step with clickable `DQL ↗` chips, timings, and an objectives rail (the objective Minerva is
   investigating now, with the others greyed as roadmap).
3. **Opportunity Board** (`minerva/board.jsx`) — ranked opportunity cards with animated
   before→after bars, effort/confidence badges, dissent lines, and the signature **Leverage
   Map** (2×2 impact-vs-effort scatter; the high-impact/low-effort quadrant glows, "Pull these").
4. **Opportunity Detail** (`minerva/detail.jsx`) — full evidence, source DQL, assumptions,
   dissent, and the [Export to Dynatrace notebook] / [Open as ticket] actions.

A self-observability footer ("Minerva watches itself too") reports the tokens, wall-clock,
DQL calls, and Grail scanned for the analysis.

## Structure

```
web/
  index.html              # app shell — pins React 18 + Babel from CDN, mounts #root
  minerva/
    app.jsx               # screen navigation, top bar, DQL drawer, action modal, footer
    objective.jsx         # screen 1
    investigation.jsx     # screen 2
    board.jsx             # screen 3 + Leverage Map
    detail.jsx            # screen 4
    ui.jsx                # shared primitives (Icon, OwlMark, badges, before→after bars)
    data.js               # all mock data (objectives, plan, opportunities, self-stats)
    minerva.css           # instrument-panel styling on the Llamojha design tokens
  assets/
    constellation.js      # animated teal/gold network background
    tokens/               # design-system tokens (colors, type, spacing, effects, fonts)
```

## Live transport (M0↔M5 seam)

The app is **stream-driven**. Picking an objective POSTs to the agent and renders the
investigation and board live from the **locked `AgentEvent` contract** (`src/contract.ts`) over
SSE — today a fixture replay, later the real agent (M3/M4), over the *same* endpoints, so the
frontend won't change again.

```bash
npm run dev          # serves the transport at http://localhost:8787
#   POST /objectives             → { runId }
#   GET  /objectives/:id/events  → text/event-stream (AgentEvent)
npm run web          # serves this app at http://localhost:8080
```

`minerva/transport.js` owns the seam: `startRun()` (POST), `streamRun()` (`EventSource`), and
the adapters that map `AgentEvent`s → the screens' view-models. The contract is leaner than the
screens (no Leverage-Map coordinates, no service/endpoint split), so those display-only fields
are **derived** here — the contract stays untouched. `minerva/data.js` now only holds the static
picker config (objective gallery + objectives rail); plan, opportunities, and self-stats all
come from the stream.

### URL params (dev / demo / deep-links)

| Param | Effect |
|---|---|
| `?api=http://host:port` | Point at a different transport (default: `localhost:8787` when served on `:8080`, else same-origin). |
| `?speed=N` | Scale replay cadence — `0` = instant, `1` = real recorded timing. |
| `?objective=<id>` | Auto-start a run on load (`perf`, `cost`, `errors`, `deadcode`, `scale`, `dora`). |
| `?goto=board` | Jump straight to the board once the run is ready (with `?objective=…&speed=0`). |

`dev-replay-check.html` is a minimal smoke page that POSTs and consumes the stream over a raw
`EventSource` (cross-origin → exercises CORS + framing) — useful for isolating transport issues
from the React app.
