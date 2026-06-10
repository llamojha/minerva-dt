# Minerva

**You bring the goal. Minerva finds the wisest move — decided by your data, never opinion.**

- **Live demo:** https://minerva-dynatrace.vercel.app
- Built for the [Google Cloud Rapid Agent Hackathon](https://rapid-agent.devpost.com/) — Dynatrace track

Minerva is a fully data-driven, objective-driven optimization agent. Every decision it makes —
which opportunity to surface, which task to recommend, how much payoff to project — is made with
data from Dynatrace. It has two entry modes sharing one engine:

- **Discovery — find the move.** You state an engineering goal — *"improve performance"* — and
  Minerva autonomously investigates your Dynatrace data, finds the highest-leverage opportunities,
  quantifies the payoff with evidence, and turns the chosen opportunity into action.
- **Validation — prove the task.** You describe a task or hunch — *"add an index to
  orders.email"* — and Minerva decides what evidence would confirm or refute it, runs the queries,
  and returns one decisive verdict: **Confirmed**, **Refuted**, or **Inconclusive**. When it
  refutes, it redirects you to what actually matters.

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
opportunity you choose into a durable artifact: a new task is never a blank ticket — it arrives
populated with the Dynatrace evidence, queries, and quantified payoff behind it.

## What Makes It Different

- **Fully data-driven** — all decisions are made with data. Whether you're picking the next
  thing to try or validating a task you already had in mind, the answer is populated with data
  from Dynatrace, not opinion.
- **Objective-driven, not metric-driven** — the unit of interaction is a *goal*; the output is a
  *ranked action with justification*.
- **It does the analysis, not just the query** — it plans, branches, correlates across services,
  and ranks by impact-to-effort. A saved dashboard cannot do this.
- **Every claim is sourced** — each finding links to the exact DQL and result. Confidence is
  calibrated; the contrary evidence (dissent) is always shown.
- **It acts** — the chosen opportunity becomes a Dynatrace notebook / ticket / PR.

## Architecture

Minerva is a **single optimization agent** (one Gemini 2.5 Flash `LlmAgent`) that, given an
objective, autonomously runs a multi-step, branching investigation over Dynatrace and
synthesizes the evidence into a ranked recommendation. The MVP targets one objective —
**Improve Performance** — with Cost, Reliability, and Scale objectives to follow.

Dynatrace is both the **source** (Grail data the agent reasons over) and a **sink** (the agent's
own OTel telemetry + the notebooks it writes).

```
React web app (SSE)  ──▶  Minerva agent (TypeScript · @google/adk · Gemini 2.5 Flash)
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
| Agent model | Gemini 2.5 Flash |
| Orchestration | Google ADK (TypeScript, `@google/adk`) |
| Runtime source (reads) | Dynatrace MCP Server |
| Action layer (writes) | `dtctl` (Dynatrace CLI) |
| Self-observability | OpenTelemetry → Dynatrace (OTLP) |
| Transport | Hono REST + Server-Sent Events (Node locally, Vercel function in prod) |
| Frontend | React (build-free, CDN + in-browser Babel) |

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
- A Gemini API key (Google AI Studio) on a Google Cloud project
- Dynatrace environment with API access (a free trial tenant works)
- `dtctl` installed and authenticated (`dtctl auth login`) — only needed for notebook export

### Setup

```bash
npm install

# Configure environment (only needed for live-agent mode and export)
cp .env.example .env
# Edit .env with your Dynatrace and Google Cloud credentials

# Fixture-backed demo (no credentials needed) — site + API on one origin
npm run dev          # http://localhost:8787

# Live agent against a real tenant (requires .env + seeded data, see demo-app/)
npm run dev:live
```

### Environment Variables

```
DT_ENVIRONMENT=https://your-env.apps.dynatrace.com
DT_GRAIL_QUERY_BUDGET_GB=10
GOOGLE_CLOUD_PROJECT=your-project-id
GEMINI_API_KEY=your-gemini-key
```

## Demo

**Discovery**, end to end:

1. **Set the goal** — user picks "Improve Performance"
2. **The agent investigates** — a visible plan executes step by step across Dynatrace (rank
   services by latency → drill slow endpoints → spans → DB hotspots → correlate deploys)
3. **The payoff** — a ranked opportunity board sorted by impact × effort, each card with source
   DQL, projected before→after, confidence, and dissent
4. **Act** — export the chosen opportunity as a Dynatrace notebook

Hero opportunity: *"checkout /pay — 65% of p95 is one unindexed DB query"* → p95 4.2s → 1.5s (−64%).

**Validation**, the reverse direction: validate the task *"Add an index to orders.email"* → Minerva
runs the confirm/refute queries and returns **Refuted** (that lookup is ~4% of `/pay` latency),
then redirects to the query that actually dominates — the task is invalidated, but the decision
stays data-driven.

The hosted demo replays recorded fixtures captured from real agent runs (the trial tenant expires
during judging); the live agent path (`npm run dev:live`) runs the same engine against a real
tenant.

## Hackathon

Built for the [Google Cloud Rapid Agent Hackathon](https://rapid-agent.devpost.com/) — Dynatrace Track.
Rules and compliance checklist: [hackathon-rules.md](hackathon-rules.md) ·
Submission text: [SUBMISSION.md](SUBMISSION.md)

## License

[Apache 2.0](LICENSE)
