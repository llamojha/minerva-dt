# Minerva — Roadmap

Target: a working end-to-end demo of **one objective ("Improve Performance")** for the
Google Cloud Rapid Agent Hackathon — Dynatrace Track. **Deadline: 2026-06-11.**

The demo bar (from [`00-goal.md`](docs/minerva/00-goal.md) / [`01-prd.md`](docs/minerva/01-prd.md)):
objective → ranked opportunity board in **< 60s**, every card linked to source DQL, ≥ 1 quantified
payoff, ≥ 1 opportunity exported as a Dynatrace artifact, and the agent visibly runs a
**multi-step** investigation (not one query).

---

## Foundational decisions

These were ambiguous in the repo and are resolved here. Override in M0 if you disagree.

| Decision | Resolution | Why |
|---|---|---|
| **Agent runtime** | **TypeScript + `@google/adk`** | Official first-party TS ADK; reuses existing TS tooling (`package.json`, `tsconfig`, `vitest`, `src/types.ts`, `coding.md`); lets the event contract be a single shared module imported by both agent and web — no pydantic mirror, no drift. |
| **Frontend** | **TypeScript + React + Vite** | Matches `coding.md`, the design doc's three screens, and your in-progress wireframes. |
| **Agent ↔ UI transport** | **SSE** over a small **Hono** server (start objective via `POST`, stream events via `GET /events`) | Simpler than WebSocket; one-way agent→UI stream is all the design needs. Hono has a native SSE helper and runs cleanly on Cloud Run. |
| **Deploy** | **Agent + frontend both on Cloud Run** (containers) | Vertex AI Agent Engine is Python-only, so it is not used. One platform, one deploy story. |
| **Demo data** | **Real trial tenant + seeded app** as primary; **recorded fixtures** as offline fallback | Judging gate requires live Dynatrace; fixtures de-risk the live demo and enable offline FE/agent dev. |
| **Repo shape** | `src/` (TypeScript agent) · `web/` (React) · `demo-app/` (seeded services) · `fixtures/` (recorded events) · `src/contract.ts` (shared event contract) | The `src/` TS stubs are kept and built out as the real agent. |

> ℹ️ The whole stack is TypeScript. The event contract (`src/contract.ts`) is imported by both
> the agent and the React frontend — one source of truth. The leftover Python `.venv` can be removed.

---

## Critical path

```
M0 Foundation ─┬─▶ M1 DT read path ─▶ M3 Agent loop ─▶ M4 Rank/impact ─▶ M6 Export ─▶ M8 Polish+deploy
               │                          ▲
               │   M2 Seeded app ─────────┘
               └─▶ M5 Frontend (parallel, against the M0 event contract) ─────────────────┘
                   M7 Self-observability (parallel, low coupling)
```

The event contract in **M0** is the seam that lets frontend (M5) and agent (M1–M4) proceed
independently. Lock it first.

---

## Milestones

### M0 — Foundation & the event contract  ⏱ do first  · 🔴 MVP-critical
The unblocker for parallel work.

- [x] **Runtime decided:** all TypeScript — agent (`@google/adk`) + React frontend.
- [ ] **Define the agent event schema** — the typed events the stream emits and the UI renders.
      Minimum set, aligned to `02-design.md` and `04-agent-logic.md`:
  - `run.started` `{ objective: { kind, statement, scope } }`
  - `plan.proposed` `{ steps: [{ id, description }] }`
  - `step.started` `{ stepId }`
  - `step.completed` `{ stepId, dql, resultSummary, durationMs, rowCount?, deepLink? }`
  - `step.failed` `{ stepId, message }`
  - `opportunity.added` `{ opportunity: { id, finding, impact{metric,before,after,unit,assumption}, effort, confidence, confidenceReason, dissent, recommendedAction, evidence[] } }`
  - `board.ready` `{ rankedOpportunityIds[] }`
  - `action.completed` `{ opportunityId, kind, url }`
  - `run.completed` `{ totalDurationMs, queryCount, estCost? }`
  - `error` `{ stage, message }`
- [ ] **Publish the schema in one shared place**: `docs/event-contract.md` + the TypeScript
      types in `src/contract.ts` (imported by both agent and `web/` — no language mirror) + a
      replayable sample stream `fixtures/improve-performance.jsonl`. Frontend builds against this.
