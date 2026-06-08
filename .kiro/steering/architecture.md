# Architecture

See [`docs/minerva/03-architecture.md`](../../docs/minerva/03-architecture.md) for the full
spec. This is the steering summary.

## System Overview

```
┌──────────────────────────────────────────────────────────────┐
│                      Web App (React/Vite)                      │
│   Objective picker · Investigation stream · Opportunity board  │
│                  Leverage map · Impact projection              │
└───────────────▲───────────────────────────┬──────────────────┘
                │ agent events (SSE/WS)       │ REST (start objective)
                │                             ▼
┌──────────────────────────────────────────────────────────────┐
│         Minerva Agent  (TypeScript · @google/adk · Gemini 2.5 Pro)  │
│   Single LlmAgent (planner → investigate → rank → emit)        │
│     tools:                                                     │
│       • Dynatrace MCP   (reads: execute_dql, problems, …)      │
│       • dtctl           (writes: notebook / dashboard)         │
│       • impact_estimator (quantify payoff from evidence)       │
└───────────────┬───────────────────────────────┬──────────────┘
                │ DQL (Grail)                     │ OTLP (self-telemetry)
                ▼                                 ▼
        ┌───────────────┐                 ┌───────────────┐
        │   Dynatrace   │◀────────────────│  OTel export  │
        │ (trial tenant)│   agent traces  │ (Minerva's own)│
        └───────▲───────┘                 └───────────────┘
                │ OneAgent
        ┌───────┴────────┐
        │ Seeded demo app │  (microservices: RED + traces + DB spans, with a planted hotspot)
        └─────────────────┘
```

Dynatrace is both the **source** (Grail data the agent reasons over) and a **sink** (the agent's
own OTel telemetry + the notebooks it writes) — the dual integration judges reward.

## Key Components

### Minerva agent (TypeScript + @google/adk)
- **Gemini 2.5 Pro** for planning, synthesis, and impact estimation (via `@google-cloud/vertexai`).
- **Single `LlmAgent`** (not multi-agent): one model, one system prompt, running the whole loop
  herself. With MVP scope at one objective (Performance), there is exactly one analyst → one agent.
- Owns the objective loop: state plan → investigate (multi-step, branching) → rank → prove → emit.
- Emits structured events the frontend consumes (each plan step, each query + result, each
  opportunity) — the agent's reasoning *is* the UI.
- Deployed to Cloud Run (Agent Engine supports Python only).
- **MVP:** the single Minerva agent + tools, one objective (Performance). Post-MVP: more
  objectives (Cost, Reliability, Scale); per-objective specialist sub-agents are optional and later.

### Web frontend (React + Vite + TypeScript)
- Renders the three screens (objective picker, investigation stream, opportunity board + leverage map).
- Consumes a stream of agent events over SSE/WebSocket so the investigation renders live.
- Deployed to Cloud Run or Firebase Hosting — provides the required hosted web URL.

### Tools
- **Dynatrace MCP server** (`@dynatrace-oss/dynatrace-mcp-server`) — all reads via `execute_dql`,
  `list_problems`, `get_problem_details`, entity resolution. Topology via Smartscape DQL.
- **dtctl** — all writes; export the chosen opportunity as a Dynatrace notebook/dashboard
  (`--agent` JSON, `dtctl commands` catalog).
- **impact_estimator** — local function that turns evidence into a quantified, assumption-stated payoff.

### Data layer
- **Dynatrace trial tenant** (real, not mocked) — the system of record.
- **Seeded demo app** instrumented with OneAgent, producing RED metrics, distributed traces, and
  DB spans — including a deliberately planted performance hotspot (unindexed query / N+1).

### Self-observability (OTel → Dynatrace)
- The agent exports its own traces, token usage, latency, and tool-call outcomes via OTLP.
- Surfaced in the UI as "what this analysis cost."

## Data Flow (one objective)

1. User selects an objective → frontend POSTs to the agent API.
2. The Minerva agent (Gemini) produces an investigation plan, emits it.
3. For each step: build DQL → (optionally `verify_dql`) → `execute_dql` via MCP → emit query +
   one-line result. Branch on findings.
4. `impact_estimator` quantifies each candidate opportunity.
5. The agent ranks by impact × effort, attaches confidence + dissent, emits the board.
6. On "Export", the agent calls `dtctl` to create a Dynatrace notebook; returns its URL.
7. Throughout, the agent's own spans/metrics flow to Dynatrace via OTLP.

## Technology Choices

| Choice | Rationale |
|--------|-----------|
| TypeScript + @google/adk | Official first-party TS ADK; shares the event-contract types with the React frontend; reuses existing TS tooling |
| Gemini 2.5 Pro | Required by the track; strong planning/synthesis |
| Dynatrace MCP server | Required partner integration; the read path |
| dtctl | Clean, agent-friendly write path (`--agent` JSON) |
| React/Vite | Fast to build a polished, streaming web UI |
| Cloud Run | Hosted URL; one container runtime for both agent and frontend |
| OpenTelemetry | Self-instrumentation; the write-back half of the DT integration |

## Verified Dynatrace knowledge

DQL and tool usage must follow the verified patterns in
[`docs/dynatrace-reference.md`](../../docs/dynatrace-reference.md) and the installed skills under
`.agents/skills/` (e.g. `dt-obs-services`, `dt-obs-tracing`, `dt-dql-essentials`).
