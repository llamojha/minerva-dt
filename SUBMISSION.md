# Minerva

**Decision intelligence for engineering, grounded in runtime truth.**

Google Cloud Rapid Agent Hackathon, Dynatrace track.

- **Live app:** https://minerva-dynatrace.vercel.app
- **Code:** <add public GitHub URL>
- **Demo video (3 min):** <add YouTube or Vimeo URL>

## Elevator pitch

An agent that turns engineering goals into evidence-backed decisions — it investigates Dynatrace production data, ranks the highest-impact actions, and validates planned work against real telemetry.

## Summary

Minerva is an objective driven optimization agent. You state an engineering goal in plain language, and Minerva autonomously investigates your production observability data in Dynatrace, finds the highest leverage place to act, quantifies the payoff with evidence, and turns the chosen move into a durable artifact. It also runs in reverse: give it a specific task or hunch, and it pulls the data to confirm, quantify, or refute it.

The unit of interaction is a decision, not a dashboard. Every claim links back to the exact query that produced it.

## The problem

Engineering teams set objectives constantly ("this quarter we improve performance," "we should add an index," "we need to cut cost"). The path from a goal to a justified action is broken in two ways:

1. Roadmaps get decided on opinion. The ground truth, which endpoint is actually slow, which query actually dominates, sits unused in observability data because mining it is hours of manual querying nobody has time for.
2. Dashboards answer "what is happening." They do not answer "given my goal, where is the single best move," and they cannot tell you when a planned task is not worth doing.

## What it does

Minerva has two entry modes that share one engine and one promise.

### Discovery: find the move
You pick an objective (the MVP ships "Improve Performance"). Minerva states a plan, then runs a multi step, branching investigation across Dynatrace: it ranks services by latency contribution, drills the slowest endpoints into their spans, isolates database hotspots, and correlates with recent deploys. It returns a ranked Opportunity Board, each card carrying a one sentence finding, a quantified before to after projection with its stated assumption, an effort and confidence rating, the contrary signal (dissent), a recommended action, and the source DQL behind every number.

In the demo, the number one opportunity is a non obvious cross service finding: roughly 65 percent of checkout `/pay` p95 latency is one unindexed query on the orders table, projecting p95 from 4.2s to about 1.5s.

### Validation: prove the task
You describe a task or hypothesis, for example "Add an index to orders.email." Minerva decides what evidence would confirm or refute it, runs the queries, and returns a single decisive verdict: Confirmed, Refuted, or Inconclusive. The strongest moment is a refutation: when the data says the task is not worth it (the orders.email lookup is only about 4 percent of `/pay` latency), Minerva does not just say no. It hands you what actually matters and a route straight back into Discovery on the real bottleneck. The task gets invalidated, but the decision stays data driven.

### Act, beyond chat
Any opportunity or verdict can be exported to a Dynatrace notebook, capturing the finding, the projection, and the re runnable source queries, so the decision lands back inside Dynatrace rather than scrolling away in a chat.

### Watches itself
A self observability footer reports what each Minerva run cost: tokens, wall clock time, number of DQL queries, and Grail data scanned.

## How we built it

Minerva is a single Gemini agent, not a multi agent stack. One model, one system prompt, running a branching investigation within the task. It is built end to end in TypeScript so the event contract is one shared module imported by both the agent and the web app.

- **The agent** uses the Google Agent Development Kit (ADK, Google Cloud Agent Builder). It is a single `LlmAgent` powered by Gemini on Google Cloud. The agent reports its plan, queries, findings, and verdict by calling typed local tools, so the autonomous run always emits clean, contract valid events rather than free text we have to parse.
- **The Dynatrace integration** is the agent's senses. Every query runs through the Dynatrace MCP server (`@dynatrace-oss/dynatrace-mcp-server`) as an ADK tool, executing DQL over Grail. A cost aware DQL guard keeps every query scoped (timeframe, entity filter, limit) and respects a Grail scan budget.
- **The transport** is a small Hono server exposing a REST plus Server Sent Events surface: start a run, then stream its events. The frontend renders the live stream with no change between fixture and live data.
- **The frontend** is a three screen experience (picker, live investigation stream, board or verdict) in a calm, editorial instrument panel aesthetic.
- **The act path** writes a Dynatrace notebook document for the chosen opportunity or verdict.
- **The video** is a programmatic Remotion walkthrough built from real screenshots of the running app.