- [ ] Decide REST surface: `POST /objectives` (start) → `GET /objectives/{id}/events` (SSE).
- [ ] Build the agent on the existing `src/` TS stubs; keep `src/types.ts` concepts (they
      become `src/contract.ts`); delete the leftover Python `.venv`; keep `NODE_ENV` in
      `.env.example` (now valid).

**Exit:** a committed event contract (`docs/event-contract.md` + `src/contract.ts`) + a
replayable sample event stream the FE can render with no live backend.

---

### M1 — Dynatrace read path  · 🔴 MVP-critical
The agent's senses.

- [ ] Wire the **Dynatrace MCP server** (`@dynatrace-oss/dynatrace-mcp-server`, Node-native) as
      an `@google/adk` MCP tool.
- [ ] `execute_dql` working against the trial tenant with the verified patterns in
      [`docs/dynatrace-reference.md`](docs/dynatrace-reference.md) and the `dt-*` skills.
- [ ] Cost-aware query helper: enforce `from:` timeframe + entity filter + `limit` on every query.
- [ ] Implement the 3 reference queries (service RED → slow endpoints → DB hotspots) and confirm
      they return sane data from the seeded app.

**Exit:** the agent can run the Improve-Performance DQL sequence and get real results.

---

### M2 — Seeded demo app + planted hotspot  · 🔴 MVP-critical · ⚡ can start alongside M1
The ground truth the demo depends on.

- [ ] Deploy a small microservice app (checkout/cart/orders + a DB) on the trial tenant with OneAgent.
- [ ] Plant the **hero hotspot**: `checkout /pay` p95 ≈ 4.2s dominated (~65%) by one unindexed
      `orders` query (per `00-goal.md`). Optionally an N+1 in `cart` as opportunity #2.
- [ ] Generate steady RED traffic + distributed traces + DB spans.
- [ ] **Record a fixture**: capture real DQL results into `fixtures/` so the demo (and offline
      dev) can run without a live tenant.

**Exit:** querying the tenant reveals the planted opportunities; fixtures captured.

---

### M3 — The Minerva agent: single-agent investigation loop  · 🔴 MVP-critical
The "it's an agent" core.

> **One agent, not many.** `04-agent-logic.md` specifies a *single* agent (Minerva — one Gemini
> 2.5 Flash, one system prompt) running the loop `PLAN → INVESTIGATE → ANALYZE & RANK → RECOMMEND →
> ACT`. "Multi-step" is the branching investigation *within* the task, not multiple agents. With
> MVP scope fixed to one objective (Performance), there is exactly one analyst → one agent. Sub-
> agents (Cost/Errors specialists) are post-MVP only. No orchestrator layer, no delegation.

- [ ] One ADK `LlmAgent` (Gemini 2.5 Flash) with the system prompt from `04-agent-logic.md` and
      the M1 toolset (`dt_execute_dql`) as its only tool.
- [ ] A loop runner wrapping the agent: drives **plan → investigate (multi-step, branching) →
      analyze**, and emits M0 events at each beat (`plan.proposed`, `step.started/completed`, …)
      over the existing SSE endpoints (replacing the fixture replay as the stream source).
- [ ] Branching logic: dominant service → drill its spans → if DB span dominates, fetch statement.
- [ ] Evidence tagging (`[DYNATRACE]/[DAVIS]/[INFERRED]/[ASSUMPTION]`) on every claim.

**Exit:** starting the objective streams a live, branching investigation to any SSE consumer.

---

### M4 — Impact estimator + ranking  · 🔴 MVP-critical
Turns findings into a ranked, defensible board. This is the **same single agent's** ANALYZE & RANK
phase — `impact_estimator` is a function/tool (or prompt logic) the M3 agent calls, **not** a
separate agent. Split out as its own milestone only for tracking; it ships inside the M3 agent.

- [ ] `impact_estimator`: evidence → quantified before→after + **stated assumption**.
- [ ] Effort heuristic (Low/Med/High) + calibrated confidence + dissent surfacing.
- [ ] Rank by **impact × effort**; emit `opportunity.added` + `board.ready`.
- [ ] "Insufficient data" path — never fabricate.

**Exit:** the hero opportunity (p95 4.2s→1.5s, −64%) ranks #1 with assumption + dissent.

---

### M5 — Frontend: the three screens  · 🔴 MVP-critical · ⚡ PARALLEL NOW
You're wireframing this now. It can be built end-to-end against M0 fixtures before the agent is done.

