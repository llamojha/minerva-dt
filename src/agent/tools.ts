// Minerva — the agent's local tools (M3).
//
// These are how the autonomous agent reports structured output: instead of us parsing free text,
// the model *calls a tool* for each beat and we emit the matching contract event as a side-effect.
//   run_query              → step.started / step.completed   (wraps the MCP execute_dql)
//   emit_plan              → plan.proposed
//   add_opportunity        → opportunity.added               (the M4 estimate + ranking inputs)
//   finalize_board         → board.ready
//   emit_verdict           → verdict.ready                   (validation mode's terminal beat)
//   note_insufficient_data → error (never fabricate)
//
// run_query is the only read path and it runs *through the Dynatrace MCP server* — the partner
// integration stays meaningful — while the explicit stepId keeps plan↔step alignment clean.

import { FunctionTool } from '@google/adk';
import { Type, type Schema } from '@google/genai';
import type { AgentEvent, Opportunity, Verdict } from '../contract.js';
import { guardDql } from '../dynatrace/index.js';

/** Distributive Omit so the discriminated union is preserved per-variant. */
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
/** An event with the run-level fields (runId/seq/ts) still to be stamped by the runner. */
export type EmitInput = DistributiveOmit<AgentEvent, 'runId' | 'seq' | 'ts'>;
export type Emit = (e: EmitInput) => void;

/** Per-run counters surfaced in run.completed.estCost. */
export interface RunStats {
  queryCount: number;
  grailGbScanned: number;
}

/** The minimal slice of the MCP execute_dql tool we call programmatically. */
export interface McpDqlTool {
  runAsync(req: { args: Record<string, unknown>; toolContext?: unknown }): Promise<unknown>;
  _getDeclaration?: () => { parameters?: { properties?: Record<string, { type?: string }> } } | undefined;
}

/** Which terminal tools the agent gets: a ranked board (discovery) or a single verdict (validation). */
export type AgentMode = 'discovery' | 'validation';

export interface EmitterToolDeps {
  emit: Emit;
  /** The MCP execute_dql tool (from createDynatraceToolset().getTools()). */
  executeDql: McpDqlTool;
  stats: RunStats;
  /** Discovery → add_opportunity/finalize_board; validation → emit_verdict. */
  mode: AgentMode;
}

// The dynatrace-mcp-server's execute_dql arg name isn't known offline; discover it from the tool
// declaration (prefer a property mentioning dql/statement/query), falling back to 'dql'.
function dqlArgKey(tool: McpDqlTool): string {
  const props = tool._getDeclaration?.()?.parameters?.properties ?? {};
  const names = Object.keys(props);
  const pref = names.find((n) => /dql|statement|query/i.test(n));
  return pref ?? names[0] ?? 'dql';
}

// MCP tool results are typically { content: [{ type:'text', text }] }. Pull rows + scanned GB out
// of whatever shape we get, defensively — exact shape is confirmed at the live smoke.
function parseMcpResult(result: unknown): { rows: unknown; rowCount: number; grailGb: number } {
  let payload: unknown = result;
  const asRec = (v: unknown): Record<string, unknown> | undefined =>
    typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;

  const top = asRec(result);
  const content = top?.content;
  if (Array.isArray(content)) {
    const text = content.map((c) => asRec(c)?.text).find((t) => typeof t === 'string') as string | undefined;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = text; }
    }
  }

  const rec = asRec(payload);
  const rows = (rec?.records ?? rec?.rows ?? rec?.result ?? payload) as unknown;
  const rowCount = Array.isArray(rows) ? rows.length : rec?.records ? 0 : 0;
  const meta = asRec(rec?.metadata) ?? asRec(rec?.grailMetadata);
  const scannedBytes = Number(meta?.scannedBytes ?? meta?.scannedDataPoints ?? 0);
  const grailGb = scannedBytes > 0 ? scannedBytes / 1e9 : 0;
  return { rows, rowCount: Array.isArray(rows) ? rows.length : rowCount, grailGb };
}

// ─── genai parameter schemas ─────────────────────────────────────────────────

const planSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    steps: {
      type: Type.ARRAY,
      description: '3–6 ordered investigation steps',
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: 'short id, e.g. s1' },
          description: { type: Type.STRING },
        },
        required: ['id', 'description'],
      },
    },
  },
  required: ['steps'],
};

const runQuerySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    stepId: { type: Type.STRING, description: 'id of the plan step this query advances' },
    label: { type: Type.STRING, description: 'short human label, e.g. "db-hotspots"' },
    dql: { type: Type.STRING, description: 'the DQL to execute (scoped: from:, filter, limit)' },
  },
  required: ['stepId', 'label', 'dql'],
};

const evidenceSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    source: { type: Type.STRING, description: 'DYNATRACE | DAVIS | INFERRED | ASSUMPTION' },
    label: { type: Type.STRING },
    resultSummary: { type: Type.STRING },
    dql: { type: Type.STRING },
    deepLink: { type: Type.STRING },
    confidence: { type: Type.STRING, description: 'high | medium | low' },
  },
  required: ['id', 'source', 'label', 'resultSummary', 'confidence'],
};

const opportunitySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    finding: { type: Type.STRING, description: 'one-sentence finding' },
    impact: {
      type: Type.OBJECT,
      properties: {
        metric: { type: Type.STRING },
        before: { type: Type.NUMBER },
        after: { type: Type.NUMBER },
        unit: { type: Type.STRING },
        assumption: { type: Type.STRING, description: 'the assumption the estimate depends on — required' },
      },
      required: ['metric', 'before', 'after', 'unit', 'assumption'],
    },
    effort: { type: Type.STRING, description: 'low | medium | high' },
    confidence: { type: Type.STRING, description: 'high | medium | low' },
    confidenceReason: { type: Type.STRING },
    dissent: { type: Type.STRING, description: 'contrary signal, "" if none' },
    recommendedAction: { type: Type.STRING },
    evidence: { type: Type.ARRAY, items: evidenceSchema },
  },
  required: ['id', 'finding', 'impact', 'effort', 'confidence', 'confidenceReason', 'dissent', 'recommendedAction', 'evidence'],
};

const addOpportunitySchema: Schema = {
  type: Type.OBJECT,
  properties: { opportunity: opportunitySchema },
  required: ['opportunity'],
};

const finalizeBoardSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    rankedOpportunityIds: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['rankedOpportunityIds'],
};

const verdictSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    stance: { type: Type.STRING, description: 'confirmed | refuted | inconclusive' },
    claim: { type: Type.STRING, description: 'the claim under test, restated' },
    service: { type: Type.STRING },
    endpoint: { type: Type.STRING },
    // Present (a full estimate) for confirmed/refuted; omit (or null) when inconclusive.
    impact: {
      type: Type.OBJECT,
      description: 'quantified before→after projection; omit for inconclusive',
      properties: {
        metric: { type: Type.STRING },
        before: { type: Type.NUMBER },
        after: { type: Type.NUMBER },
        unit: { type: Type.STRING },
        assumption: { type: Type.STRING, description: 'the assumption the estimate depends on — required' },
      },
      required: ['metric', 'before', 'after', 'unit', 'assumption'],
    },
    whySmall: { type: Type.STRING, description: 'for refuted: why the projected win is small (quantified)' },
    confidence: { type: Type.STRING, description: 'high | medium | low' },
    confidenceReason: { type: Type.STRING },
    dissent: { type: Type.STRING, description: 'contrary signal, "" if none' },
    recommendedAction: { type: Type.STRING, description: 'concrete action, or what to instrument when inconclusive' },
    evidence: { type: Type.ARRAY, items: evidenceSchema },
    redirect: {
      type: Type.OBJECT,
      description: 'the real dominant finding to pursue instead (refuted/inconclusive)',
      properties: {
        finding: { type: Type.STRING },
        deltaLine: { type: Type.STRING, description: 'e.g. "p95 4.2s → ~1.5s (−64%)"' },
        objectiveKind: { type: Type.STRING, description: 'the discovery objective to run, e.g. improve-performance' },
      },
      required: ['finding', 'deltaLine', 'objectiveKind'],
    },
  },
  required: ['id', 'stance', 'claim', 'service', 'endpoint', 'confidence', 'confidenceReason', 'dissent', 'recommendedAction', 'evidence'],
};

