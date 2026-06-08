# Minerva — Claude Design Prompt

Copy everything in the block below into Claude (claude.ai) to generate an interactive,
demo-ready UI prototype as a single React artifact. Self-contained — no repo context needed.

> Tip: for quick exploration use claude.ai. If you'd rather build the real frontend in this
> repo (React/Vite), use this as the design spec and scaffold it here instead.

---

```
You are a senior product designer + front-end engineer. Build a high-fidelity, interactive
web app prototype as a single self-contained React artifact (React + Tailwind, mock data
only, no backend). Make it genuinely beautiful and demo-ready — this will be screenshotted
for a hackathon submission judged partly on design.

## Product

**Minerva** — an objective-driven optimization agent for engineering teams. You state an
engineering GOAL (e.g. "improve performance"); Minerva autonomously investigates production
observability data (from Dynatrace), finds the highest-leverage opportunities, quantifies the
payoff with evidence, and lets you turn one into an action. Tagline: "You bring the goal.
Minerva finds the wisest move, proven by your data." Minerva is the Roman goddess of wisdom
and strategy — the brand should feel intelligent, strategic, and calm under heavy data.
Architecturally Minerva is a SINGLE optimization agent that, given an objective, runs a
multi-step, branching investigation over the data and synthesizes a ranked recommendation —
reflect that in the UI (see the "objectives" rail below).

## Build these screens (single-page app, navigable):

### 1. Objective picker (entry)
A clean gallery of objective cards: Improve Performance, Cut Cost, Reduce Errors, Kill Dead
Code, Prepare for Scale, Improve Delivery (DORA). Plus a free-form "Set your own objective"
input. Selecting "Improve Performance" advances to screen 2.

### 2. Investigation Stream (the "it's really an agent" moment)
Do NOT show a chat log. Show a structured PLAN that visibly EXECUTES, step by step, with a
streaming/animated feel:
- The stated plan (e.g. 1. Rank services by latency contribution → 2. Drill slowest endpoints
  → spans → 3. Check database hotspots → 4. Correlate with recent deploys).
- Each step shows: a one-line result, a clickable "DQL ↗" chip (opens the underlying query in
  a side panel), and a timing (e.g. 1.2s). Steps progress from ✓ done → ⟳ running → ○ pending.
- It should feel like watching the agent think and gather evidence live.
- OBJECTIVES RAIL: a small side rail showing the objective Minerva is working — for the MVP show
  "Improve Performance" active, with "Cut Cost", "Reduce Errors", "Prepare for Scale" greyed out
  as "available / on the roadmap". Conveys the product's breadth without implying capability that
  isn't built. (This is a single agent investigating one objective, not multiple agents.)

### 3. Opportunity Board (the payoff) + the signature visual
- A ranked list of "opportunity" cards, sorted by impact × effort. Each card shows: a
  one-sentence finding, a small before→after bar chart that ANIMATES to the projected value,
  an effort badge (Low/Med/High), a calibrated confidence badge (High/Med/Low), a "dissent"
  line (the contrary evidence), evidence chips linking to source queries, a recommended
  action, and buttons: [Export to Dynatrace notebook] [Open as ticket].
- SIGNATURE VISUAL — "The Leverage Map": a 2×2 scatter plot of impact (y) vs effort (x) where
  each opportunity is a dot; the top-left quadrant ("high impact, low effort") glows and is
  labeled "PULL THESE". Clicking a dot scrolls to its card. This is the hero screenshot.

### 4. "Cost of this analysis" panel (self-observability — a small but classy touch)
A compact footer/side widget showing what running Minerva itself cost: tokens used, wall-clock
time, number of tool/DQL calls, and Grail data scanned (e.g. "12,480 tokens · 6.3s · 9 queries
· 0.4 GB scanned"). Frame it as "Minerva watches itself too." Keep it subtle.

## Mock data (use this so it looks real):
- #1 (high leverage): "checkout /pay — 65% of p95 is one unindexed DB query." p95 4.2s → 1.5s
  (est. −64%). Effort: Low. Confidence: High. Dissent: "traffic is low off-peak — impact
  concentrates 9am–5pm." Action: "add index on orders(status, created_at)."
- #2: "cart service N+1 query: 1,820 DB calls/request." Est +20% throughput. Effort: Medium.
  Confidence: Medium.
- #3: "payment-gateway client timeout set to 30s, inflating tail latency." Effort: Low.
  Confidence: Medium.
- Plus 2 lower-leverage items to populate the other Leverage Map quadrants.
- Example DQL for a chip: `timeseries p95=percentile(dt.service.request.response_time, 95,
  rollup: avg), by:{dt.service.name}` and `fetch spans | filter span.kind=="client" and
  isNotNull(db.system) | summarize p95=percentile(duration,95), by:{db.statement} | sort p95
  desc | limit 10`.

## Visual direction
Dark, premium "instrument panel" aesthetic fitting an observability product. One accent color
for "leverage" (e.g. a confident amber or electric blue). Monospace for queries and metric
numbers. Generous whitespace, large legible hero numbers (p95 before/after, % improvement)
that read in a 3-minute demo video. Motion only where it matters: the investigation stream
progressing, the objectives rail updating, the Leverage Map settling, and the before→after bars
animating. Subtle, classy — not flashy. A small owl motif (Minerva's owl) is welcome if tasteful.

Deliver one polished, runnable artifact with all screens reachable.
```

---

## Variations you can append

- **Compare directions first:** "First, show me 2 distinct visual directions as quick mockups
  before building the full thing."
- **Match a brand:** append your exact palette/fonts.
- **Lighter scope:** "Just build screen 3 (Opportunity Board + Leverage Map) at maximum
  polish — that's the hero shot."

---

## Short version (for quick iterations)

Paste this when you want a fast pass or to riff on one screen without the full spec.

```
Build a single, polished, interactive React + Tailwind artifact (mock data, no backend) for
"Minerva" — an objective-driven optimization agent. You set an engineering goal; Minerva
investigates production/Dynatrace data and returns the highest-leverage opportunities, proven
with evidence. Dark, premium "instrument panel" aesthetic, one leverage accent color,
monospace metrics, large legible hero numbers, subtle motion.

Three navigable screens: (1) objective picker (gallery of goals); (2) an investigation stream
that shows the agent's plan EXECUTING step by step with clickable "DQL ↗" chips and timings
(not a chat log); (3) an Opportunity Board of ranked cards (finding, animated before→after
bar, effort + confidence badges, dissent line, recommended action, [Export] button) plus the
hero visual — a "Leverage Map" 2×2 impact-vs-effort scatter where the high-impact/low-effort
quadrant glows ("PULL THESE").

Hero mock card: "checkout /pay — 65% of p95 is one unindexed DB query", p95 4.2s → 1.5s
(−64%), Effort Low, Confidence High. Make it beautiful and demo-ready.
```
