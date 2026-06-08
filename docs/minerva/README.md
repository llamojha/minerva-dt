# Minerva — AI Context Index

**Minerva is an objective-driven optimization agent.** You set an engineering goal
("improve performance", "cut cost", "reduce errors"); Minerva autonomously investigates
your Dynatrace data, finds the highest-leverage opportunities, quantifies the payoff,
proves it with evidence, and turns the chosen opportunity into action.

> You bring the intent. Dynatrace has the truth. Minerva finds the lever to pull.

## Documents

| Doc | Purpose |
|-----|---------|
| [00-goal.md](00-goal.md) | North star: problem, solution, positioning, success criteria |
| [01-prd.md](01-prd.md) | Product requirements: users, flows, functional reqs, MVP scope, demo |
| [02-design.md](02-design.md) | UX: principles, screens, the signature visual, interaction model |
| [03-architecture.md](03-architecture.md) | Technical: stack, agent design, data, tools, deployment |
| [04-agent-logic.md](04-agent-logic.md) | Agent behavior: the investigation loop, system prompt, evidence model |

## Working assumptions (veto any of these)

These are decisions made to unblock writing. Change them and the docs follow.

| Decision | Choice | Rationale |
|---|---|---|
| **Name** | **Minerva** | Roman goddess of wisdom & strategy — the strategist who turns knowledge into the wisest move. Knowledge-driven, fits a data-first product; no AWS-Athena clash. |
| **Architecture framing** | Minerva = a single optimization agent running a multi-step, branching investigation | One Gemini 2.5 Pro `LlmAgent`, one system prompt; "multi-step" is the branching investigation within the task, not multiple agents. MVP targets one objective (Performance); more objectives to follow. |
| **Stack** | TypeScript + @google/adk, Gemini 2.5 Pro; React web frontend | Official first-party TS ADK; shares the event-contract types with the frontend (one source of truth) |
| **Hero objective (MVP)** | "Improve Performance" | Most visual, easiest to seed (RED + traces + DB spans) |
| **Data** | Real Dynatrace trial tenant + seeded demo app | Mocked data risks failing the stage-one judging gate |
| **Reads** | Dynatrace MCP server (`execute_dql`, problems, etc.) | Required partner integration |
| **Writes ("beyond chat")** | `dtctl` — export opportunity as a Dynatrace notebook | The agent acts, not just advises |
| **Self-observability** | OTel → Dynatrace (agent traces/token cost) | Dual read+write; the integration DT judges reward |

## Hackathon fit (Google Cloud Rapid Agent — Dynatrace Track, due Jun 11 2026)

- **Gemini + Agent Builder:** ✅ core
- **Dynatrace essential:** ✅ no runtime data = no opportunities = no product
- **Beyond chat / multi-step:** ✅ fuzzy goal → investigation plan → DQL → ranked actions → write-back
- **Web platform:** ✅ React app, hosted URL

## Status

🟡 Concept locked, specs in progress. Implementation not started (old `src/` is an empty TS skeleton to be replaced).