## Under the hood: ADK + the Dynatrace MCP server, in code

### 1. The agent is one ADK `LlmAgent`

The whole agent is a single Gemini-powered `LlmAgent` from the Google Agent Development Kit — one model, one system prompt, one set of tools. No orchestrator layer, no sub-agents:

```ts
// src/agent/index.ts
import { LlmAgent, type FunctionTool } from '@google/adk';
import { MODEL, SYSTEM_PROMPT } from './prompt.js';   // MODEL = 'gemini-2.5-flash'

export function buildMinervaAgent({ tools, instruction = SYSTEM_PROMPT }: MinervaAgentDeps): LlmAgent {
  return new LlmAgent({
    name: 'minerva',
    description: 'Objective-driven optimization analyst over Dynatrace runtime data.',
    model: MODEL,
    instruction,   // discovery's SYSTEM_PROMPT, or VALIDATION_PROMPT in validation mode
    tools,
  });
}
```

The same agent serves both modes: Discovery and Validation differ only in the instruction and which terminal tools the model receives (`add_opportunity`/`finalize_board` vs `emit_verdict`).

### 2. Wiring the Dynatrace MCP server into ADK

The official `@dynatrace-oss/dynatrace-mcp-server` runs as a child process over stdio, wrapped in ADK's `MCPToolset`. Configuration is just the tenant URL, a platform token, and a hard Grail scan budget the MCP server enforces:

```ts
// src/dynatrace/index.ts
import { MCPToolset } from '@google/adk';

export function createDynatraceToolset(config = loadDynatraceConfig()): MCPToolset {
  return new MCPToolset({
    type: 'StdioConnectionParams',
    serverParams: {
      command: 'npx',
      args: ['-y', '@dynatrace-oss/dynatrace-mcp-server'],
      env: {
        ...process.env,
        DT_ENVIRONMENT: config.environment,            // https://<tenant>.apps.dynatrace.com
        DT_PLATFORM_TOKEN: config.platformToken,        // dt0s16… platform token
        DT_GRAIL_QUERY_BUDGET_GB: String(config.grailBudgetGb),  // hard cost ceiling
      },
    },
  });
}
```

### 3. Which MCP tools we use

The Dynatrace MCP server exposes ~20 tools. Minerva's read path uses exactly one — **`execute_dql`** — because the entire investigation is expressed as DQL over Grail (spans, `dt.service.request.*` metrics, DB statement spans, deployment events, Davis problems). The runner discovers it from the live toolset at startup:

```ts
// src/agent/run.ts
const toolset = createDynatraceToolset();
const all = await toolset.getTools();
const executeDql = all.find((t) => t.name === 'execute_dql');
if (!executeDql) throw new Error(`execute_dql not found; available: ${all.map((t) => t.name).join(', ')}`);
```

