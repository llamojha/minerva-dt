# Product Context

## What is Minerva?

Minerva is an objective-driven optimization agent. You state an engineering goal ("improve
performance", "cut cost", "reduce errors"); Minerva autonomously investigates your Dynatrace
data, finds the highest-leverage opportunities, quantifies the payoff, proves it with evidence,
and turns the chosen opportunity into action.

## Core Promise

> You bring the goal. Minerva finds the wisest move, proven by your data.

Dynatrace has the runtime truth. Minerva finds the single best lever to pull toward your goal —
in minutes, with a defensible, sourced recommendation, instead of days of manual dashboard hunting.

## Target Users

- **Data-driven engineer / tech lead** — wants to know where to spend effort to hit a goal, and why
- **Engineering manager** — wants effort allocated by quantified impact, not opinion
- **SRE / platform engineer** — wants the highest-leverage performance/cost/reliability win, evidenced

## Product Principles

1. **Objective-driven, not metric-driven** — the unit of interaction is a *goal*; the output is a *ranked action with justification*
2. **It does the analysis, not just the query** — it plans, branches, correlates, and ranks by impact-to-effort
3. **Every claim is sourced** — each finding links to the exact DQL and result; confidence is calibrated; the contrary evidence (dissent) is always shown
4. **It acts** — the chosen opportunity becomes a Dynatrace notebook / ticket / PR, not a chat message
5. **A single agent that does the whole loop** — one Gemini 2.5 Pro agent plans, branches, ranks, and synthesizes; "multi-step" is the branching investigation within the task, not multiple agents

## Architecture framing

Minerva = a **single optimization agent** (one Gemini 2.5 Pro `LlmAgent`, one system prompt) that
runs a multi-step, branching investigation and synthesizes a ranked recommendation. MVP targets
**one objective, Improve Performance**; post-MVP adds more objectives (Cost, Reliability, Scale).
Per-objective specialist sub-agents are a post-MVP possibility only — not the MVP architecture.

## Hackathon Track

Google Cloud Rapid Agent Hackathon — Dynatrace Track. Deadline: June 11, 2026.

## Non-Goals

- Not a monitoring/alerting replacement (Dynatrace already does that)
- Not an incident responder — Minerva is proactive and goal-driven
- Not auto-remediation without consent — Minerva recommends and, on approval, acts
- Not a generic chatbot over metrics — it is structured around objectives and opportunities
