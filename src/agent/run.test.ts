import { describe, it, expect, vi } from 'vitest';
import { runMinerva, type RunnerLike } from './run.js';
import type { AgentEvent, Opportunity, StartObjectiveRequest, Verdict } from '../contract.js';
import { validateAgentEvent } from '../contract.js';
import type { McpDqlTool } from './tools.js';

// A fully-valid opportunity the scripted agent "finds".
const heroOpp: Opportunity = {
  id: 'opp-1',
  finding: 'checkout /pay p95 is dominated by one unindexed orders query',
  impact: { metric: 'p95', before: 4.2, after: 1.5, unit: 's', assumption: 'the query is the dominant cost share' },
  effort: 'low',
  confidence: 'high',
  confidenceReason: 'query share measured directly from spans',
  dissent: '',
  recommendedAction: 'add an index on orders(email)',
  evidence: [
    { id: 'e1', source: 'DYNATRACE', label: 'db-hotspots', resultSummary: '2 rows', confidence: 'high' },
  ],
};

const objective: StartObjectiveRequest = {
  kind: 'improve-performance',
  statement: 'make checkout fast',
};

/** A mock MCP execute_dql tool: declares its arg as `dqlStatement`, returns 2 rows + scan bytes. */
function mockExecuteDql(): McpDqlTool & { runAsync: ReturnType<typeof vi.fn> } {
  return {
    _getDeclaration: () => ({ parameters: { properties: { dqlStatement: { type: 'string' } } } }),
    runAsync: vi.fn(async () => ({
      content: [{ type: 'text', text: JSON.stringify({ records: [{ a: 1 }, { a: 2 }], metadata: { scannedBytes: 2_000_000 } }) }],
    })),
  };
}

/** A fake runner that drives the agent's emitter tools in a scripted order, like a real run would. */
function scriptedRunner(): (agent: unknown) => RunnerLike {
  return (agent: unknown) => {
    const tools = (agent as { tools: { name: string; runAsync: (r: unknown) => Promise<unknown> }[] }).tools;
    const call = (name: string, args: Record<string, unknown>) => {
      const t = tools.find((x) => x.name === name);
      if (!t) throw new Error(`tool ${name} not found`);
      return t.runAsync({ args, toolContext: {} });
    };
    return {
      async *runEphemeral() {
        await call('emit_plan', { steps: [{ id: 's1', description: 'rank services' }, { id: 's2', description: 'db hotspots' }] });
        yield { usageMetadata: { totalTokenCount: 100 } };
        await call('run_query', { stepId: 's1', label: 'red', dql: 'fetch spans | filter span.kind == "client"' });
        await call('run_query', { stepId: 's2', label: 'db-hotspots', dql: 'fetch spans, from: now()-30m | filter span.kind == "client" | summarize p95 = percentile(duration, 95, rollup: avg), by: { db.statement }' });
        await call('add_opportunity', { opportunity: heroOpp });
        yield { usageMetadata: { totalTokenCount: 200 } };
        await call('finalize_board', { rankedOpportunityIds: ['opp-1'] });
      },
    };
  };
}

// A fully-valid refuted verdict the scripted validation agent reaches.
const heroVerdict: Verdict = {
  id: 'v-1',
  stance: 'refuted',
  claim: 'rewriting the orders query in /pay will cut p95 in half',
  service: 'checkout',
  endpoint: '/pay',
  impact: { metric: 'p95', before: 4.2, after: 4.0, unit: 's', assumption: 'the query is fully eliminated' },
  whySmall: 'this query is only 4% of /pay span time',
  confidence: 'high',
  confidenceReason: 'span share measured directly',
  dissent: '',
  recommendedAction: 'pursue the dominant downstream call instead',
  evidence: [
    { id: 'e1', source: 'DYNATRACE', label: 'pay-span-breakdown', resultSummary: 'orders query 4%', confidence: 'high' },
  ],
  redirect: { finding: 'a downstream payment-gateway call dominates /pay', deltaLine: 'p95 4.2s → ~1.5s (−64%)', objectiveKind: 'improve-performance' },
};

const validateObjective: StartObjectiveRequest = {
  kind: 'validate-task',
  statement: 'rewriting the orders query in /pay will cut p95 in half',
};

/** A fake runner that drives the validation tools: emit_plan → run_query×N → emit_verdict. */
function scriptedValidationRunner(): (agent: unknown) => RunnerLike {
  return (agent: unknown) => {
    const tools = (agent as { tools: { name: string; runAsync: (r: unknown) => Promise<unknown> }[] }).tools;
    const call = (name: string, args: Record<string, unknown>) => {
      const t = tools.find((x) => x.name === name);
      if (!t) throw new Error(`tool ${name} not found`);
      return t.runAsync({ args, toolContext: {} });
    };
    return {
      async *runEphemeral() {
        await call('emit_plan', { steps: [{ id: 's1', description: 'measure /pay p95' }, { id: 's2', description: 'size the orders query share' }] });
        yield { usageMetadata: { totalTokenCount: 100 } };
        await call('run_query', { stepId: 's1', label: 'pay-p95', dql: 'timeseries p95 = percentile(dt.service.request.response_time, 95, rollup: avg), by: { dt.service.name }, from: now()-2h' });
        await call('run_query', { stepId: 's2', label: 'pay-span-breakdown', dql: 'fetch spans, from: now()-2h | filter span.kind == "client" | summarize p95 = percentile(duration, 95, rollup: avg), by: { db.statement } | sort p95 desc | limit 10' });
        await call('emit_verdict', { ...heroVerdict });
        yield { usageMetadata: { totalTokenCount: 200 } };
      },
    };
  };
}