(The "act" path — exporting a finding as a Dynatrace notebook — writes through `dtctl`, the Dynatrace CLI, keeping the MCP integration a pure read/sense path under the agent's control while the write stays user-triggered.)

### 4. How the agent actually looks for information

We deliberately do **not** hand `execute_dql` to the model raw. It's wrapped in a local `run_query` tool that (a) lints every query with a cost guard, (b) executes through the MCP server, (c) emits a contract-valid `step.completed` event for the live UI stream, and (d) returns the rows *plus the guard warnings* to the model so it can self-correct:

```ts
// src/agent/tools.ts
const runQuery = new FunctionTool({
  name: 'run_query',
  description: 'Execute one scoped, cost-aware DQL query against Dynatrace and return its rows. ' +
    'Tag it with the plan stepId it advances. Always include from:, a filter, and limit.',
  parameters: runQuerySchema,                    // { stepId, label, dql }
  execute: async (input, toolContext) => {
    const { stepId, label, dql } = input;
    const guarded = guardDql(dql);               // lints from:/filter/limit — never rewrites
    emit({ type: 'step.started', stepId });
    const result = await executeDql.runAsync({ args: { [argKey]: guarded.dql }, toolContext });
    const { rows, rowCount, grailGb } = parseMcpResult(result);   // rows from _meta.records,
    stats.queryCount += 1;                                        // cost from _meta.scannedBytes
    stats.grailGbScanned += grailGb;
    emit({ type: 'step.completed', stepId, dql: guarded.dql,
           resultSummary: `${label}: ${rowCount} rows`, durationMs, rowCount });
    return { rows, rowCount, warnings: guarded.warnings };        // model sees rows + warnings
  },
});
```

The model authors the DQL itself, guided by verified patterns in the system prompt. A typical step it runs while isolating the database hotspot:

```sql
fetch spans, from: now()-30m
| filter span.kind == "client" and isNotNull(db.statement)
| summarize p95_ns = percentile(duration, 95, rollup: avg), calls = count(), by: { db.statement }
| fieldsAdd p95_ms = p95_ns / 1000000
| sort p95_ns desc
| limit 10
```

This is the query that surfaces the hero finding: the unindexed `SELECT * FROM orders WHERE lower(email) = …` dominating checkout `/pay` p95.

All of the agent's *structured* output flows the same way — `emit_plan`, `add_opportunity`, `finalize_board`, `emit_verdict`, and `note_insufficient_data` are typed ADK `FunctionTool`s whose side-effect is emitting a contract event onto the SSE stream. The model never produces free text we have to parse, and when the data can't support a conclusion it must call `note_insufficient_data` rather than fabricate.

```text
Gemini 2.5 Flash (LlmAgent)
   │  tool call: run_query({ stepId, label, dql })
   ▼
guardDql lint ──▶ Dynatrace MCP server (execute_dql) ──▶ Grail
   │                         │
   │   rows + scan cost ◀────┘
   ▼
step.completed event ──▶ SSE stream ──▶ live investigation UI
```

## Data sources

- **Dynatrace Grail**, queried with DQL through the Dynatrace MCP server: distributed spans, service request metrics (`dt.service.request.*`), database statement spans, deployment events, and Davis problems.
- **Synthetic OpenTelemetry telemetry** generated into a Dynatrace trial tenant to plant a realistic demo scenario (a checkout service with an unindexed orders query hotspot and an N+1 pattern), ingested over OTLP.
- **Recorded event fixtures** captured from real runs, so the hosted demo and offline development reproduce the full experience without a live tenant. This matters because the trial tenant expires during the judging window; the public deployment is fixture backed by design so it never shows judges an empty board.

## Challenges we ran into

- Keeping an autonomous agent reliable. We made all structured output flow through typed tool calls, so the model's plan, evidence, and verdict are always contract valid, never parsed from prose.
- Teaching the model correct DQL. Metrics must be queried with `timeseries` and data objects with `fetch`; we hardened the system prompt with verified query patterns and a non mutating cost guard after the model produced invalid queries.
- Serverless streaming. Running a streaming Server Sent Events API on a serverless platform required making every run stateless (the run encodes its own state) and hand bridging the request and response so the stream stays incremental.
- Honest validation. The refuted path had to take a stance and then redirect to the real win, which is what makes Validation feel like one product with Discovery rather than a bolt on.

## Accomplishments we are proud of

- A genuinely two way product: discovery and validation under one north star, be data driven.
- The refute and redirect moment, where invalidating a task still leaves the user with the right next move.
- Every claim is sourced. No number appears without the query that produced it and the assumption it depends on.
- The agent never fabricates: when the data cannot support a conclusion, it says so (the Inconclusive verdict and the insufficient data path).

## What we learned

- The word "objective" was hiding a second mode. Most engineers arrive with a hypothesis, not a blank goal, so validation is often the sharper pain. Treating discovery and validation as two doors to the same evidence backed decision made the product clearer.
- Surfacing dissent and assumptions on every card builds more trust than a confident single number.

## What's next

- A live validation agent prompt so the verdict is produced live as well as from fixtures.
- More objectives beyond performance (cut cost, reduce errors, prepare for scale), each the same loop over different evidence.
- Self observability written back to Dynatrace over OTLP, closing the loop both ways.

## Built with

TypeScript, Gemini, Google Cloud, Google Agent Development Kit (Agent Builder), Dynatrace, Dynatrace MCP server, DQL, Grail, OpenTelemetry, Hono, Server Sent Events, React, Remotion.
