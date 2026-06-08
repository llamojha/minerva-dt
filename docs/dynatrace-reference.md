# Minerva — Verified Dynatrace Reference

**Source of truth for all DQL and Dynatrace tooling in Minerva.**

This doc synthesizes Dynatrace's *official* Agent Skills (the `dynatrace-for-ai` repo) and
the `dtctl` CLI into a Minerva-specific reference. Every query below comes from Dynatrace's
published, maintained skills, not from guesses. The agent's behavior and system prompt live in
[`minerva/04-agent-logic.md`](minerva/04-agent-logic.md); this file is the verified query layer it draws on.

## Installed assets (this repo)

| Asset | Location | Purpose |
|-------|----------|---------|
| 15 `dynatrace-for-ai` skills | `.agents/skills/dt-*` (symlinked into `.claude/skills/`) | Verified DQL + tool guidance, progressive disclosure |
| `dtctl` skill | `.claude/skills/dtctl` | How an agent drives the Dynatrace CLI |
| `dtctl` binary | `brew` (`/opt/homebrew/bin/dtctl`, v0.28.1) | Live platform read/write (queries + create dashboards/notebooks/workflows) |

Skills load progressively: catalog (~100 tokens) → `SKILL.md` (<5k tokens) → `references/*`
on demand. They are **knowledge only** — live access comes from `dtctl` or the Dynatrace MCP server.

The deepest detail lives in each skill's `references/` directory (e.g.
`dt-dql-essentials/references/semantic-dictionary.md`, `dt-obs-tracing/references/failure-detection.md`).
Load those on demand — don't inline them here.

---

## ⚠️ Common DQL corrections

These are the mistakes most often made when writing DQL from memory. The verified forms below
come from Dynatrace's published skills — fix these before writing the agent's system prompt:

| Wrong / unverified | Verified correct form | Notes |
|---|---|---|
| `fetch <traces>` via "get_traces" tool | `fetch spans` | No dedicated trace tool — everything is DQL |
| `dt.entity.service` (in filters & `by:`) | `dt.smartscape.service` | `dt.entity.*` is **deprecated** everywhere |
| `otel.status_code == "ERROR"` | `request.is_failed == true` | Use the failure boolean on root spans |
| `loglevel` (this one was right) | `loglevel` | ✅ Correct — NOT `log.level` |
| `dt.service.request.response_time` "(ms)" | same metric, **microseconds** | Divide by 1000 for ms; `duration` on spans is **nanoseconds** |
| `list_problems` / `get_problem_details` (problem-only) | `fetch dt.davis.problems` | Problems are a queryable data object; richer than the old tools |
| problem fields `title`/`status`/`severity` | `event.name` / `event.status` / `event.category` | SQL-style names don't exist |
| `event.status == "OPEN"` | `event.status == "ACTIVE"` | "OPEN" silently returns nothing |
| Smartscape "Preview, syntax may change" | `smartscapeNodes "SERVICE"` + `traverse` | Stable patterns; see migration skill |

Universal pitfalls (from `dt-dql-essentials`): use `==` not `=`; static arrays use `{}` /
`array()` not `[]` (`[]` wraps sub-queries); `percentile`/`median` **require `rollup:`** or return
empty; always set a `from:` timeframe; `lower()` not `toLowercase()`; `stringLength()` not `length()`.

---

## Verified DQL by investigation area

Minerva's investigation loop pulls evidence from these areas to find and rank optimization
opportunities. Each maps to a skill (load it for the full pattern set) and a canonical query.
All queries assume a scoped `from:` and a resolved service Smartscape ID.

### 1. Service health — RED metrics
**Skill:** `dt-obs-services` · metric unit = **microseconds**

```dql
timeseries {
  p95 = percentile(dt.service.request.response_time, 95, rollup: avg),
  total_requests = sum(dt.service.request.count),
  failures = sum(dt.service.request.failure_count)
}, by: {dt.service.name}
| fieldsAdd p95_ms = p95[] / 1000, error_rate_pct = (failures[] * 100.0) / total_requests[]
```
Key metrics: `dt.service.request.response_time`, `.count`, `.failure_count`. Ranking services by
latency contribution here is the entry point for the "improve performance" objective.

### 2. Slow / failing requests — the failure path
**Skill:** `dt-obs-tracing` · span `duration` = **nanoseconds**, compare with literals like `5s`

```dql
fetch spans, from: now() - 2h
| filter request.is_root_span == true and request.is_failed == true
| fields start_time, trace.id, endpoint.name, http.response.status_code, duration
| sort start_time desc
| limit 100
```
Failure reason breakdown via `dt.failure_detection.results[reason]` (`http_code`, `exception`,
`grpc_code`, `span_status`, `custom_rule`). Exceptions live in `span.events` (`exception.type`),
accessed with `iAny()` + `expand`.

### 3. Database hotspots — where latency concentrates
**Skill:** `dt-obs-tracing` (client spans, `db.system` / `db.statement`)

```dql
fetch spans, from: now() - 2h
| filter span.kind == "client" and isNotNull(db.system)
| summarize p95 = percentile(duration, 95, rollup: avg), calls = count(), by: { db.statement }
| sort p95 desc
| limit 10
```
This is the hero query for the demo's signature opportunity (an unindexed query / N+1 hotspot).

