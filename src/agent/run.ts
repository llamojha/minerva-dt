// Minerva — the loop runner (M3).
//
// `runMinerva` is an AsyncGenerator<AgentEvent> with the SAME shape as the fixture `replay()`, so
// it drops into the SSE seam in src/server/app.ts with no endpoint change. The agent runs
// autonomously; its tool calls (tools.ts) push contract events into a queue that this generator
// drains. The runner owns only the lifecycle events (run.started / run.completed) and the
// seq/ts/runId stamping + validation.

import { InMemoryRunner, type LlmAgent } from '@google/adk';
import type { Content } from '@google/genai';
import {
  type AgentEvent,
  type StartObjectiveRequest,
  validateAgentEvent,
} from '../contract.js';
import { createDynatraceToolset } from '../dynatrace/index.js';
import { buildMinervaAgent } from './index.js';
import { buildEmitterTools, type EmitInput, type McpDqlTool, type RunStats } from './tools.js';
import { objectiveMessage, validationMessage, SYSTEM_PROMPT, VALIDATION_PROMPT } from './prompt.js';

/** Minimal slice of an ADK runner so tests can inject a fake. */
interface RunEvent {
  usageMetadata?: { totalTokenCount?: number };
  partial?: boolean;
}
export interface RunnerLike {
  runEphemeral(p: { userId: string; newMessage: Content }): AsyncGenerator<RunEvent>;
}

export interface RunMinervaDeps {
  /** Provide the MCP execute_dql tool (tests mock it). Default: build from the Dynatrace toolset. */
  getExecuteDqlTool?: () => Promise<McpDqlTool>;
  /** Build the runner for an agent (tests inject a fake). Default: InMemoryRunner. */
  makeRunner?: (agent: LlmAgent) => RunnerLike;
  /** Optional tee for every emitted event — used to capture a run as an M8 fixture. */
  record?: (ev: AgentEvent) => void;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Run one objective to completion, yielding contract events as the agent investigates.
 * Always terminates with `run.completed` (even on failure — the agent's error is emitted first).
 */
export async function* runMinerva(
  objective: StartObjectiveRequest,
  runId: string,
  deps: RunMinervaDeps = {},
): AsyncGenerator<AgentEvent> {
  const startedAt = Date.now();
  let seq = 0;
  let tokens = 0;
  const stats: RunStats = { queryCount: 0, grailGbScanned: 0 };
  // validate-task drives the validation toolset/prompt; everything else is discovery.
  const mode = objective.kind === 'validate-task' ? 'validation' : 'discovery';

  // ── producer/consumer bridge ──
  const queue: AgentEvent[] = [];
  let resolveNext: (() => void) | null = null;
  let done = false;
  const wake = () => {
    if (resolveNext) { const r = resolveNext; resolveNext = null; r(); }
  };
  const stamp = (partial: EmitInput): AgentEvent => {
    seq += 1;
    const ev = { ...partial, runId, seq, ts: new Date().toISOString() } as AgentEvent;
    const errs = validateAgentEvent(ev);
    if (errs.length) throw new Error(`runMinerva emitted invalid ${ev.type}: ${errs.join('; ')}`);
    deps.record?.(ev);
    return ev;
  };
  const emit = (partial: EmitInput) => { queue.push(stamp(partial)); wake(); };

  emit({
    type: 'run.started',
    objective: { kind: objective.kind, statement: objective.statement, scope: objective.scope },
  });

  let toolsetToClose: { close: () => Promise<void> } | undefined;

  // The agent drives itself; tool calls enqueue events. We only collect token usage here.
  const producer = (async () => {
    try {
      let executeDql: McpDqlTool;
      if (deps.getExecuteDqlTool) {
        executeDql = await deps.getExecuteDqlTool();
      } else {
        const toolset = createDynatraceToolset();
        toolsetToClose = toolset;
        const all = await toolset.getTools();
        const tool = all.find((t) => t.name === 'execute_dql');
        if (!tool) {
          throw new Error(
            `execute_dql not found on the Dynatrace MCP server; available: ${all.map((t) => t.name).join(', ')}`,
          );
        }
        executeDql = tool as unknown as McpDqlTool;
      }

      const tools = buildEmitterTools({ emit, executeDql, stats, mode });
      const instruction = mode === 'validation' ? VALIDATION_PROMPT : SYSTEM_PROMPT;
      const agent = buildMinervaAgent({ tools, instruction });
      const runner: RunnerLike = deps.makeRunner ? deps.makeRunner(agent) : new InMemoryRunner({ agent });

      const text =
        mode === 'validation'
          ? validationMessage(objective.statement, objective.scope)
          : objectiveMessage(objective.kind, objective.statement, objective.scope);
      const newMessage: Content = {
        role: 'user',
        parts: [{ text }],
      };

      for await (const ev of runner.runEphemeral({ userId: runId, newMessage })) {
        // Sum token usage on settled (non-partial) responses to avoid double-counting streams.
        if (!ev.partial && typeof ev.usageMetadata?.totalTokenCount === 'number') {
          tokens += ev.usageMetadata.totalTokenCount;
        }
      }
    } catch (e) {
      emit({ type: 'error', stage: 'investigate', message: (e as Error).message });
    } finally {
      done = true;
      wake();
    }
  })();

  try {
    // Drain enqueued events until the agent is done and the queue is empty.
    while (true) {
      while (queue.length) yield queue.shift() as AgentEvent;
      if (done) break;
      await new Promise<void>((r) => { resolveNext = r; });
    }
    // Lifecycle close-out.
    emit({
      type: 'run.completed',
      totalDurationMs: Date.now() - startedAt,
      queryCount: stats.queryCount,
      estCost: { grailGbScanned: round(stats.grailGbScanned), tokens },
    });
    while (queue.length) yield queue.shift() as AgentEvent;
  } finally {
    await producer.catch(() => {});
    await toolsetToClose?.close().catch(() => {});
  }
}
