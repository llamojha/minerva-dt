---
description: Review Minerva against Google Cloud Rapid Agent Hackathon judging criteria
---

Review the Minerva project against the official Google Cloud Rapid Agent Hackathon judging criteria and submission requirements.

## Context

Read `hackathon-rules.md` and the specs under `docs/minerva/` (`00-goal.md`, `01-prd.md`, `02-design.md`, `03-architecture.md`, `04-agent-logic.md`) for full context.

## Stage One: Pass/Fail Gate

Verify all mandatory requirements are met:

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Gemini-powered agent | | |
| Google Cloud Agent Builder used | | |
| Dynatrace MCP integration (meaningful, not decorative) | | |
| Hosted project URL available | | |
| Public repo with open source license (visible in About) | | |
| Demo video ≤3 min (YouTube/Vimeo, public, English) | | |
| Runs on web, Android, or iOS | | |
| New project (created during contest period) | | |
| No competing AI tools (only Google Cloud AI + Dynatrace built-in) | | |
| No competing cloud services | | |
| Text description with features, tech, data sources, learnings | | |
| Devpost form completed | | |

**Verdict**: PASS / FAIL (with blockers listed)

## Stage Two: Judging Criteria (Equal Weight)

### 1. Technological Implementation

> Does the interaction with Google Cloud and Partner services demonstrate quality software development?

Evaluate:
- Quality of Gemini agent integration (reasoning, planning, tool use)
- Depth of Google Cloud Agent Builder usage (orchestration, grounding, deployment)
- Depth of Dynatrace integration — reads (MCP `execute_dql`) AND writes (dtctl notebook export, OTel self-telemetry); not decorative
- Code quality, architecture, error handling
- Multi-step agentic workflow (objective → plan → investigate → rank → prove → act)
- Evidence model (every opportunity links to source DQL; payoff stated with assumptions; calibrated confidence + dissent)

### 2. Design

> Is the user experience and design of the project well thought out?

Evaluate:
- User flow clarity (objective picker → investigation stream → opportunity board → act)
- Output quality and readability (ranked opportunity cards, impact projections, the leverage map)
- Clarity of the impact × effort ranking and the signature leverage-map visual
- Information hierarchy and evidence presentation (source DQL, confidence, dissent)
- User control and oversight throughout the workflow
- Visual design of generated artifacts and the exported Dynatrace notebook

### 3. Potential Impact

> How big of an impact could the project have on target communities?

Evaluate:
- Real-world applicability to engineering prioritization and optimization
- Time savings vs. manual dashboard hunting to find the highest-leverage move
- Value across objectives (performance, cost, reliability, scale) via the objective-driven model
- Scalability beyond the demo scenario
- Addresses a genuine pain point (effort mis-allocated on opinion, not runtime evidence)

### 4. Quality of the Idea

> How creative and unique is the project?

Evaluate:
- Novelty of the objective-driven optimization approach (goal in → ranked, proven action out)
- Creative use of Dynatrace as runtime source of truth (not just another dashboard)
- Multi-step investigation with calibrated confidence, stated assumptions, and shown dissent
- The impact × effort "leverage map" framing as a decision aid
- A single agent that turns a goal into a ranked, evidence-backed plan (objective-driven, not multi-agent)
- Differentiation from generic AI summarizers and smarter dashboards

## Output Format

```
# Hackathon Review: Minerva

## Stage One: Pass/Fail
**Verdict**: PASS / FAIL

| Requirement | ✅/❌ | Notes |
|-------------|-------|-------|
...

## Stage Two: Criteria Scoring

### Technological Implementation
**Rating**: Strong / Adequate / Weak
- [specific findings]

### Design  
**Rating**: Strong / Adequate / Weak
- [specific findings]

### Potential Impact
**Rating**: Strong / Adequate / Weak
- [specific findings]

### Quality of the Idea
**Rating**: Strong / Adequate / Weak
- [specific findings]

## Strengths
- [top strengths for winning]

## Risks / Gaps
- [what could lose points or cause disqualification]

## Recommendations
- [specific actions to improve score]

## Submission Readiness
**Status**: Ready / Needs Work / Not Ready
**Blockers**: [list any]
```