async function collect(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

describe('runMinerva — event translation', () => {
  it('emits a contract-valid, ordered, monotonic stream', async () => {
    const events = await collect(
      runMinerva(objective, 'run_test', { makeRunner: scriptedRunner(), getExecuteDqlTool: async () => mockExecuteDql() }),
    );

    // every event is contract-valid
    for (const ev of events) expect(validateAgentEvent(ev)).toEqual([]);

    // seq is 1..N monotonic; runId is bound
    events.forEach((ev, i) => {
      expect(ev.seq).toBe(i + 1);
      expect(ev.runId).toBe('run_test');
    });

    // the expected shape
    expect(events.map((e) => e.type)).toEqual([
      'run.started',
      'plan.proposed',
      'step.started',
      'step.completed',
      'step.started',
      'step.completed',
      'opportunity.added',
      'board.ready',
      'run.completed',
    ]);
  });

  it('keeps every step id within the declared plan', async () => {
    const events = await collect(
      runMinerva(objective, 'r', { makeRunner: scriptedRunner(), getExecuteDqlTool: async () => mockExecuteDql() }),
    );
    const planEv = events.find((e) => e.type === 'plan.proposed');
    const planIds = new Set(planEv?.type === 'plan.proposed' ? planEv.steps.map((s) => s.id) : []);
    for (const ev of events) {
      if (ev.type === 'step.started' || ev.type === 'step.completed') {
        expect(planIds.has(ev.stepId)).toBe(true);
      }
    }
  });

  it('tallies queryCount, tokens, and scanned GB into run.completed', async () => {
    const events = await collect(
      runMinerva(objective, 'r', { makeRunner: scriptedRunner(), getExecuteDqlTool: async () => mockExecuteDql() }),
    );
    const done = events.at(-1);
    expect(done?.type).toBe('run.completed');
    if (done?.type === 'run.completed') {
      expect(done.queryCount).toBe(2);
      expect(done.estCost?.tokens).toBe(300); // 100 + 200, partial events excluded
      expect(done.estCost?.grailGbScanned).toBeCloseTo(0.004, 3); // 2 × 2MB
    }
  });
});

describe('run_query', () => {
  it('routes DQL through the MCP tool under its discovered arg key, unmodified', async () => {
    const mcp = mockExecuteDql();
    await collect(runMinerva(objective, 'r', { makeRunner: scriptedRunner(), getExecuteDqlTool: async () => mcp }));

    expect(mcp.runAsync).toHaveBeenCalledTimes(2);
    const firstArgs = mcp.runAsync.mock.calls[0]![0] as { args: Record<string, string> };
    // arg key discovered from the declaration
    expect(firstArgs.args).toHaveProperty('dqlStatement');
    // guardDql does not rewrite the query — it is passed through verbatim
    expect(firstArgs.args.dqlStatement).toBe('fetch spans | filter span.kind == "client"');
  });

  it('always terminates with run.completed even if the agent errors', async () => {
    const throwingRunner = (): ((a: unknown) => RunnerLike) => () => ({
      // eslint-disable-next-line require-yield
      async *runEphemeral() {
        throw new Error('model exploded');
      },
    });
    const events = await collect(
      runMinerva(objective, 'r', { makeRunner: throwingRunner(), getExecuteDqlTool: async () => mockExecuteDql() }),
    );
    expect(events.map((e) => e.type)).toEqual(['run.started', 'error', 'run.completed']);
    for (const ev of events) expect(validateAgentEvent(ev)).toEqual([]);
  });
});

describe('runMinerva — validation mode', () => {
  it('drives emit_plan → run_query×N → emit_verdict into a contract-valid stream', async () => {
    const events = await collect(
      runMinerva(validateObjective, 'run_validate', {
        makeRunner: scriptedValidationRunner(),
        getExecuteDqlTool: async () => mockExecuteDql(),
      }),
    );

    // every event is contract-valid
    for (const ev of events) expect(validateAgentEvent(ev)).toEqual([]);

    // seq is 1..N monotonic; runId is bound
    events.forEach((ev, i) => {
      expect(ev.seq).toBe(i + 1);
      expect(ev.runId).toBe('run_validate');
    });

    // run.started → plan.proposed → (step.*) → verdict.ready → run.completed
    expect(events.map((e) => e.type)).toEqual([
      'run.started',
      'plan.proposed',
      'step.started',
      'step.completed',
      'step.started',
      'step.completed',
      'verdict.ready',
      'run.completed',
    ]);

    // run.started carries the validate-task kind
    const started = events[0];
    expect(started?.type === 'run.started' && started.objective.kind).toBe('validate-task');
  });

  it('keeps every step id within the declared plan', async () => {
    const events = await collect(
      runMinerva(validateObjective, 'r', {
        makeRunner: scriptedValidationRunner(),
        getExecuteDqlTool: async () => mockExecuteDql(),
      }),
    );
    const planEv = events.find((e) => e.type === 'plan.proposed');
    const planIds = new Set(planEv?.type === 'plan.proposed' ? planEv.steps.map((s) => s.id) : []);
    for (const ev of events) {
      if (ev.type === 'step.started' || ev.type === 'step.completed') {
        expect(planIds.has(ev.stepId)).toBe(true);
      }
    }
  });
});
