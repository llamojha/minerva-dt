// Minerva — transport tests for the M0 fixture-replay server.
// Drives the app via `app.fetch` (no socket) and asserts the locked contract holds end to end.

import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { type AgentEvent, validateAgentEvent } from '../contract.js';

/** Parse an SSE response body into the JSON events carried in each `data:` field. */
async function readSSE(res: Response): Promise<AgentEvent[]> {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter((block) => block.includes('data:'))
    .map((block) => {
      const line = block.split('\n').find((l) => l.startsWith('data:'))!;
      return JSON.parse(line.slice('data:'.length).trim()) as AgentEvent;
    });
}

async function startRun(app: ReturnType<typeof createApp>): Promise<string> {
  const res = await app.request('/api/objectives', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'improve-performance', statement: 'Improve performance' }),
  });
  expect(res.status).toBe(201);
  const { runId } = (await res.json()) as { runId: string };
  expect(runId).toMatch(/^run_/);
  return runId;
}

describe('POST /objectives', () => {
  it('rejects a missing/invalid kind', async () => {
    const app = createApp();
    const res = await app.request('/api/objectives', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ statement: 'no kind' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects an empty statement', async () => {
    const app = createApp();
    const res = await app.request('/api/objectives', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'improve-performance', statement: '  ' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /objectives/:runId/events', () => {
  it('404s for an unknown run', async () => {
    const app = createApp();
    const res = await app.request('/api/objectives/run_missing/events');
    expect(res.status).toBe(404);
  });

  it('streams the fixture as a well-formed, contract-valid run', async () => {
    const app = createApp();
    const runId = await startRun(app);

    const res = await app.request(`/api/objectives/${runId}/events?speed=0`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const events = await readSSE(res);

    // Every event is contract-valid.
    for (const ev of events) {
      expect(validateAgentEvent(ev)).toEqual([]);
    }

    // seq is monotonic from 1.
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));

    // runId is rebound to the live run, not the fixture's recorded id.
    expect(events.every((e) => e.runId === runId)).toBe(true);

    // Shape: starts with run.started, ends with the terminal run.completed.
    expect(events[0]?.type).toBe('run.started');
    expect(events.at(-1)?.type).toBe('run.completed');

    // Every board.ready id resolves to an emitted opportunity.
    const oppIds = new Set(
      events.filter((e) => e.type === 'opportunity.added').map((e: any) => e.opportunity.id),
    );
    const board = events.find((e) => e.type === 'board.ready') as any;
    expect(board).toBeTruthy();
    for (const id of board.rankedOpportunityIds) {
      expect(oppIds.has(id)).toBe(true);
    }
  });
});

describe('validate-task (validation mode)', () => {
  async function startValidation(app: ReturnType<typeof createApp>): Promise<string> {
    const res = await app.request('/api/objectives', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'validate-task', statement: 'Add an index to orders.email' }),
    });
    expect(res.status).toBe(201);
    const { runId } = (await res.json()) as { runId: string };
    expect(runId).toMatch(/^run_/);
    return runId;
  }

  it('streams the validate fixture ending in verdict.ready → run.completed', async () => {
    const app = createApp();
    const runId = await startValidation(app);
    const events = await readSSE(await app.request(`/api/objectives/${runId}/events?speed=0`));

    for (const ev of events) expect(validateAgentEvent(ev)).toEqual([]);
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(events.every((e) => e.runId === runId)).toBe(true);
    expect(events[0]?.type).toBe('run.started');
    expect((events[0] as any).objective.kind).toBe('validate-task');

    const verdict = events.find((e) => e.type === 'verdict.ready') as any;
    expect(verdict).toBeTruthy();
    expect(['confirmed', 'refuted', 'inconclusive']).toContain(verdict.verdict.stance);
    // verdict.ready precedes the terminal run.completed.
    const types = events.map((e) => e.type);
    expect(types.indexOf('verdict.ready')).toBeLessThan(types.indexOf('run.completed'));
    expect(events.at(-1)?.type).toBe('run.completed');
  });

  it('exports a verdict run to a notebook URL', async () => {
    const verdictExporter = vi.fn(async ({ verdict }: { verdict: { id: string } }) => ({
      url: `https://env/nb/${verdict.id}`,
    }));
    const app = createApp({ verdictExporter });
    const runId = await startValidation(app);
    // Stream first so the verdict is captured (the oppId path param is ignored for validate-task).
    await readSSE(await app.request(`/api/objectives/${runId}/events?speed=0`));
    const res = await app.request(`/api/objectives/${runId}/opportunities/ignored/export`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'notebook' }),
    });
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(url).toContain('https://env/nb/');
    expect(verdictExporter).toHaveBeenCalledOnce();
  });
});

describe('POST /objectives/:runId/opportunities/:oppId/export', () => {
  /** Start + fully stream a run so its opportunities are captured; returns app, runId, an oppId. */
  async function streamedRun(exporter = vi.fn(async ({ opportunity }: { opportunity: { id: string } }) => ({ url: `https://env/nb/${opportunity.id}` }))) {
    const app = createApp({ exporter });
    const runId = await startRun(app);
    const events = await readSSE(await app.request(`/api/objectives/${runId}/events?speed=0`));
    const oppId = (events.find((e) => e.type === 'opportunity.added') as any).opportunity.id as string;
    return { app, runId, oppId, exporter };
  }

  it('exports a streamed opportunity to a notebook URL', async () => {
    const { app, runId, oppId, exporter } = await streamedRun();
    const res = await app.request(`/api/objectives/${runId}/opportunities/${oppId}/export`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'notebook' }),
    });
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(url).toContain(oppId);
    expect(exporter).toHaveBeenCalledOnce();
  });

  it('rejects a non-notebook kind', async () => {
    const { app, runId, oppId } = await streamedRun();
    const res = await app.request(`/api/objectives/${runId}/opportunities/${oppId}/export`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'ticket' }),
    });
    expect(res.status).toBe(400);
  });

  it('404s for an unknown opportunity', async () => {
    const { app, runId } = await streamedRun();
    const res = await app.request(`/api/objectives/${runId}/opportunities/nope/export`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'notebook' }),
    });
    expect(res.status).toBe(404);
  });

  it('502s when the exporter fails', async () => {
    const failing = vi.fn(async () => { throw new Error('dtctl down'); });
    const { app, runId, oppId } = await streamedRun(failing);
    const res = await app.request(`/api/objectives/${runId}/opportunities/${oppId}/export`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'notebook' }),
    });
    expect(res.status).toBe(502);
  });
});
