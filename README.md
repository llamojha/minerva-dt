# Minerva

**You bring the goal. Minerva finds the wisest move, proven by your data.**

Minerva is an objective-driven optimization agent. You state an engineering goal — *"improve
performance," "cut cost," "reduce errors"* — and Minerva autonomously investigates your Dynatrace
data, finds the highest-leverage opportunities, quantifies the payoff with evidence, and turns the
chosen opportunity into action.

> Decision intelligence for engineering, grounded in runtime truth.

## The Problem

Engineering teams set objectives constantly, but the path from a goal to a concrete, justified
action is broken:

- **Decisions are made on opinion, not evidence.** The ground truth — which endpoint is actually
  slow, which service actually wastes money — sits unused in observability data.
- **Dashboards make humans do the hunting.** They answer *"what's happening?"*, not *"given my
  goal, where is the single best move?"*
- **Effort is mis-allocated.** Without quantified impact-vs-effort, work goes to low-payoff places.

## How Minerva Works

```
OBJECTIVE  →  PLAN  →  INVESTIGATE  →  RANK  →  PROVE  →  ACT
  "improve     decide   multi-step     impact   evidence   export /
 performance"  what to   DQL across     × effort  + confidence  ticket /
               gather    Dynatrace      ranking   + dissent     notebook
```

You state a goal in plain language. Minerva decomposes it into an investigation plan, runs a
multi-step inquiry across Dynatrace (metrics, traces, database spans, problems, topology), and
returns a **ranked board of opportunities** — each a concrete finding with the data that proves
it, an estimated payoff, an effort estimate, and a recommended action. Then it turns the
opportunity you choose into a durable artifact.

## What Makes It Different

- **Objective-driven, not metric-driven** — the unit of interaction is a *goal*; the output is a
  *ranked action with justification*.
- **It does the analysis, not just the query** — it plans, branches, correlates across services,
  and ranks by impact-to-effort. A saved dashboard cannot do this.
- **Every claim is sourced** — each finding links to the exact DQL and result. Confidence is
  calibrated; the contrary evidence (dissent) is always shown.
- **It acts** — the chosen opportunity becomes a Dynatrace notebook / ticket / PR.

## Architecture

Minerva is a **single optimization agent** (one Gemini 2.5 Pro `LlmAgent`) that, given an
objective, autonomously runs a multi-step, branching investigation over Dynatrace and
synthesizes the evidence into a ranked recommendation. The MVP targets one objective —
**Improve Performance** — with Cost, Reliability, and Scale objectives to follow.

Dynatrace is both the **source** (Grail data the agent reasons over) and a **sink** (the agent's
own OTel telemetry + the notebooks it writes).

```
React/Vite web app  ──▶  Minerva agent (TypeScript · @google/adk · Gemini 2.5 Pro)
                            ├─ Dynatrace MCP server   (reads: execute_dql, problems, …)
                            ├─ dtctl                  (writes: notebook / dashboard)
                            └─ impact_estimator       (quantify payoff)
                                      │  DQL / OTLP
                                      ▼
                            Dynatrace trial tenant ◀── seeded demo app (OneAgent)
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Agent model | Gemini 2.5 Pro |
| Orchestration | Google ADK (TypeScript, `@google/adk`) |
| Runtime source (reads) | Dynatrace MCP Server |
| Action layer (writes) | `dtctl` (Dynatrace CLI) |
| Self-observability | OpenTelemetry → Dynatrace (OTLP) |
| Frontend | React + Vite + TypeScript |

## Documentation

The authoritative specs live in [`docs/minerva/`](docs/minerva/):

| Doc | Purpose |
|-----|---------|
| [00-goal.md](docs/minerva/00-goal.md) | North star: problem, solution, positioning, success criteria |
| [01-prd.md](docs/minerva/01-prd.md) | Product requirements: users, flows, functional reqs, MVP scope, demo |
| [02-design.md](docs/minerva/02-design.md) | UX: principles, screens, the signature visual, interaction model |
| [03-architecture.md](docs/minerva/03-architecture.md) | Technical: stack, agent design, data, tools, deployment |
| [04-agent-logic.md](docs/minerva/04-agent-logic.md) | Agent behavior: the investigation loop, system prompt, evidence model |
| [dynatrace-reference.md](docs/dynatrace-reference.md) | Verified DQL and Dynatrace tooling reference |

## Getting Started

### Prerequisites

- Node.js 20+ (agent + web frontend)
- Google Cloud account with Vertex AI access (Gemini 2.5 Pro)
- Dynatrace environment with API access (a free trial tenant works)
- `dtctl` installed and authenticated (`dtctl auth login`)

### Setup

```bash
# Configure environment
cp .env.example .env
# Edit .env with your Dynatrace and Google Cloud credentials
```

### Environment Variables

```
DT_ENVIRONMENT=https://your-env.apps.dynatrace.com
DT_GRAIL_QUERY_BUDGET_GB=10
GOOGLE_CLOUD_PROJECT=your-project-id
GEMINI_API_KEY=your-gemini-key
```

## Demo

The demo shows one objective end to end:

1. **Set the goal** — user picks "Improve Performance"
2. **The agent investigates** — a visible plan executes step by step across Dynatrace (rank
   services by latency → drill slow endpoints → spans → DB hotspots → correlate deploys)
3. **The payoff** — a ranked opportunity board sorted by impact × effort, each card with source
   DQL, projected before→after, confidence, and dissent
4. **The signature visual** — the "Leverage Map" (impact vs effort) highlights "pull these"
5. **Act** — export the chosen opportunity as a Dynatrace notebook via `dtctl`

Hero opportunity: *"checkout /pay — 65% of p95 is one unindexed DB query"* → p95 4.2s → 1.5s (−64%).

## Hackathon

Built for the [Google Cloud Rapid Agent Hackathon](https://rapid-agent.devpost.com/) — Dynatrace Track.

## License

[Apache 2.0](LICENSE)
