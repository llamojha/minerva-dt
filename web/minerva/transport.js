/* Minerva — live transport (M5↔M0 seam).
   Connects the frontend to the real agent endpoints over SSE. Today the server replays a
   fixture; later the real agent emits the same `AgentEvent`s over the same endpoints, so this
   file does not change. Exposed on window.MinervaTransport.

   The contract (src/contract.ts) is leaner than the prototype's original mock data, so the
   adapters here DERIVE the display-only fields the screens need (Leverage-Map coordinates,
   service/endpoint split, before→after delta) from the contract payload. Nothing derived is
   sent back over the wire — the contract stays locked. */
(function () {
  // API base: same-origin by default — the site and the API are one origin both locally
  // (`npm run dev` serves web/ + /api on :8787) and in production (Vercel static + /api function).
  // `?api=…` overrides (e.g. a legacy split python:8080 → node:8787 setup). All routes are /api/*.
  const params = new URLSearchParams(location.search);
  const base = params.get("api") || (location.port === "8080" ? "http://localhost:8787" : "");
  const API = base + "/api";
  // ?speed=N scales replay cadence (0 = instant). Omitted = real recorded cadence.
  const SPEED = params.get("speed");

  // The picker's objective ids (data.js) → the contract's ObjectiveKind values.
  const KIND_BY_ID = {
    perf: "improve-performance",
    cost: "cut-cost",
    errors: "reduce-errors",
    deadcode: "kill-dead-code",
    scale: "prepare-for-scale",
    dora: "improve-delivery",
    custom: "custom",
  };

  function startRun(objective) {
    // objective.kind wins when present (e.g. "validate-task" from the validation flow); otherwise
    // map the picker id → contract kind. "custom" objectives always send "custom".
    const kind = objective.custom
      ? "custom"
      : objective.kind || KIND_BY_ID[objective.id] || "custom";
    return fetch(API + "/objectives", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, statement: objective.title || "Improve performance" }),
    }).then((r) => {
      if (!r.ok) throw new Error("POST /objectives → " + r.status);
      return r.json();
    });
  }

  // Export an opportunity as a real Dynatrace notebook (M6, "beyond chat").
  // Resolves to { url }. Rejects if the server has no live tenant (fixture mode) — the caller
  // falls back to a simulated artifact so the demo flow still completes.
  function exportOpportunity(runId, oppId) {
    return fetch(API + "/objectives/" + runId + "/opportunities/" + oppId + "/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "notebook" }),
    }).then((r) => {
      if (!r.ok) throw new Error("export → " + r.status);
      return r.json();
    });
  }

  function streamRun(runId, onEvent, onError) {
    const url =
      API + "/objectives/" + runId + "/events" + (SPEED != null ? "?speed=" + SPEED : "");
    const es = new EventSource(url);
    let done = false;
    es.onmessage = (m) => {
      let ev;
      try {
        ev = JSON.parse(m.data);
      } catch {
        return;
      }
      onEvent(ev);
      if (ev.type === "run.completed" || ev.type === "error") {
        done = true;
        es.close();
      }
    };
    es.onerror = () => {
      // EventSource also fires onerror on the normal close after the terminal event.
      if (!done && onError) onError(new Error("stream error"));
    };
    return () => {
      done = true;
      es.close();
    };
  }

  /* ---- derivations: contract payload → display view-models ---------------- */

  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  // "checkout /pay p95 is 4.2s …" → { service:"checkout", endpoint:"/pay" }
  function parseServiceEndpoint(finding) {
    const svc = (finding.match(/^([a-z][a-z0-9-]*)/i) || [])[1] || "";
    const ep = (finding.match(/\s(\/[a-z0-9/_-]*)/i) || [])[1] || "";
    return { service: svc, endpoint: ep };
  }

  // impact.before/after → the before→after bar view-model the UI already renders.
  function deriveMetric(impact) {
    const before = impact.before;
    const after = impact.after;
    const better = after < before ? "down" : "up"; // lower-is-better vs more-is-better
    const deltaPct = before ? Math.round(((after - before) / before) * 100) : 0;
    const unit = impact.unit ? (impact.unit[0] === " " ? impact.unit : " " + impact.unit) : "";
    return { label: impact.metric, unit, before, after, deltaPct, better };
  }

  const EFFORT_X = { low: 18, medium: 52, high: 84 };
  const CONF_WEIGHT = { high: 1.4, medium: 1.0, low: 0.7 };

  // y (impact) is the confidence-weighted magnitude of the projected improvement.
  function impactScore(metric, confidence) {
    const mag = Math.abs(metric.deltaPct) * (CONF_WEIGHT[confidence] || 1);
    return clamp(Math.round(mag), 12, 95);
  }

  let evSeq = 0; // stable ids for evidence chips that lack one

  function adaptOpportunity(opp, rank) {
    const metric = deriveMetric(opp.impact);
    const effortScore = EFFORT_X[opp.effort] ?? 52;
    const impact = impactScore(metric, opp.confidence);
    const leverage = impact >= 55 && effortScore <= 55 ? "high" : "low";
    const { service, endpoint } = parseServiceEndpoint(opp.finding);
    const evidence = (opp.evidence || []).map((e) => ({
      id: e.id || "ev" + ++evSeq,
      label: e.label,
      source: e.source,
      resultSummary: e.resultSummary,
      dql: e.dql,
      deepLink: e.deepLink,
      confidence: e.confidence,
      // the drawer renders a query view-model directly (no plan-step lookup):
      query: e.dql
        ? { label: e.label, dql: e.dql, result: e.resultSummary, deepLink: e.deepLink }
        : null,
    }));
    return {
      id: opp.id,
      rank,
      leverage,
      service,
      endpoint,
      finding: opp.finding,
      metric,
      effort: cap(opp.effort),
      confidence: cap(opp.confidence),
      confidenceNote: opp.confidenceReason,
      dissent: opp.dissent,
      action: opp.recommendedAction,
      actionDetail: opp.actionDetail || null, // not in contract — detail view hides if absent
      assumptions: opp.impact.assumption,
      evidence,
      impact,
      effortScore,
    };
  }

  // plan.proposed step + its step.started/completed → the investigation row view-model.
  function adaptStep(planStep, completed, index) {
    const label = slugLabel(planStep.description);
    const base = {
      id: planStep.id,
      index,
      title: planStep.description,
      queryLabel: label,
    };
    if (!completed) return base;
    return {
      ...base,
      result: completed.resultSummary,
      timing: (completed.durationMs / 1000).toFixed(1) + "s",
      query: {
        label,
        dql: completed.dql,
        result: completed.resultSummary,
        deepLink: completed.deepLink,
      },
    };
  }

  // "Rank services by latency contribution" → "rank-services"
  function slugLabel(desc) {
    return desc
      .toLowerCase()
      .split(/\s+/)
      .slice(0, 2)
      .join("-")
      .replace(/[^a-z0-9-]/g, "");
  }

  // verdict.stance → the short human line the verdict screen leads with.
  const STANCE_LINE = {
    confirmed: "Worth doing.",
    refuted: "Won't move the needle.",
    inconclusive: "Not measurable from telemetry — yet.",
  };

  // contract objectiveKind → the picker id the verdict redirect hands back into Discovery with.
  const REDIRECT_OBJ_ID = {
    "improve-performance": "perf",
    "cut-cost": "cost",
    "reduce-errors": "errors",
    "kill-dead-code": "deadcode",
    "prepare-for-scale": "scale",
    "improve-delivery": "dora",
    custom: "perf",
  };

  // contract `verdict` → the view-model verdict.jsx renders (same keys as the data.js mock, so the
  // screen is identical live vs. offline). Live evidence carries its own dql+resultSummary, so each
  // evidence entry also exposes a prebuilt `query` view-model the drawer can open directly (no
  // queryById lookup — that path is mock-only).
  function adaptVerdict(raw) {
    if (!raw) return null;
    const stance = raw.stance; // "confirmed" | "refuted" | "inconclusive"
    const metric = raw.impact ? deriveMetric(raw.impact) : null;
    const evidence = (raw.evidence || []).map((e) => ({
      id: e.id || "ev" + ++evSeq,
      label: e.label,
      source: e.source,
      resultSummary: e.resultSummary,
      dql: e.dql,
      deepLink: e.deepLink,
      confidence: e.confidence,
      // the drawer + verdict query-blocks render this directly; queryId stays null for live verdicts.
      queryId: null,
      query: e.dql
        ? { label: e.label, dql: e.dql, result: e.resultSummary, deepLink: e.deepLink }
        : null,
    }));
    const redirect = raw.redirect
      ? {
          objectiveId: REDIRECT_OBJ_ID[raw.redirect.objectiveKind] || "perf",
          oppId: null,
          finding: raw.redirect.finding,
          deltaLine: raw.redirect.deltaLine,
        }
      : null;
    return {
      id: raw.id,
      key: stance,
      verdict: stance,
      stance: STANCE_LINE[stance] || "",
      claim: raw.claim,
      service: raw.service,
      endpoint: raw.endpoint,
      metric,
      whySmall: raw.whySmall || null,
      confidence: cap(raw.confidence),
      confidenceNote: raw.confidenceReason,
      dissent: raw.dissent,
      // mock uses `assumptions` for both the inconclusive "can't project" note and impact assumption.
      assumptions: raw.impact ? raw.impact.assumption : raw.recommendedAction,
      evidence,
      // inconclusive "to get an answer" copy comes from recommendedAction.
      needToKnow: stance === "inconclusive" ? raw.recommendedAction : null,
      redirect,
    };
  }

  window.MinervaTransport = {
    API,
    startRun,
    streamRun,
    exportOpportunity,
    adaptOpportunity,
    adaptStep,
    deriveMetric,
    adaptVerdict,
  };
})();
