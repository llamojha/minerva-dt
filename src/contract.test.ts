import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  validateAgentEvent,
  isAgentEvent,
  type AgentEvent,
  type OpportunityAdded,
  type BoardReady,
} from './contract.js';

const fixtureUrl = new URL('../fixtures/improve-performance.jsonl', import.meta.url);

function loadFixture(): AgentEvent[] {
  const raw = readFileSync(fixtureUrl, 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  return lines.map((line, i) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new Error(`line ${i + 1} is not valid JSON: ${(err as Error).message}`);
    }
    return parsed as AgentEvent;
  });
}

describe('improve-performance fixture conforms to the event contract', () => {
  const events = loadFixture();

  it('contains events', () => {
    expect(events.length).toBeGreaterThan(0);
  });

  it('every line is a well-formed AgentEvent', () => {
    events.forEach((evt, i) => {
      const errors = validateAgentEvent(evt);
      expect(errors, `line ${i + 1} (seq ${(evt as { seq?: number }).seq}): ${errors.join('; ')}`).toEqual([]);
      expect(isAgentEvent(evt)).toBe(true);
    });
  });

  it('seq is monotonic, starts at 1, and increments by 1', () => {
    events.forEach((evt, i) => {
      expect(evt.seq, `line ${i + 1}`).toBe(i + 1);
    });
  });

  it('all events share a single runId', () => {
    const runIds = new Set(events.map((e) => e.runId));
    expect(runIds.size).toBe(1);
  });

  it('starts with run.started and ends with run.completed', () => {
    expect(events[0]!.type).toBe('run.started');
    expect(events.at(-1)!.type).toBe('run.completed');
  });

  it('every board.ready id corresponds to an emitted opportunity.added', () => {
    const emitted = new Set(
      events
        .filter((e): e is OpportunityAdded => e.type === 'opportunity.added')
        .map((e) => e.opportunity.id),
    );
    const boards = events.filter((e): e is BoardReady => e.type === 'board.ready');
    expect(boards.length).toBeGreaterThan(0);
    boards.forEach((board) => {
      board.rankedOpportunityIds.forEach((id) => {
        expect(emitted.has(id), `board.ready references unknown opportunity "${id}"`).toBe(true);
      });
    });
  });

  it('timestamps are non-decreasing', () => {
    for (let i = 1; i < events.length; i++) {
      const prev = Date.parse(events[i - 1]!.ts);
      const cur = Date.parse(events[i]!.ts);
      expect(cur, `line ${i + 1} ts went backwards`).toBeGreaterThanOrEqual(prev);
    }
  });
});

describe('validateAgentEvent rejects malformed events', () => {
  it('flags an unknown type', () => {
    expect(validateAgentEvent({ type: 'nope', runId: 'r', seq: 1, ts: '2026-01-01T00:00:00Z' }).length).toBeGreaterThan(0);
  });

  it('flags a missing assumption on an opportunity impact', () => {
    const bad = {
      type: 'opportunity.added',
      runId: 'r',
      seq: 1,
      ts: '2026-01-01T00:00:00Z',
      opportunity: {
        id: 'x',
        finding: 'f',
        impact: { metric: 'p95', before: 4, after: 1, unit: 's', assumption: '' },
        effort: 'low',
        confidence: 'high',
        confidenceReason: 'r',
        dissent: '',
        recommendedAction: 'a',
        evidence: [],
      },
    };
    expect(validateAgentEvent(bad)).toContain('opportunity.impact.assumption must be a non-empty string');
  });

  it('flags a non-integer seq', () => {
    expect(validateAgentEvent({ type: 'step.started', runId: 'r', seq: 1.5, ts: '2026-01-01T00:00:00Z', stepId: 's1' })).toContain(
      'seq must be an integer',
    );
  });
});

describe('verdict.ready (validation mode)', () => {
  const base = { runId: 'r', seq: 1, ts: '2026-01-01T00:00:00Z' };
  const verdict = {
    id: 'v1',
    stance: 'refuted',
    claim: 'Adding an index will help',
    service: 'checkout',
    endpoint: '/pay',
    impact: { metric: 'p95', before: 4.2, after: 4.1, unit: 's', assumption: 'query mix holds' },
    whySmall: 'only 4% of span time',
    confidence: 'high',
    confidenceReason: 'measured directly',
    dissent: '',
    recommendedAction: 'skip it',
    evidence: [{ id: 'e1', source: 'DYNATRACE', label: 'slow-spans', resultSummary: '4%', confidence: 'high' }],
    redirect: { finding: 'the real hotspot', deltaLine: 'p95 4.2s → 1.5s', objectiveKind: 'improve-performance' },
  };

  it('accepts a well-formed refuted verdict (with impact + redirect)', () => {
    expect(validateAgentEvent({ ...base, type: 'verdict.ready', verdict })).toEqual([]);
  });

  it('accepts an inconclusive verdict with null impact', () => {
    const inconclusive = { ...verdict, stance: 'inconclusive', impact: null, redirect: undefined };
    expect(validateAgentEvent({ ...base, type: 'verdict.ready', verdict: inconclusive })).toEqual([]);
  });

  it('flags an invalid stance', () => {
    expect(validateAgentEvent({ ...base, type: 'verdict.ready', verdict: { ...verdict, stance: 'maybe' } })).toContain(
      'verdict.stance must be one of confirmed, refuted, inconclusive',
    );
  });

  it('flags a present-but-malformed impact', () => {
    const bad = { ...verdict, impact: { metric: 'p95', before: 4, after: 1, unit: 's', assumption: '' } };
    expect(validateAgentEvent({ ...base, type: 'verdict.ready', verdict: bad })).toContain(
      'verdict.impact.assumption must be a non-empty string',
    );
  });
});
