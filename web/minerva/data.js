/* Minerva — mock data. Exposed on window.MinervaData.
   Everything the UI renders comes from here so the prototype reads "real". */
(function () {
  // ---- Objectives (Screen 1) -------------------------------------------------
  const objectives = [
    {
      id: "perf",
      title: "Improve Performance",
      blurb: "Find where latency concentrates and what to do about it.",
      icon: "gauge",
      metric: "p95 latency",
      active: true,
    },
    {
      id: "cost",
      title: "Cut Cost",
      blurb: "Surface waste — idle capacity, over-scan, redundant calls.",
      icon: "wallet",
      metric: "$ / month",
      roadmap: true,
    },
    {
      id: "errors",
      title: "Reduce Errors",
      blurb: "Trace the failure modes eating your error budget.",
      icon: "shield",
      metric: "error rate",
      roadmap: true,
    },
    {
      id: "deadcode",
      title: "Kill Dead Code",
      blurb: "Locate endpoints and paths that no longer earn their keep.",
      icon: "scissors",
      metric: "unused paths",
      roadmap: true,
    },
    {
      id: "scale",
      title: "Prepare for Scale",
      blurb: "Pressure-test the headroom before the next traffic wave.",
      icon: "trending",
      metric: "saturation",
      roadmap: true,
    },
    {
      id: "dora",
      title: "Improve Delivery",
      blurb: "Read your DORA signals — lead time, change failure, MTTR.",
      icon: "rocket",
      metric: "DORA",
      roadmap: true,
    },
  ];

  // ---- Objectives rail (Screen 2 side rail) ---------------------------------
  // Minerva is a single agent; this rail shows the objective she's investigating now, with the
  // others greyed as roadmap. It conveys product breadth without implying multiple agents.
  const objectiveRail = [
    { id: "perf", name: "Improve Performance", role: "latency · spans · DB", state: "active" },
    { id: "cost", name: "Cut Cost", role: "spend · scan · idle", state: "roadmap" },
    { id: "errors", name: "Reduce Errors", role: "errors · SLO · retries", state: "roadmap" },
    { id: "scale", name: "Prepare for Scale", role: "saturation · headroom", state: "roadmap" },
  ];

  // ---- Investigation plan (Screen 2) ----------------------------------------
  const plan = [
    {
      id: 1,
      title: "Rank services by latency contribution",
      result: "checkout is 58% of total p95 across 6 services",
      timing: "1.2s",
      query:
        "timeseries p95 = percentile(dt.service.request.response_time, 95, rollup: avg),\n  by: { dt.service.name }\n| sort p95 desc",
      queryLabel: "latency-by-service",
    },
    {
      id: 2,
      title: "Drill slowest endpoints → spans",
      result: "/pay span tree: 65% of time inside a single client DB call",
      timing: "0.8s",
      query:
        'fetch spans\n| filter span.kind == "client" and isNotNull(db.system)\n| summarize p95 = percentile(duration, 95), calls = count(), by: { db.statement }\n| sort p95 desc\n| limit 10',
      queryLabel: "slow-spans",
    },
    {
      id: 3,
      title: "Check database hotspots",
      result: "orders sequential scan — no index on (status, created_at)",
      timing: "1.4s",
      query:
        'fetch spans\n| filter db.system == "postgres" and contains(db.statement, "orders")\n| summarize seqScans = count(), p95 = percentile(duration, 95),\n    by: { db.statement }\n| sort p95 desc',
      queryLabel: "db-hotspots",
    },
    {
      id: 4,
      title: "Correlate with recent deploys",
      result: "no deploy in window — hotspot is pre-existing, not a regression",
      timing: "0.9s",
      query:
        'fetch events\n| filter event.kind == "DEPLOYMENT_EVENT"\n  and dt.entity.service == "checkout"\n| fields timestamp, deployment.version, deployment.author\n| sort timestamp desc',
      queryLabel: "deploy-correlation",
    },
  ];

  // ---- Opportunities (Screens 3 + 4) ----------------------------------------
  // impact / effort are 0..100 coordinates for the Leverage Map.
  const opportunities = [
    {
      id: "idx-orders",
      rank: 1,
      leverage: "high",
      service: "checkout",
      endpoint: "/pay",
      finding:
        "65% of checkout /pay p95 is one unindexed DB query on the orders table.",
      metric: {
        label: "p95 latency",
        unit: "s",
        before: 4.2,
        after: 1.5,
        deltaPct: -64,
        better: "down",
      },
      effort: "Low",
      confidence: "High",
      confidenceNote: "n=18,400 spans · 2h window · single dominant cause",
      dissent:
        "Traffic is low off-peak — the win concentrates 9am–5pm, so the daily average understates it.",
      action: "Add index on orders(status, created_at).",
      actionDetail:
        "CREATE INDEX CONCURRENTLY idx_orders_status_created\n  ON orders (status, created_at);",
      assumptions:
        "Assumes the query is the dominant cost on /pay (it is 65% of span time) and that the index is used by the planner. Based on 18,400 spans over the last 2h.",
      evidence: [
        { label: "latency-by-service", queryId: 1 },
        { label: "slow-spans", queryId: 2 },
        { label: "db-hotspots", queryId: 3 },
      ],
      impact: 92,
      effortScore: 16,
    },
    {
      id: "cart-nplus1",
      rank: 2,
      leverage: "high",
      service: "cart",
      endpoint: "/items",
      finding:
        "cart service issues an N+1 query — 1,820 DB calls per request to hydrate line items.",
      metric: {
        label: "throughput",
        unit: " rps",
        before: 480,
        after: 576,
        deltaPct: 20,
        better: "up",
      },
      effort: "Medium",
      confidence: "Medium",
      confidenceNote: "n=6,200 spans · pattern stable across 24h",
      dissent:
        "Batch-loading adds cache-invalidation complexity; the throughput gain assumes the DB, not the app, is the bottleneck.",
      action: "Batch line-item lookups into a single IN(...) query.",
      actionDetail:
        "Replace per-item SELECT with:\nSELECT * FROM line_items WHERE cart_id = ANY($1);",
      assumptions:
        "Assumes connection-pool contention, not CPU, caps throughput. Based on 1,820 calls/req observed over the last 2h.",
      evidence: [
        { label: "slow-spans", queryId: 2 },
        { label: "db-hotspots", queryId: 3 },
      ],
      impact: 74,
      effortScore: 54,
    },
    {
      id: "gw-timeout",
      rank: 3,
      leverage: "high",
      service: "payment-gateway",
      endpoint: "client",
      finding:
        "payment-gateway client timeout is set to 30s, inflating tail latency on slow upstreams.",
      metric: {
        label: "p99 latency",
        unit: "s",
        before: 6.5,
        after: 2.9,
        deltaPct: -55,
        better: "down",
      },
      effort: "Low",
      confidence: "Medium",
      confidenceNote: "n=2,100 tail spans · upstream behaviour assumed stable",
      dissent:
        "A shorter timeout converts some slow successes into retries — net effect depends on upstream recovery rate.",
      action: "Lower client timeout to 4s with one bounded retry.",
      actionDetail:
        "gateway.client.timeout = 4s\ngateway.client.retries  = 1 (jittered backoff)",
      assumptions:
        "Assumes upstream p99 recovers under 4s in the majority of cases. Based on 2,100 tail spans over the last 2h.",
      evidence: [
        { label: "latency-by-service", queryId: 1 },
        { label: "slow-spans", queryId: 2 },
      ],
      impact: 64,
      effortScore: 28,
    },
    {
      id: "session-affinity",
      rank: 4,
      leverage: "low",
      service: "checkout",
      endpoint: "fleet",
      finding:
        "session affinity skews pod load — p95 varies 2× across replicas at peak.",
      metric: {
        label: "p95 spread",
        unit: "×",
        before: 2.0,
        after: 1.2,
        deltaPct: -40,
        better: "down",
      },
      effort: "High",
      confidence: "Low",
      confidenceNote: "n=900 windows · confounded by autoscaler timing",
      dissent:
        "Removing affinity may cool warm caches and raise average latency even as the spread narrows.",
      action: "Move to least-connections load balancing; decouple session store.",
      actionDetail:
        "Externalise sessions to Redis; switch LB policy to leastConn.",
      assumptions:
        "Assumes cache warmth is not the dominant factor. Based on 900 one-minute windows over 24h.",
      evidence: [{ label: "latency-by-service", queryId: 1 }],
      impact: 36,
      effortScore: 82,
    },
    {
      id: "gzip-off",
      rank: 5,
      leverage: "low",
      service: "product-catalog",
      endpoint: "/search, /browse",
      finding:
        "gzip is disabled on two read endpoints — payloads are ~40% larger than necessary.",
      metric: {
        label: "payload",
        unit: " KB",
        before: 210,
        after: 126,
        deltaPct: -40,
        better: "down",
      },
      effort: "Low",
      confidence: "Medium",
      confidenceNote: "n=12,000 responses · CDN cache ratio assumed steady",
      dissent:
        "Most of these responses are already CDN-cached, so origin-side gains may not reach the user.",
      action: "Enable gzip on /search and /browse responses.",
      actionDetail: "compression: gzip; min_length: 1024;",
      assumptions:
        "Assumes a meaningful share of traffic misses the CDN. Based on 12,000 responses over 2h.",
      evidence: [{ label: "latency-by-service", queryId: 1 }],
      impact: 30,
      effortScore: 38,
    },
  ];

  // ---- Extra evidence queries (Validation mode) -----------------------------
  // Referenced by verdict evidence chips. queryById() searches these too.
  const extraQueries = [
    {
      id: 5,
      queryLabel: "email-lookup-share",
      timing: "0.7s",
      result: "orders.email predicate = 4% of /pay span time (never on slow path)",
      query:
        'fetch spans\n| filter span.name == "checkout /pay" and contains(db.statement, "orders.email")\n| summarize share = sum(duration) / toDouble(total_duration),\n    p95 = percentile(duration, 95)\n| fields share, p95',
    },
    {
      id: 6,
      queryLabel: "catalog-read-latency",
      timing: "1.1s",
      result: "product-catalog read p95 = 820ms; 86% of reads are repeat lookups",
      query:
        'timeseries p95 = percentile(dt.service.request.response_time, 95, rollup: avg),\n  by: { dt.service.name, endpoint }\n| filter dt.service.name == "product-catalog" and endpoint == "/read"\n| sort p95 desc',
    },
    {
      id: 7,
      queryLabel: "module-attribution",
      timing: "0.9s",
      result: "no per-module CPU / lock attribution emitted by checkout — can't isolate",
      query:
        'fetch spans\n| filter dt.service.name == "checkout"\n| summarize spans = count(), by: { code.namespace }\n| sort spans desc\n// code.namespace is null on 100% of spans — module boundary not instrumented',
    },
  ];

  // ---- Validation verdicts (Screen 4b) --------------------------------------
  // Keyed by stance. Each reuses the opportunity-card visual DNA but leads with a STANCE.
  // Refuted carries the "what actually matters" redirect back into Discovery.
  // NOTE: validation has no backend yet — these mock verdicts back the verdict screen while the
  // discovery path runs live over the SSE transport. Resolve a task → verdict via validationForTask.
  const validations = {
    refuted: {
      key: "refuted",
      task: "Add an index to orders.email",
      claim: "Adding an index on orders.email will make checkout faster.",
      verdict: "refuted",
      stance: "Won't move the needle.",
      service: "checkout",
      endpoint: "/pay",
      metric: { label: "p95 latency", unit: "s", before: 4.2, after: 4.1, deltaPct: -2, better: "down" },
      whySmall:
        "The orders.email lookup is only 4% of /pay span time — indexing it barely registers against the tail.",
      confidence: "High",
      confidenceNote: "n=18,400 spans · the email predicate never appears on the slow path.",
      dissent:
        "If you later ship email-based account search this column could matter — but on today's query mix it doesn't.",
      assumptions:
        "Assumes the current /pay query mix holds. Based on 18,400 spans over the last 2h.",
      evidence: [
        { label: "slow-spans", queryId: 2 },
        { label: "email-lookup-share", queryId: 5 },
      ],
      redirect: {
        objectiveId: "perf",
        oppId: "idx-orders",
        service: "checkout",
        endpoint: "/pay",
        finding:
          "65% of /pay p95 is an unindexed sequential scan on orders(status, created_at).",
        deltaLine: "p95 4.2s → ~1.5s (−64%)",
      },
    },
    confirmed: {
      key: "confirmed",
      task: "Cache the product catalog",
      claim: "Caching the product catalog will cut read latency.",
      verdict: "confirmed",
      stance: "Worth doing.",
      service: "product-catalog",
      endpoint: "/read",
      metric: { label: "read p95", unit: " ms", before: 820, after: 180, deltaPct: -78, better: "down" },
      whySmall: null,
      confidence: "Medium",
      confidenceNote: "n=12,400 reads · 86% are repeat lookups of the same SKUs.",
      dissent:
        "Adds cache-invalidation complexity; the win assumes catalogue writes stay infrequent relative to reads.",
      assumptions:
        "Assumes a 60s TTL is acceptable and most reads hit warm entries. Based on 12,400 reads over 2h.",
      evidence: [
        { label: "catalog-read-latency", queryId: 6 },
        { label: "latency-by-service", queryId: 1 },
      ],
      redirect: null,
    },
    inconclusive: {
      key: "inconclusive",
      task: "Split the checkout service",
      claim: "Splitting checkout into separate modules will improve scalability.",
      verdict: "inconclusive",
      stance: "Not measurable from telemetry — yet.",
      service: "checkout",
      endpoint: "service",
      metric: null,
      whySmall: null,
      confidence: "Low",
      confidenceNote: "checkout emits no module-level boundary on its spans.",
      dissent:
        "A split could just as easily add network hops and latency — there's no signal either way today.",
      assumptions:
        "Can't project: no per-module CPU or lock-contention attribution is emitted to telemetry.",
      evidence: [
        { label: "module-attribution", queryId: 7 },
      ],
      needToKnow:
        "Instrument module-level CPU and lock contention (code.namespace on spans) for ~1 week, then re-validate.",
      redirect: {
        objectiveId: "perf",
        oppId: "idx-orders",
        service: "checkout",
        endpoint: "/pay",
        finding:
          "Meanwhile, the measurable win is the unindexed scan on orders(status, created_at) — 65% of /pay p95.",
        deltaLine: "p95 4.2s → ~1.5s (−64%)",
      },
    },
  };

  // ---- Self-observability (footer) ------------------------------------------
  const selfStats = {
    tokens: 12480,
    seconds: 6.3,
    queries: 9,
    scannedGB: 0.4,
  };

  window.MinervaData = {
    objectives,
    objectiveRail,
    plan,
    opportunities,
    extraQueries,
    validations,
    selfStats,
    queryById(id) {
      return plan.find((p) => p.id === id) || extraQueries.find((q) => q.id === id) || null;
    },
    opportunityById(id) {
      return opportunities.find((o) => o.id === id) || null;
    },
    validationByKey(key) {
      return validations[key] || null;
    },
    validationForTask(task) {
      if (!task) return validations.refuted;
      const t = task.trim().toLowerCase();
      const hit = Object.values(validations).find((v) => v.task.toLowerCase() === t);
      if (hit) return hit;
      // heuristic fallback so free-text still lands somewhere believable
      if (/cache|catalog|cdn|gzip|compress/.test(t)) return validations.confirmed;
      if (/split|microservice|rewrite|migrate|refactor|re-?architect/.test(t)) return validations.inconclusive;
      return validations.refuted;
    },
  };
})();
