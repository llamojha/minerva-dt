# Minerva — Architecture

## System overview

```
┌──────────────────────────────────────────────────────────────┐
│                      Web App (React/Vite)                      │
│   Objective picker · Investigation stream · Opportunity board  │
│                  Leverage map · Impact projection              │
└───────────────▲───────────────────────────┬──────────────────┘
                │ SSE / WebSocket (agent events)│ REST (start objective)
                │                               ▼
┌──────────────────────────────────────────────────────────────┐
│            Minerva Agent  (TypeScript · @google/adk · Gemini)    │
│                                                                │
│   Single LlmAgent (Gemini 2.5 Flash)                             │
│     ├─ states plan · runs investigation loop · ranks · emits   │
│     └─ tools:                                                   │
│         • Dynatrace MCP  (reads: execute_dql, problems, …)     │
│         • dtctl          (writes: notebook / dashboard)        │
│         • impact_estimator (quantify payoff from evidence)     │
└───────────────┬───────────────────────────────┬──────────────┘
                │ DQL (Grail)                     │ OTLP (self-telemetry)
                ▼                                 ▼
        ┌───────────────┐                 ┌───────────────┐
        │   Dynatrace   │◀────────────────│  OTel export  │
        │  (trial tenant)│   agent traces  │  (Minerva's own)│
        └───────▲───────┘                 └───────────────┘
                │ OneAgent
        ┌───────┴────────┐
        │ Seeded demo app │  (microservices producing RED + traces + DB spans)
        └─────────────────┘
```

Dynatrace is both the **source** (Grail data the agent reasons over) and a **sink** (the
agent's own OTel telemetry + the notebooks it writes) — the dual integration judges reward.

## Components

### Web frontend
- **React + Vite + TypeScript.** Renders the three screens (see 02-design).
- Consumes a **stream of agent events** (plan steps, query results, opportunities) over
  SSE or WebSocket so the investigation renders live.
- Deployed to **Cloud Run** (container) or Firebase Hosting + a small API. Provides the
  required hosted web URL.

### Minerva agent (TypeScript + @google/adk)
- **Gemini 2.5 Flash** for planning, synthesis, and impact estimation (via `@google-cloud/vertexai`).
- **Minerva is a single `LlmAgent`**, not a multi-agent system. One model, one system prompt
  (`04-agent-logic.md`), running the whole loop herself. "Multi-step" is the branching
  investigation *within* the task — not multiple agents. With MVP scope fixed to one objective
  (Performance), there is exactly one analyst → one agent; an orchestrator/delegation layer would
  add latency, cost, and failure modes for no benefit.
- The agent owns the objective loop: state plan → investigate (multi-step, branching) → rank → emit.
- Emits structured events the frontend consumes (each plan step, each query + result, each
  opportunity) — the agent's reasoning *is* the UI.
- Deployed to **Cloud Run** (Agent Engine supports Python only).
- **MVP:** the single Minerva agent + tools. **Post-MVP only:** if multiple objectives are added
  (Cost, Reliability, Scale, …), *then* consider per-objective specialists under an orchestrator.
  That is a deliberate future step, not the MVP architecture.

### Tools
| Tool | Type | Use |
|---|---|---|
| **Dynatrace MCP server** | MCP (stdio/remote) | All reads: `execute_dql`, `list_problems`, `get_problem_details`, entity resolution |
| **dtctl** | CLI (subprocess, `--agent` JSON) | All writes: create notebook/dashboard; live platform actions |
| **impact_estimator** | local function | Turn evidence (e.g. query share of p95, call counts) into a quantified, assumption-stated payoff |
| **ticket/PR connector** | optional | Export opportunity as GitHub issue/PR |

### Data layer
- **Dynatrace trial tenant** (free SaaS trial) — the system of record.
- **Seeded demo app**: a small set of microservices (e.g. `api-gateway → checkout →
  payment-gw`, a DB) instrumented with **OneAgent**, producing RED metrics, distributed
  traces, and database spans — including a deliberately planted performance problem (an
  unindexed query / N+1) for the demo's hero opportunity.
- No app database of our own is required for MVP — exported artifacts live in Dynatrace.

### Self-observability
- The agent exports its own **traces, token usage, latency, and tool-call outcomes** via
  **OTel → Dynatrace OTLP**. Surfaced in the UI as "what this analysis cost."

## Data flow (one objective)

1. User selects an objective → frontend POSTs to the agent API.
2. The Minerva agent (Gemini) produces an **investigation plan**, emits it.
3. For each step: build DQL → (optionally `verify_dql`) → `execute_dql` via MCP → emit the
   query + one-line result. Branch based on findings.
4. `impact_estimator` quantifies each candidate opportunity.
5. The agent ranks by impact × effort, attaches confidence + dissent, emits the board.
6. On user "Export", the agent calls `dtctl` to create a Dynatrace notebook; returns its URL.
7. Throughout, the agent's own spans/metrics flow to Dynatrace via OTLP.

## Technology choices

| Choice | Rationale |
|---|---|
| TypeScript + @google/adk | Official first-party TS ADK; shares the event-contract types with the React frontend; reuses existing TS tooling |
| Gemini 2.5 Flash | Required by the track; strong planning/synthesis |
| Dynatrace MCP server | Required partner integration; the read path |
| dtctl | Clean, agent-friendly write path (`--agent` JSON, `dtctl commands` catalog) |
| React/Vite | Fast to build a polished, streaming web UI |
| Cloud Run | Hosted URL; one container runtime for both agent and frontend |
| OpenTelemetry | Self-instrumentation; the write-back half of the DT integration |

## Verified Dynatrace knowledge

DQL and tool usage must follow the verified patterns in
[`../dynatrace-reference.md`](../dynatrace-reference.md) and the installed skills under
`.agents/skills/` (e.g. `dt-obs-services`, `dt-obs-tracing`, `dt-dql-essentials`) and the
verified queries in [`04-agent-logic.md`](04-agent-logic.md).

## Deployment & ops (MVP)

- Agent + API: one Cloud Run service (TypeScript container).
- Frontend: Cloud Run static container or Firebase Hosting.
- Secrets/env: `DT_ENVIRONMENT`, Dynatrace platform token, `GOOGLE_CLOUD_PROJECT`,
  Gemini access, `DT_GRAIL_QUERY_BUDGET_GB`.
- `dtctl auth login` configured for the trial tenant before demo.

## Resolved decisions

- **Agent count:** single `LlmAgent` for the MVP (one objective, Performance). Multi-agent is
  post-MVP only. See the agent component above and `04-agent-logic.md`.
- **MCP transport:** run the Dynatrace MCP server as a **stdio subprocess** alongside the agent
  (`npx @dynatrace-oss/dynatrace-mcp-server`), wired in M1 via the ADK `MCPToolset`.
- **Release backing:** the hosted URL is **fixture-backed** (the trial tenant expires ~2026-06-22,
  as judging begins). Live-tenant mode is opt-in for demo recording. See ROADMAP M8.