### 4. Topology — dependencies and blast radius
**Skill:** `dt-obs-tracing` (dependencies) + `dt-migration` (Smartscape navigation)

```dql
// Forward = what this service calls; backward = who calls it
smartscapeNodes "SERVICE"
| filter name == "checkout-service"
| traverse calls_service, "SERVICE", direction: forward
```
Live dependency edges from spans (no topology needed):
```dql
fetch spans, from: now() - 1h
| filter span.kind == "client" and isNotNull(http.request.method)
| summarize calls = count(), p99 = percentile(duration, 99, rollup: avg),
    by: { dt.service.name, server.address }
| sort calls desc
```

### 5. Runtime → code
**Skill:** `dt-obs-tracing` (`code.namespace`, `code.function` on spans) + repo demo data.
Dynatrace gives you the failing/slow operation/endpoint and code attributes; the repo mapping
(repo, owner) is Minerva's own demo data layer — Dynatrace MCP does **not** provide it.

### 6. Recent changes — deploy correlation
**Skill:** `dt-obs-problems` (correlation) + events. Deployment events:
```dql
fetch events, from: now() - 24h
| filter event.kind == "DAVIS_EVENT" and contains(event.type, "DEPLOYMENT")
| sort timestamp desc | limit 5
```
Then split the window before/after the deploy timestamp and compare RED metrics — this is
exactly the `dt-performance-regression` prompt's algorithm (>20% p95 or >1pp error = regression).
Useful both for attributing a regression and for sizing the payoff of reverting/fixing.

### 7. Problems & root cause — Davis
**Skill:** `dt-obs-problems` · always `filter not(dt.davis.is_duplicate)`

```dql
fetch dt.davis.problems, from: now() - 2h
| filter not(dt.davis.is_duplicate) and event.status == "ACTIVE"
| fields display_id, event.name, event.category, event.start,
    root_cause_entity_name, dt.davis.affected_users_count, smartscape.affected_entity.ids
| sort dt.davis.affected_users_count desc
```
`event.category` ∈ {AVAILABILITY, ERROR, SLOWDOWN, RESOURCE, CUSTOM}. Davis gives you root
cause + affected entities for free — the strongest "evidence-grounded" source for the
"reduce errors" objective.

### 8. Validation — proving the payoff
**Skill:** `dt-obs-services` (re-run RED) + `dt-obs-predictive-analytics` (confirm trend).
For an opportunity's projected impact, baseline the relevant RED/DB query now; after the action
ships, re-run it for a post-change window and diff. `dt-obs-predictive-analytics` adds rigor:
`timeseries-novelty-detection` confirms the signal's character actually changed (not a momentary
dip) — turning a projected payoff into a proven one.

---

## Beyond chat: `dtctl` as Minerva's action layer

The hackathon's #1 goal is *use tools to accomplish a task, not just answer*. Minerva's "beyond
chat" moment is **acting on the chosen opportunity** — it exports the ranked opportunity as a
durable Dynatrace artifact rather than leaving a chat message that scrolls away. `dtctl` is the
action layer:

| Action | `dtctl` | Minerva use |
|--------|---------|-----------|
| Run DQL | `dtctl query "fetch dt.davis.problems ..."` | Every investigation step |
| Create notebook | `dtctl create notebook ...` (skill: `dt-app-notebooks`) | Export the chosen opportunity (finding + source DQL + projected impact) as a shareable artifact |
| Create dashboard | `dtctl create dashboard ...` (skill: `dt-app-dashboards`) | Track the targeted metric before/after the action |
| Workflows | `dtctl get/execute workflows` | Trigger or inspect remediation workflows |
| Agent I/O | `--agent` (JSON), `dtctl commands` (catalog) | Machine-readable for the Gemini agent |

Auth before use: `dtctl auth login --context <name> --environment https://<env>.apps.dynatrace.com`,
then `dtctl doctor` to verify.

---

## Official prompts = reusable query skeletons

In the `dynatrace-for-ai` repo `prompts/` (not copied here — reference upstream):

| Prompt | Maps to Minerva |
|--------|---------------|
| `dt-performance-regression` | Change-correlation algorithm: deploy boundary, before/after RED, sizing the payoff of a fix |
| `dt-health-check` / `dt-daily-standup` | Reusable service-health framing for ranking by latency/error contribution |
| `dt-troubleshoot-problem` | Problem → logs → traces structured drilldown for the "reduce errors" objective |
| `dt-investigate-error` | Davis problems as entry point → logs → traces |
| `dt-incident-response` | The generic investigate→report flow — useful query patterns, but reactive |

**Strategic takeaway:** Dynatrace's prompts answer *"what is happening?"* reactively. Minerva's
novelty is the layer above: given a **goal**, autonomously find the *highest-leverage* place to
act, quantify the payoff with evidence, and create the artifact in-platform via `dtctl`.

---

## Skill catalog (all installed)

`dt-dql-essentials` · `dt-obs-services` · `dt-obs-tracing` · `dt-obs-problems` · `dt-obs-logs`
· `dt-obs-hosts` · `dt-obs-kubernetes` · `dt-obs-frontends` · `dt-obs-predictive-analytics`
· `dt-obs-aws` · `dt-obs-azure` · `dt-obs-gcp` · `dt-app-dashboards` · `dt-app-notebooks`
· `dt-migration` · (+ `dtctl`)
