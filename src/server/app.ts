// Minerva — Hono app exposing the locked agent transport (M0), shaped for serverless (Vercel).
//
// Implements the REST/SSE surface in `docs/event-contract.md`: create a run, stream its events,
// export an opportunity. Today the stream is a fixture replay; the real agent (M3/M4) emits the
// same `AgentEvent`s over the same endpoints, so the frontend's `EventSource` never changes.
//
// SERVERLESS-CORRECT: there is no cross-request in-memory state. The run's objective is encoded
// INTO the runId (base64url), so `GET …/events` and export reconstruct it without a shared Map —
// on Vercel the POST and the GET can land on different function instances. A module-level cache is
// kept only as a same-process fast-path (local dev / warm lambda); a miss re-derives from the
// stream source, which for the fixture is a cheap in-memory replay.
//
// All routes live under `/api` so the canonical Vercel catch-all (`api/[[...route]].ts` →
// `handle(app)`) routes cleanly and the static site is served same-origin.

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import {
  type AgentEvent,
  type ObjectiveKind,
  type Opportunity,
  type StartObjectiveRequest,
  type Verdict,
} from '../contract.js';
import { loadFixture, PERF_FIXTURE, VALIDATE_FIXTURE, replay } from './replay.js';

const OBJECTIVE_KINDS: readonly ObjectiveKind[] = [
  'improve-performance',
  'cut-cost',
  'reduce-errors',
  'kill-dead-code',
  'prepare-for-scale',
  'improve-delivery',
  'validate-task',
  'custom',
];

/** Creates the durable artifact for an opportunity; returns its URL. Injectable for tests. */
export type Exporter = (args: {
  opportunity: Opportunity;
  objective: StartObjectiveRequest;
}) => Promise<{ url: string }>;

/**
 * Creates the durable artifact for a validate-task verdict; returns its URL. Parallel to
 * {@link Exporter} but for the single per-run Verdict (validation mode). Injectable for tests.
 */
export type VerdictExporter = (args: {
  verdict: Verdict;
  objective: StartObjectiveRequest;
}) => Promise<{ url: string }>;

/**
 * Produces the event stream for a run. Two implementations: the fixture replay (default) and the
 * live agent (`MINERVA_LIVE=1`). Both are `AsyncGenerator<AgentEvent>`, so the SSE endpoint is
 * identical for either — the fixture-backed-by-default / live-opt-in switch.
 */
export type StreamSource = (args: {
  runId: string;
  objective: StartObjectiveRequest;
  speed: number;
  aborted: () => boolean;
}) => AsyncGenerator<AgentEvent>;

export interface AppDeps {
  /** Pre-loaded event stream to replay. Defaults to the improve-performance fixture. */
  events?: AgentEvent[];
  /** Override the stream source (tests). Defaults to live or fixture per `MINERVA_LIVE`. */
  streamSource?: StreamSource;
  /** Override the artifact exporter (tests). Defaults to the dtctl notebook exporter. */
  exporter?: Exporter;
  /** Override the verdict artifact exporter (tests). Defaults to the dtctl notebook exporter. */
  verdictExporter?: VerdictExporter;
}

/** Encode the objective into an opaque, URL-safe runId so the run carries its own state. */
function encodeRunId(objective: StartObjectiveRequest): string {
  return 'run_' + Buffer.from(JSON.stringify(objective)).toString('base64url');
}

/** Recover the objective from a runId; null if it isn't one of ours. */
function decodeRunId(runId: string): StartObjectiveRequest | null {
  if (!runId?.startsWith('run_')) return null;
  try {
    const obj = JSON.parse(Buffer.from(runId.slice(4), 'base64url').toString('utf8'));
    if (!obj || !OBJECTIVE_KINDS.includes(obj.kind) || typeof obj.statement !== 'string') return null;
    return obj as StartObjectiveRequest;
  } catch {
    return null;
  }
}