const insufficientSchema: Schema = {
  type: Type.OBJECT,
  properties: { reason: { type: Type.STRING } },
  required: ['reason'],
};

// ─── tool factory ────────────────────────────────────────────────────────────

/** Build the agent's tools, bound to a single run's event sink + stats. */
export function buildEmitterTools(deps: EmitterToolDeps): FunctionTool[] {
  const { emit, executeDql, stats, mode } = deps;
  const argKey = dqlArgKey(executeDql);

  const runQuery = new FunctionTool({
    name: 'run_query',
    description:
      'Execute one scoped, cost-aware DQL query against Dynatrace and return its rows. Tag it with the plan stepId it advances. Always include from:, a filter, and limit.',
    parameters: runQuerySchema,
    execute: async (input, toolContext) => {
      const { stepId, label, dql } = input as { stepId: string; label: string; dql: string };
      const guarded = guardDql(dql);
      emit({ type: 'step.started', stepId });
      const start = Date.now();
      try {
        const result = await executeDql.runAsync({ args: { [argKey]: guarded.dql }, toolContext });
        const { rows, rowCount, grailGb } = parseMcpResult(result);
        stats.queryCount += 1;
        stats.grailGbScanned += grailGb;
        emit({
          type: 'step.completed',
          stepId,
          dql: guarded.dql,
          resultSummary: `${label}: ${rowCount} row${rowCount === 1 ? '' : 's'}`,
          durationMs: Date.now() - start,
          rowCount,
        });
        // Return the rows to the model, plus any guard warnings so it can self-correct.
        return { rows, rowCount, warnings: guarded.warnings };
      } catch (e) {
        emit({ type: 'step.failed', stepId, message: (e as Error).message });
        return { error: (e as Error).message };
      }
    },
  });

  const emitPlan = new FunctionTool({
    name: 'emit_plan',
    description: 'Report the ordered investigation plan (3–6 steps). Call once, before any query.',
    parameters: planSchema,
    execute: async (input) => {
      const { steps } = input as { steps: { id: string; description: string }[] };
      emit({ type: 'plan.proposed', steps });
      return { ok: true };
    },
  });

  const addOpportunity = new FunctionTool({
    name: 'add_opportunity',
    description:
      'Report one evidence-backed opportunity (finding, quantified impact WITH assumption, effort, confidence + reason, dissent, recommended action, evidence).',
    parameters: addOpportunitySchema,
    execute: async (input) => {
      const { opportunity } = input as { opportunity: Opportunity };
      emit({ type: 'opportunity.added', opportunity });
      return { ok: true };
    },
  });

  const finalizeBoard = new FunctionTool({
    name: 'finalize_board',
    description: 'Report the final ranking (opportunity ids, best first). Call once, at the end.',
    parameters: finalizeBoardSchema,
    execute: async (input) => {
      const { rankedOpportunityIds } = input as { rankedOpportunityIds: string[] };
      emit({ type: 'board.ready', rankedOpportunityIds });
      return { ok: true };
    },
  });

  const emitVerdict = new FunctionTool({
    name: 'emit_verdict',
    description:
      'Report the single decisive verdict on the claim (confirmed/refuted/inconclusive). Call once, at the end. Omit impact for inconclusive; include redirect on refuted/inconclusive.',
    parameters: verdictSchema,
    execute: async (input) => {
      const verdict = input as Verdict;
      emit({ type: 'verdict.ready', verdict: { ...verdict, impact: verdict.impact ?? null } });
      return { ok: true };
    },
  });

  const noteInsufficient = new FunctionTool({
    name: 'note_insufficient_data',
    description: 'Call instead of fabricating when the data cannot support any opportunity.',
    parameters: insufficientSchema,
    execute: async (input) => {
      const { reason } = input as { reason: string };
      emit({ type: 'error', stage: 'investigate', message: reason });
      return { ok: true };
    },
  });

  return mode === 'validation'
    ? [emitPlan, runQuery, emitVerdict, noteInsufficient]
    : [emitPlan, runQuery, addOpportunity, finalizeBoard, noteInsufficient];
}
