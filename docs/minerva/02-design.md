# Minerva — Design

Design is ~25% of the hackathon score and Minerva's weakest axis if it ships as "ranked
cards." This doc exists to make Minerva **memorable**, not just clean.

## Design principles

1. **Show the thinking.** The agent's reasoning is the product. Never hide it behind a
   spinner — render the investigation as it happens.
2. **Leverage is the metaphor.** Everything maps to *impact vs. effort*. The hero visual is
   a leverage map, not a table.
3. **Evidence is one click away, always.** Every number is a link to the query that made it.
4. **Calm under data.** Lots of signal, presented quietly; color and motion reserved for the
   few things that matter (the top opportunity, the impact projection).

## The three screens

### 1. Objective picker (entry)
A clean gallery of objective cards (Improve Performance, Cut Cost, Reduce Errors, …) plus a
free-form "Set your own objective" input. Selecting one optionally lets you scope to a
service. Minimal — the point is to get to the work fast.

### 2. The Investigation Stream (the "it's an agent" beat)
After the objective is set, the user watches Minerva work. Not a chat log — a structured,
animated **plan that executes**:

```
OBJECTIVE: Improve Performance · scope: all services

▸ Plan
  1. Rank services by latency contribution
  2. Drill slowest endpoints → spans
  3. Check database hotspots
  4. Correlate with recent deploys

▸ Investigating…
  ✓ RED metrics for 6 services            (DQL ↗)   1.2s
  ✓ checkout is 58% of total p95           (DQL ↗)   0.8s
  ⟳ slow spans for checkout /pay …
  ○ database hotspots
```

Each step shows the query it ran (clickable), its result in one line, and timing. This is
the moment that proves Minerva *reasons* — it visibly plans, branches, and gathers.

### 3. The Opportunity Board (the payoff)
A ranked list of opportunity cards. Default sort: **impact × effort**.

```
┌─ #1  ★ High leverage ───────────────────────────────────┐
│ checkout /pay — 65% of p95 is one unindexed DB query     │
│ ┌───────────── before → after ─────────────┐            │
│ │ p95  4.2s ███████████▌                    │  Effort ▎Low │
│ │      1.5s ████        (est. −64%)         │  Conf  ●High │
│ └───────────────────────────────────────────┘            │
│ Evidence: latency-by-endpoint ↗ · slow-span ↗ · query ↗  │
│ Dissent: traffic is low off-peak — impact concentrates 9–5│
│ ▸ Recommended: add index on orders(status, created_at)   │
│ [ Export to Dynatrace notebook ]  [ Open as ticket ]     │
└──────────────────────────────────────────────────────────┘
```

## The signature visual: the Leverage Map

One unforgettable beat for the Design score. A 2×2 **impact (y) vs. effort (x)** plot where
each opportunity is a dot. The top-left quadrant ("high impact, low effort") glows — *these
are the levers to pull.* It literally renders the product's thesis and the name.

```
 impact
  high │   ●(#1)         ●(#3)
       │ ★ PULL THESE
       │
   low │        ●(#5)        ●(#4)
       └─────────────────────────────  effort
            low                high
```

Clicking a dot scrolls to its card. This is the screenshot that goes on Devpost.

## The impact projection (the second memorable beat)

When a card opens, the **before → after bar animates** to the projected value, with the
assumption printed beneath it ("assumes the query is the dominant cost; based on 1,820
calls/req over the last 2h"). Animation = the payoff feels real; the printed assumption =
it stays honest.

## Interaction model

- **Stream, don't block.** Agent events arrive over SSE/WebSocket and render live.
- **Drill, don't navigate away.** Cards expand in place to full evidence.
- **Act inline.** Export/ticket buttons live on the card; success shows the created
  artifact's link.

## Visual tone

Dark, instrument-panel aesthetic (fits the observability domain). One accent color for
"leverage." Monospace for queries and metrics. Motion only on: investigation progress, the
Leverage Map settling, and the impact projection.

## Accessibility / demo legibility

High contrast, large type on the hero numbers — the demo video is judged on the first 3
minutes, so the key numbers (p95 before/after, % improvement) must read at a glance.