export function createApp(deps: AppDeps = {}): Hono {
  const live = process.env.MINERVA_LIVE === '1';

  // Per-kind fixture selection, memoized so each fixture is parsed/validated at most once. A
  // `deps.events` override (tests) wins for every kind, preserving existing behavior.
  const fixtureCache = new Map<ObjectiveKind, AgentEvent[]>();
  function fixtureFor(kind: ObjectiveKind): AgentEvent[] {
    if (deps.events) return deps.events;
    const cached = fixtureCache.get(kind);
    if (cached) return cached;
    const events = loadFixture(kind === 'validate-task' ? VALIDATE_FIXTURE : PERF_FIXTURE);
    fixtureCache.set(kind, events);
    return events;
  }

  // Live source is lazy-imported so @google/adk (large, subprocess-spawning) is NOT bundled into
  // the serverless function on the fixture path (prod default).
  const liveSource: StreamSource = async function* ({ runId, objective }) {
    // Opaque specifier so serverless bundlers (Vercel/nft) don't trace @google/adk into the
    // function on the fixture path; Node still resolves it relative to this module at runtime.
    const agentModule = '../agent/run.js';
    const { runMinerva } = (await import(agentModule)) as typeof import('../agent/run.js');
    yield* runMinerva(objective, runId);
  };
  const streamSource: StreamSource =
    deps.streamSource ??
    (live
      ? liveSource
      : ({ runId, objective, speed, aborted }) =>
          replay(fixtureFor(objective.kind), runId, { speed, aborted }));

  // Default exporter (dtctl) is lazy-imported for the same reason; it shells out, so it only works
  // where a `dtctl` binary exists (local / a runtime with the CLI) — not on Vercel, where the FE
  // falls back to a simulated artifact.
  const exporter: Exporter =
    deps.exporter ??
    (async ({ opportunity, objective }) => {
      const [{ buildNotebook }, { exportNotebook }] = await Promise.all([
        import('../export/notebook.js'),
        import('../export/dtctl.js'),
      ]);
      const environment = process.env.DT_ENVIRONMENT ?? '';
      const notebook = buildNotebook(opportunity, objective, environment);
      return exportNotebook(notebook);
    });

  // Verdict (validate-task) export — same dtctl notebook path, but from a Verdict doc.
  const verdictExporter: VerdictExporter =
    deps.verdictExporter ??
    (async ({ verdict, objective }) => {
      const [{ buildVerdictNotebook }, { exportNotebook }] = await Promise.all([
        import('../export/notebook.js'),
        import('../export/dtctl.js'),
      ]);
      const environment = process.env.DT_ENVIRONMENT ?? '';
      const notebook = buildVerdictNotebook(verdict, objective, environment);
      return exportNotebook(notebook);
    });

  // Same-process fast-path: opportunities/verdicts captured while streaming, so export needn't
  // re-derive. Purely an optimization — on a cold/different lambda instance it's empty and we
  // re-derive from the (cheap in-memory) stream source.
  const oppCache = new Map<string, Map<string, Opportunity>>();
  const verdictCache = new Map<string, Verdict>();

  /** Collect a run's opportunities and verdict from the stream source (used on a cache miss). */
  async function deriveRun(
    runId: string,
    objective: StartObjectiveRequest,
  ): Promise<{ opportunities: Map<string, Opportunity>; verdict: Verdict | undefined }> {
    const opps = new Map<string, Opportunity>();
    let verdict: Verdict | undefined;
    const source = streamSource({ runId, objective, speed: 0, aborted: () => false });
    for await (const ev of source) {
      if (ev.type === 'opportunity.added') opps.set(ev.opportunity.id, ev.opportunity);
      if (ev.type === 'verdict.ready') verdict = ev.verdict;
    }
    return { opportunities: opps, verdict };
  }

  const speedDefault = Number(process.env.MINERVA_REPLAY_SPEED ?? 1);
  const app = new Hono();

  // Harmless when same-origin (prod / one-server local); enables a cross-origin dev client if used.
  app.use('*', cors());

  app.get('/api/health', (c) => c.json({ ok: true }));

  // POST /api/objectives — start a run, return its (self-describing) id.
  app.post('/api/objectives', async (c) => {
    let body: Partial<StartObjectiveRequest>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'body must be JSON' }, 400);
    }
    const kind = body?.kind as ObjectiveKind;
    if (!OBJECTIVE_KINDS.includes(kind)) {
      return c.json({ error: `kind must be one of ${OBJECTIVE_KINDS.join(', ')}` }, 400);
    }
    if (typeof body.statement !== 'string' || body.statement.trim() === '') {
      return c.json({ error: 'statement must be a non-empty string' }, 400);
    }
    const objective: StartObjectiveRequest = {
      kind,
      statement: body.statement,
      scope: body.scope,
    };
    return c.json({ runId: encodeRunId(objective) }, 201);
  });

  // GET /api/objectives/:runId/events — SSE replay of the run's events.
  app.get('/api/objectives/:runId/events', (c) => {
    const runId = c.req.param('runId');
    const objective = decodeRunId(runId);
    if (!objective) return c.json({ error: `unknown run ${runId}` }, 404);

    // ?speed=N scales cadence (0 = instant); defaults to MINERVA_REPLAY_SPEED (prod can compress
    // to stay within the function's max duration).
    const speedRaw = c.req.query('speed');
    const speed = speedRaw === undefined ? speedDefault : Math.max(0, Number(speedRaw) || 0);

    return streamSSE(c, async (stream) => {
      let closed = false;
      stream.onAbort(() => { closed = true; });
      const captured = new Map<string, Opportunity>();
      let capturedVerdict: Verdict | undefined;
      const source = streamSource({ runId, objective, speed, aborted: () => closed });
      for await (const ev of source) {
        if (closed) break;
        if (ev.type === 'opportunity.added') captured.set(ev.opportunity.id, ev.opportunity);
        if (ev.type === 'verdict.ready') capturedVerdict = ev.verdict;
        // Default `message` event so the FE's `EventSource.onmessage` + JSON.parse path works;
        // `id` carries `seq` for ordering / Last-Event-ID resumption.
        await stream.writeSSE({ data: JSON.stringify(ev), id: String(ev.seq) });
      }
      if (!closed && captured.size) oppCache.set(runId, captured);
      if (!closed && capturedVerdict) verdictCache.set(runId, capturedVerdict);
    });
  });

  // POST /api/objectives/:runId/opportunities/:oppId/export — create a Dynatrace notebook for the
  // opportunity and return its URL (the "beyond chat" act). Body: { kind: "notebook" }.
  app.post('/api/objectives/:runId/opportunities/:oppId/export', async (c) => {
    const runId = c.req.param('runId');
    const oppId = c.req.param('oppId');
    const objective = decodeRunId(runId);
    if (!objective) return c.json({ error: `unknown run ${runId}` }, 404);

    let body: { kind?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'body must be JSON' }, 400);
    }
    if (body?.kind !== 'notebook') {
      return c.json({ error: 'kind must be "notebook"' }, 400);
    }

    // Validation mode: there's one Verdict per run (the `oppId` path param is ignored). Resolve it
    // from the same-process cache, else re-derive from the stream, then export it as a notebook.
    if (objective.kind === 'validate-task') {
      let verdict = verdictCache.get(runId);
      if (!verdict) {
        const derived = await deriveRun(runId, objective);
        if (derived.verdict) verdictCache.set(runId, derived.verdict);
        verdict = derived.verdict;
      }
      if (!verdict) {
        return c.json({ error: `no verdict for run ${runId}` }, 404);
      }
      try {
        const { url } = await verdictExporter({ verdict, objective });
        return c.json({ url });
      } catch (e) {
        return c.json({ error: `export failed: ${(e as Error).message}` }, 502);
      }
    }

    // Fast-path the same-process cache; otherwise re-derive the run's opportunities statelessly.
    let opps = oppCache.get(runId);
    if (!opps) {
      const derived = await deriveRun(runId, objective);
      opps = derived.opportunities;
      oppCache.set(runId, opps);
    }
    const opportunity = opps.get(oppId);
    if (!opportunity) {
      return c.json({ error: `unknown opportunity ${oppId}` }, 404);
    }

    try {
      const { url } = await exporter({ opportunity, objective });
      return c.json({ url });
    } catch (e) {
      return c.json({ error: `export failed: ${(e as Error).message}` }, 502);
    }
  });

  return app;
}
