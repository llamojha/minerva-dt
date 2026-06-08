# Minerva — Product Requirements (PRD)

## 1. Summary

Minerva is an objective-driven optimization agent for engineering teams. The user selects or
states an **objective**; Minerva runs an autonomous, multi-step investigation across Dynatrace
runtime data, and returns a **ranked board of opportunities** — concrete, evidence-backed,
quantified actions toward that objective. The user can drill into the evidence and turn any
opportunity into a durable artifact (Dynatrace notebook, ticket, or PR).

MVP ships **one objective end-to-end — "Improve Performance"** — with the objective gallery
present to convey the platform vision.

## 2. Target users

| Persona | Need | Minerva value |
|---|---|---|
| **Staff / lead engineer** (primary) | Decide where to invest effort to hit a goal | Ranked, quantified, sourced opportunities in minutes |
| **SRE / platform engineer** | Find the real bottleneck, not the visible one | Cross-service investigation + impact ranking |
| **Engineering manager** | Justify roadmap with data | Defensible, exported decision artifacts |
| **Individual developer** | Know exactly what to fix and why | Drill-down to the offending query/endpoint/span + recommended action |

## 3. Core concept: the objective loop

Every objective runs the same loop with different evidence:

```
OBJECTIVE → PLAN → INVESTIGATE → ANALYZE & RANK → RECOMMEND → ACT
```

1. **Objective** — chosen from a gallery or entered free-form.
2. **Plan** — the agent states what evidence it will gather (visible to the user).
3. **Investigate** — multi-step DQL across Dynatrace (RED metrics, spans, DB spans,
   problems, topology), branching based on what it finds.
4. **Analyze & rank** — synthesize findings into discrete opportunities, scored by
   **impact × effort**, with **calibrated confidence** and **dissenting evidence**.
5. **Recommend** — present the ranked Opportunity Board; each card is fully sourced.
6. **Act** — export the chosen opportunity (notebook / ticket / PR) via `dtctl`.

## 4. Objective catalog

MVP implements **Improve Performance**. The others are designed identically and shown in the
gallery as the roadmap.

| Objective | Evidence gathered | Example opportunity |
|---|---|---|
| **Improve Performance** ✅ MVP | RED metrics, slow endpoints, slow spans, DB query spans | "65% of checkout p95 is one unindexed query" |
| Cut Cost | utilization vs. allocation, idle hosts, Grail ingest/service | "5 hosts at 11% util; log-shipper drives 40% of ingest" |
| Reduce Errors | error rate by endpoint, top exceptions, failure reasons | "1 timeout to payment-gw causes 42% of errors" |
| Kill Dead Code | per-endpoint traffic over 30d | "8 endpoints: 0 traffic in 30 days" |
| Prepare for Scale | saturation headroom, forecast, slow deps | "auth saturates at 2.3× current load" |
| Improve Delivery (DORA) | deploy events, change-failure rate, MTTR | "change-failure rate 18%, driven by cart" |

## 5. Key user flow (MVP: Improve Performance)

### Trigger
User opens Minerva and selects **"Improve Performance"** (optionally scoped to a service).

### Steps
1. Minerva confirms scope and **states its plan** ("I'll pull RED for services in scope, rank
   endpoints by latency contribution, drill the slowest spans, and check for DB hotspots").
2. Minerva **runs the investigation**, streaming progress as it queries Dynatrace.
3. Minerva **assembles the Opportunity Board** — ranked cards by impact × effort.
4. User **drills into** a card → full evidence (charts + the exact DQL + result).
5. User **acts** → exports the opportunity as a Dynatrace notebook.

### Output (per opportunity card)
- **Finding** — one sentence ("checkout `/pay` p95 is 4.2s; 65% is a single DB query")
- **Evidence** — chart(s) + linked source DQL
- **Estimated impact** — quantified, with the assumption stated ("≈ -2.7s p95, -64%")
- **Effort** — Low / Medium / High
- **Confidence** — High / Medium / Low + why
- **Dissent** — the contrary signal, if any
- **Recommended action** — concrete next step

### Success criteria
- Board returned in < 60s; every card sourced; at least one quantified payoff; one export.

## 6. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | Present an objective gallery + free-form objective entry | Must |
| FR-2 | Decompose an objective into a stated investigation plan | Must |
| FR-3 | Execute a multi-step DQL investigation via Dynatrace MCP | Must |
| FR-4 | Stream investigation progress to the UI in real time | Must |
| FR-5 | Synthesize findings into discrete, ranked opportunities | Must |
| FR-6 | Rank opportunities by impact × effort | Must |
| FR-7 | Quantify estimated payoff with a stated assumption | Must |
| FR-8 | Attach evidence + source DQL to every opportunity | Must |
| FR-9 | Show calibrated confidence and dissenting evidence | Should |
| FR-10 | Export an opportunity as a Dynatrace notebook via `dtctl` | Must |
| FR-11 | Export as a ticket / PR | Could |
| FR-12 | Self-instrument the agent (OTel → Dynatrace) | Should |
| FR-13 | Support objectives beyond Performance | Could (post-MVP) |

## 7. Non-functional requirements

- **Evidence integrity:** no claim without a source query; assumptions explicit.
- **Cost-aware querying:** scoped timeframes, `limit`, entity filters; respect Grail budget.
- **Latency:** objective → board under ~60s for the demo scope.
- **Trust:** confidence is calibrated; the agent says "insufficient data" rather than guessing.

## 8. MVP scope (for the hackathon)

In: one objective (Performance), one seeded demo app on a Dynatrace trial tenant, the live
investigation stream, the Opportunity Board with ranking + quantified impact + provenance,
and notebook export. Out: multi-objective depth, auth/multi-tenant, persistence beyond the
exported artifacts.

## 9. Demo script (3 minutes)

1. **Set the goal** — "Improve Performance" → establishes the premise (you bring intent).
2. **Watch it investigate** — the agent streams its plan + live DQL across services (proves
   it's agentic and Dynatrace-grounded).
3. **The reveal** — the Opportunity Board ranks by leverage; the #1 card is a *non-obvious*
   cross-service finding (proves reasoning, not querying).
4. **The proof** — drill in: the chart + the exact DQL + the quantified before→after impact.
5. **It acts** — export the opportunity to a Dynatrace notebook via `dtctl` (beyond chat;
   closes the loop back into Dynatrace).

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Reads as a "smart dashboard" | Lead with visible multi-step reasoning + a non-obvious finding |
| Design not memorable (weakest axis) | Signature "Leverage Map" visual + live investigation stream (see 02-design) |
| Mocked data fails the judging gate | Use a real trial tenant + seeded app |
| Impact estimates feel hand-wavy | Always state the assumption; mark confidence; show dissent |
| Scope creep across objectives | One objective flawless; gallery sells the rest |
