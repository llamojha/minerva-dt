// Minerva — synthetic telemetry generator (Option A: fill the tenant).
//
// Pushes OTLP/protobuf spans straight to the Dynatrace trace-ingest endpoint (the `.live.` host).
// No app, no OneAgent, no VM — runs locally. Plants the demo's hero scenario so the live agent
// produces an on-narrative board:
//   • checkout-service /pay  — p95 ≈ 4.2s, ~65% of it in ONE unindexed `orders` DB query (hero)
//   • checkout-service /cart — an N+1 (many small DB calls per request)  (opportunity #2)
//   • frontend / catalog / payment — healthy, lower latency (so checkout is the dominant contributor)
//
// Timestamps are backfilled across the last ~90 min so queries over now()-2h see data immediately.
//
//   node gen/telemetry.mjs [tracesPerEndpoint=120]

import { SpanKind, context, trace, diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { Resource } from '@opentelemetry/resources';

process.loadEnvFile?.();
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR); // surface export failures (e.g. 401)

const appsEnv = (process.env.DT_ENVIRONMENT || '').replace(/\/+$/, '');
const token = process.env.DT_INGEST_TOKEN || process.env.DT_PLATFORM_TOKEN;
if (!appsEnv || !token) { console.error('need DT_ENVIRONMENT + a token (DT_INGEST_TOKEN or DT_PLATFORM_TOKEN)'); process.exit(2); }
const liveEnv = appsEnv.replace('.apps.dynatrace.com', '.live.dynatrace.com');
const url = `${liveEnv}/api/v2/otlp/v1/traces`;
const headers = { Authorization: `Api-Token ${token}` };

const PER = Number(process.argv[2] || 120);
const NOW = Date.now();
const WINDOW_MS = 90 * 60 * 1000; // spread over the last 90 min
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// One provider per service (resource carries service.name).
function providerFor(serviceName) {
  const exporter = new OTLPTraceExporter({ url, headers, concurrencyLimit: 64 });
  const provider = new BasicTracerProvider({
    resource: new Resource({ 'service.name': serviceName }),
    spanProcessors: [new BatchSpanProcessor(exporter, { maxQueueSize: 16384, maxExportBatchSize: 200 })],
  });
  return provider;
}

// Emit one root SERVER span (an endpoint hit) starting at `startMs` lasting `totalMs`, with optional
// child CLIENT db spans. Times are backfilled.
function emitTrace(tracer, { endpoint, startMs, totalMs, dbChildren = [] }) {
  const root = tracer.startSpan(endpoint, {
    kind: SpanKind.SERVER,
    startTime: startMs,
    attributes: {
      'http.request.method': 'POST',
      'http.route': endpoint,
      'url.path': endpoint,
      'endpoint.name': endpoint,
    },
  });
  const ctx = trace.setSpan(context.active(), root);
  let cursor = startMs + Math.max(1, totalMs * 0.05);
  for (const db of dbChildren) {
    const child = tracer.startSpan(
      'SELECT orders',
      {
        kind: SpanKind.CLIENT,
        startTime: cursor,
        attributes: {
          'db.system': 'postgresql',
          'db.namespace': 'shop',
          'db.statement': db.statement,
          'server.address': 'orders-db:5432',
        },
      },
      ctx,
    );
    child.end(cursor + db.ms);
    cursor += db.ms;
  }
  root.end(startMs + totalMs);
}

// The unindexed query that dominates /pay (the planted hero).
const HERO_SQL = "SELECT * FROM orders WHERE lower(email) = ? AND status <> 'failed' ORDER BY created_at";
const N1_SQL = 'SELECT * FROM cart_items WHERE id = ?';

function payTotalMs() {
  // ~90% fast (0.8–2.2s), ~10% slow tail (3.5–4.7s) → p95 ≈ 4.2s
  return Math.random() < 0.9 ? rand(800, 2200) : rand(3500, 4700);
}

async function main() {
  console.log(`ingest → ${url}\nplanting ~${PER} traces/endpoint over the last 90 min…`);
  const providers = [];
  const T = (name) => { const p = providerFor(name); providers.push(p); return p.getTracer('minerva-gen'); };

  const checkout = T('checkout-service');
  const frontend = T('frontend');
  const catalog = T('catalog-service');
  const payment = T('payment-service');

  // HERO: checkout /pay — one dominant unindexed orders query (~65% of total)
  for (let i = 0; i < PER; i++) {
    const total = payTotalMs();
    const startMs = NOW - rand(2 * 60 * 1000, WINDOW_MS);
    emitTrace(checkout, { endpoint: '/pay', startMs, totalMs: total, dbChildren: [{ statement: HERO_SQL, ms: total * rand(0.6, 0.68) }] });
  }
  // #2: checkout /cart — N+1 (many tiny db calls)
  for (let i = 0; i < Math.round(PER * 0.7); i++) {
    const n = Math.round(rand(15, 30));
    const dbChildren = Array.from({ length: n }, () => ({ statement: N1_SQL, ms: rand(8, 22) }));
    const total = dbChildren.reduce((s, d) => s + d.ms, 0) + rand(50, 150);
    const startMs = NOW - rand(2 * 60 * 1000, WINDOW_MS);
    emitTrace(checkout, { endpoint: '/cart', startMs, totalMs: total, dbChildren });
  }
  // Healthy neighbours (lower latency → checkout is the dominant contributor)
  for (let i = 0; i < PER; i++) {
    emitTrace(frontend, { endpoint: pick(['/', '/home', '/product']), startMs: NOW - rand(2 * 60 * 1000, WINDOW_MS), totalMs: rand(120, 600) });
    emitTrace(catalog, { endpoint: pick(['/products', '/product/{id}']), startMs: NOW - rand(2 * 60 * 1000, WINDOW_MS), totalMs: rand(150, 700), dbChildren: [{ statement: 'SELECT * FROM products WHERE id = ?', ms: rand(20, 90) }] });
    emitTrace(payment, { endpoint: '/charge', startMs: NOW - rand(2 * 60 * 1000, WINDOW_MS), totalMs: rand(200, 900) });
  }

  console.log('flushing…');
  // Flush + shut down one provider at a time so concurrent in-flight exports stay under the cap.
  for (const p of providers) { await p.forceFlush(); await p.shutdown(); }
  console.log('done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