- [ ] **Objective picker** — gallery of objective cards + free-form input + optional scope.
- [ ] **Investigation Stream** — animated plan-that-executes; each step shows clickable DQL +
      one-line result + timing. Render from SSE (or replay a fixture).
- [ ] **Opportunity Board** — ranked cards: finding, before→after bar, effort, confidence,
      evidence links, dissent, recommended action, export buttons.
- [ ] **Leverage Map** (signature visual) — 2×2 impact×effort; top-left quadrant glows;
      click a dot → scroll to card. *This is the Devpost screenshot — prioritize it.*
- [ ] Impact-projection animation with the printed assumption.
- [ ] Dark instrument-panel tone, monospace for queries/metrics, high-contrast hero numbers.

**Exit:** all three screens drive off the SSE stream; works against fixtures with no live backend.

---

### M6 — ACT: export to Dynatrace notebook  · 🔴 MVP-critical
Closes the loop, satisfies "beyond chat."

- [ ] `dtctl` integration (`--agent` JSON) to create a notebook capturing the opportunity + evidence.
- [ ] `POST /objectives/{id}/opportunities/{oid}/export` → returns artifact URL → `action.completed`.
- [ ] Use the `dt-app-notebooks` skill for notebook JSON structure.

**Exit:** clicking "Export to Dynatrace notebook" produces a real notebook URL.

---

### M7 — Self-observability (OTel → Dynatrace)  · 🟡 Should · ⚡ parallel, low coupling
The write-back half of the DT integration; the "what this analysis cost" UI beat.

- [ ] OTLP export of the agent's own traces, token usage, latency, tool-call outcomes.
- [ ] Surface cost/latency summary in the UI footer of the investigation.

**Exit:** the agent's own run shows up in Dynatrace and a cost summary renders in the UI.

---

### M8 — Polish, deploy, submission  · 🔴 MVP-critical

> 🔴 **The hosted URL must be fixture-backed, not live-tenant-backed.** The 15-day trial tenant
> expires ~2026-06-22 — the day judging *starts* (Jun 22–Jul 6). A hosted URL wired to the live
> tenant would show judges an empty/broken board for the entire judging window. So the deployed
> build **defaults to fixture replay** (the M0 stream source); live-tenant mode is used only for
> your own demo-video recording before the trial expires. This is why M2's fixture capture is
> load-bearing — record it before 2026-06-22.

- [ ] Deploy agent container + frontend container to **Cloud Run** → **hosted URL** (required).
      (Agent Engine is Python-only and not used.)
- [ ] **Fixture-backed by default:** a stream-source switch (live tenant ↔ recorded fixtures);
      the public deploy uses fixtures so it survives tenant expiry. Live mode is opt-in for recording.
- [ ] Wire `.env` (`DT_ENVIRONMENT`, `GEMINI_API_KEY`, `GOOGLE_CLOUD_PROJECT`, Grail budget).
      For live mode in a container, auth is the `dt0s16` platform token (not browser OAuth).
- [ ] Rehearse the **3-minute demo script** (`01-prd.md` §9); verify the <60s board.
- [ ] Tests: agent loop + impact estimator + a fixture-driven FE smoke test (Vitest).
- [ ] Devpost write-up + demo video (first 3 min matter most).

**Exit:** a public, fixture-backed URL runs the full objective end-to-end (no live tenant needed)
and the video is recorded.

---

## Scope guardrails

- **One objective, flawless.** Performance only. Other objectives appear in the gallery as
  roadmap, not implemented (`01-prd.md` §8).
- **Out of MVP:** multi-objective depth, auth/multi-tenant, persistence beyond exported
  artifacts, ticket/PR export (Could), objectives beyond Performance (post-MVP).
- **Risk watch:** "reads as a smart dashboard" → lead with visible branching + a non-obvious
  finding; "design is weakest axis" → the Leverage Map is the answer (M5).

## What's parallelizable right now

| Track | Can start before | Needs |
|---|---|---|
| Frontend (M5) | the agent exists | only the M0 event contract + a fixture stream |
| Seeded app (M2) | the agent exists | trial tenant access |
| Self-obs (M7) | most things | the agent skeleton from M0 |

So the immediate two-person split is: **lock M0 today**, then you run M5 (frontend) off the
fixtures while the backend track runs M1→M2→M3→M4.
