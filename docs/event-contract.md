# Minerva — Agent Event Contract

This is the seam between the **Minerva agent** and the **React frontend**. The agent runs an
objective investigation and streams typed events; the frontend renders the investigation live.
The TypeScript source of truth is [`src/contract.ts`](../src/contract.ts) — both the agent and
the web app import it, so the contract cannot drift. A replayable sample stream lives at
[`fixtures/improve-performance.jsonl`](../fixtures/improve-performance.jsonl).

Status: **locked (M0)**. Changes must be additive (new optional fields / new event types).

## Transport

- **Protocol:** Server-Sent Events (SSE). One-way agent → UI stream.
- **Server:** a small [Hono](https://hono.dev) app (native SSE helper, runs on Cloud Run).
- **Framing:** every SSE message carries one JSON `AgentEvent` in its `data:` field. Events are
  a **discriminated union on `type`**. The frontend uses `EventSource` and `JSON.parse`s each
  message.

## REST surface

```
POST /objectives
  body: { kind: ObjectiveKind, statement: string, scope?: { serviceId?: string } }
  → 201 { runId: string }

GET  /objectives/{runId}/events
  → 200 text/event-stream            # SSE stream of AgentEvent (see below)

POST /objectives/{runId}/opportunities/{oppId}/export
  body: { kind: "notebook" }
  → 200 { url: string }              # also emits action.completed on the stream
```

`ObjectiveKind` is one of: `improve-performance`, `cut-cost`, `reduce-errors`,
`kill-dead-code`, `prepare-for-scale`, `improve-delivery`, `custom`. The MVP implements
`improve-performance`; the rest appear in the gallery as roadmap.

## Event envelope

Every event shares these base fields:

| Field | Type | Notes |
|---|---|---|
| `type` | string | The discriminator (see the union below). |
| `runId` | string | Identifies the objective run. |
| `seq` | integer | **Monotonic per run, starting at 1.** The FE orders/dedupes on this. |
| `ts` | string | ISO-8601 timestamp. |

## Event union

A well-formed run is: `run.started` → `plan.proposed` → (`step.started` → `step.completed`\|`step.failed`)\*
→ (`opportunity.added`)\* → `board.ready` → `run.completed`. `action.completed` follows an
export request; `error` may appear on failure.

| `type` | Payload (beyond base fields) | Meaning |
|---|---|---|
| `run.started` | `objective: { kind, statement, scope? }` | The run has begun. |
| `plan.proposed` | `steps: { id, description }[]` | The 3–6 step plan, emitted **before** querying. |
| `step.started` | `stepId` | A plan step began executing. |
| `step.completed` | `stepId, dql, resultSummary, durationMs, rowCount?, deepLink?` | A step finished; `dql` is clickable, `resultSummary` is one line. |
| `step.failed` | `stepId, message` | A step errored (the run may continue). |
| `opportunity.added` | `opportunity: Opportunity` | A finding, streamed **as it is discovered**. |
| `board.ready` | `rankedOpportunityIds: string[]` | Final **impact × effort** ordering; every id matches an emitted opportunity. |
| `action.completed` | `opportunityId, kind, url` | An export produced a durable artifact. |
| `run.completed` | `totalDurationMs, queryCount, estCost?` | Terminal event; closes the stream. |
| `error` | `stage, message` | `stage` ∈ `plan` \| `investigate` \| `rank` \| `export`. |

## `Opportunity`

```ts
{
  id: string;
  finding: string;                       // one sentence
  impact: {
    metric: string; before: number; after: number; unit: string;
    assumption: string;                  // never omitted — the estimate's dependency
  };
  effort: 'low' | 'medium' | 'high';
  confidence: 'high' | 'medium' | 'low';
  confidenceReason: string;
  dissent: string;                       // contrary signal, always present ("" if none)
  recommendedAction: string;
  evidence: Evidence[];
}
```

## `Evidence`

Per the M0 decision, evidence carries **DQL + a scalar summary + a deep-link** — **not** raw
timeseries. The frontend renders before→after bars from `impact.before/after` and renders
evidence as query + one-line result + an open-in-Dynatrace link.

```ts
{
  id: string;
  source: 'DYNATRACE' | 'DAVIS' | 'INFERRED' | 'ASSUMPTION';   // matches the agent's evidence tags
  label: string;                         // "latency by endpoint"
  resultSummary: string;                 // "/pay p95 4.2s"
  dql?: string;                          // present for DYNATRACE / DAVIS
  deepLink?: string;                     // open-in-Dynatrace URL
  confidence: 'high' | 'medium' | 'low';
}
```

> If a real latency chart later proves important for the demo's visual punch, add an optional
> `Evidence.series?` — this is additive and non-breaking.

## Validation

[`src/contract.ts`](../src/contract.ts) exports `validateAgentEvent(value): string[]` (empty =
valid) and the `isAgentEvent(value)` type guard. The contract test
([`src/contract.test.ts`](../src/contract.test.ts)) replays the fixture through these and asserts
stream well-formedness (monotonic `seq`, terminal `run.completed`, every `board.ready` id
resolved). Reuse the same validator server-side to reject malformed payloads.

## Frontend dev harness

The frontend can be built end to end with **no live agent**: read
`fixtures/improve-performance.jsonl`, emit each line with a delay derived from its `ts` (or a
fixed cadence), and feed it to the same render path used for the live `EventSource`. This is what
unblocks M5 in parallel with the backend.
