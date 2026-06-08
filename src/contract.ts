// Minerva — agent event contract (single source of truth).
//
// These types are the seam between the Minerva agent and the React frontend. The agent emits
// `AgentEvent`s over SSE; the frontend renders them. Both sides import this module so the
// contract can never drift. See `docs/event-contract.md` for the REST surface and SSE framing.

// ─── Domain enums ────────────────────────────────────────────────────────────

/** A user-stated engineering goal that Minerva investigates. */
export type ObjectiveKind =
  | 'improve-performance'
  | 'cut-cost'
  | 'reduce-errors'
  | 'kill-dead-code'
  | 'prepare-for-scale'
  | 'improve-delivery'
  | 'validate-task'
  | 'custom';

export type Effort = 'low' | 'medium' | 'high';
export type Confidence = 'high' | 'medium' | 'low';

/** The stance Minerva takes on a validated claim. */
export type VerdictStance = 'confirmed' | 'refuted' | 'inconclusive';

/**
 * Provenance tag for a claim. Uppercase to match the agent's evidence tags
 * (`[DYNATRACE]` / `[DAVIS]` / `[INFERRED]` / `[ASSUMPTION]`) from `04-agent-logic.md`.
 */
export type EvidenceSource = 'DYNATRACE' | 'DAVIS' | 'INFERRED' | 'ASSUMPTION';

// ─── Opportunity & evidence ──────────────────────────────────────────────────

/** A single piece of evidence: a DQL result, a scalar summary, and an open-in-Dynatrace link. */
export interface Evidence {
  id: string;
  source: EvidenceSource;
  /** Short human label, e.g. "latency by endpoint". */
  label: string;
  /** Scalar / one-line result, e.g. "/pay p95 4.2s". */
  resultSummary: string;
  /** The DQL that produced this evidence (present for DYNATRACE / DAVIS). */
  dql?: string;
  /** Open-in-Dynatrace URL for the query/result. */
  deepLink?: string;
  confidence: Confidence;
}

/** A quantified, evidence-backed estimate of the payoff of acting. */
export interface ImpactEstimate {
  metric: string;
  before: number;
  after: number;
  unit: string;
  /** The assumption the estimate depends on — never omitted. */
  assumption: string;
}

/** A ranked finding: a concrete, justified place to act toward the objective. */
export interface Opportunity {
  id: string;
  /** One-sentence finding. */
  finding: string;
  impact: ImpactEstimate;
  effort: Effort;
  confidence: Confidence;
  /** Why the confidence level was chosen. */
  confidenceReason: string;
  /** The contrary signal, always shown ("" if none). */
  dissent: string;
  /** Recommended concrete action. */
  recommendedAction: string;
  evidence: Evidence[];
}

// ─── Verdict (validation mode) ───────────────────────────────────────────────

/** The "what actually matters" redirect a verdict hands back when a claim doesn't earn the work. */
export interface VerdictRedirect {
  /** The real dominant finding the user should pursue instead. */
  finding: string;
  /** One-line projected delta for that finding, e.g. "p95 4.2s → ~1.5s (−64%)". */
  deltaLine: string;
  /** The discovery objective to run for it. */
  objectiveKind: ObjectiveKind;
}

/** Minerva's decision on a user-supplied task/claim — the validation analog of an Opportunity. */
export interface Verdict {
  id: string;
  stance: VerdictStance;
  /** The claim under test, restated. */
  claim: string;
  /** Scope the verdict applies to. */
  service: string;
  endpoint: string;
  /** Quantified projection of doing the task; `null` when inconclusive (not projectable). */
  impact: ImpactEstimate | null;
  /** For a refuted claim: why the projected win is small. */
  whySmall?: string;
  confidence: Confidence;
  /** Why the confidence level was chosen. */
  confidenceReason: string;
  /** The contrary signal, always shown ("" if none). */
  dissent: string;
  /** Recommended concrete action (or what to instrument, when inconclusive). */
  recommendedAction: string;
  evidence: Evidence[];
  /** "What actually matters" — present on refuted/inconclusive to route back into Discovery. */
  redirect?: VerdictRedirect;
}

// ─── Event union ─────────────────────────────────────────────────────────────

/** Fields shared by every event on the stream. */
export interface BaseEvent {
  type: AgentEventType;
  runId: string;
  /** Monotonic per run, starting at 1. The FE orders/dedupes on this. */
  seq: number;
  /** ISO-8601 timestamp. */
  ts: string;
}

export interface RunStarted extends BaseEvent {
  type: 'run.started';
  objective: { kind: ObjectiveKind; statement: string; scope?: { serviceId?: string } };
}

export interface PlanProposed extends BaseEvent {
  type: 'plan.proposed';
  /** The 3–6 step investigation plan, emitted before querying. */
  steps: { id: string; description: string }[];
}

export interface StepStarted extends BaseEvent {
  type: 'step.started';
  stepId: string;
}

export interface StepCompleted extends BaseEvent {
  type: 'step.completed';
  stepId: string;
  /** The exact query run (clickable in the UI). */
  dql: string;
  /** One-line human result, e.g. "checkout is 58% of total p95". */
  resultSummary: string;
  durationMs: number;
  rowCount?: number;
  /** Open-in-Dynatrace URL for this query. */
  deepLink?: string;
}

export interface StepFailed extends BaseEvent {
  type: 'step.failed';
  stepId: string;
  message: string;
}

export interface OpportunityAdded extends BaseEvent {
  type: 'opportunity.added';
  /** Streamed as each opportunity is found. */
  opportunity: Opportunity;
}

export interface BoardReady extends BaseEvent {
  type: 'board.ready';
  /** Final impact × effort ordering; every id corresponds to an emitted opportunity. */
  rankedOpportunityIds: string[];
}

export interface VerdictReady extends BaseEvent {
  type: 'verdict.ready';
  /** The single decisive verdict for a validate-task run (terminal beat, like board.ready). */
  verdict: Verdict;
}

export interface ActionCompleted extends BaseEvent {
  type: 'action.completed';
  opportunityId: string;
  kind: 'dynatrace-notebook' | 'ticket' | 'pull-request';
  url: string;
}

export interface RunCompleted extends BaseEvent {
  type: 'run.completed';
  totalDurationMs: number;
  queryCount: number;
  estCost?: { grailGbScanned?: number; tokens?: number };
}

export interface ErrorEvent extends BaseEvent {
  type: 'error';
  stage: 'plan' | 'investigate' | 'rank' | 'export';
  message: string;
}

/** The discriminated union of everything that can appear on the SSE stream. */
export type AgentEvent =
  | RunStarted
  | PlanProposed
  | StepStarted
  | StepCompleted
  | StepFailed
  | OpportunityAdded
  | BoardReady
  | VerdictReady
  | ActionCompleted
  | RunCompleted
  | ErrorEvent;

export type AgentEventType = AgentEvent['type'];

/** All valid event `type` discriminators. */
export const AGENT_EVENT_TYPES: readonly AgentEventType[] = [
  'run.started',
  'plan.proposed',
  'step.started',
  'step.completed',
  'step.failed',
  'opportunity.added',
  'board.ready',
  'verdict.ready',
  'action.completed',
  'run.completed',
  'error',
] as const;

// ─── REST surface (shared request/response shapes) ───────────────────────────

export interface StartObjectiveRequest {
  kind: ObjectiveKind;
  statement: string;
  scope?: { serviceId?: string };
}
export interface StartObjectiveResponse {
  runId: string;
}
export interface ExportRequest {
  kind: 'notebook';
}
export interface ExportResponse {
  url: string;
}

// ─── Runtime validation ──────────────────────────────────────────────────────
// A dependency-free structural validator. Used by the contract test and reusable
// by the agent/server to reject malformed payloads. Returns [] when `value` is a
// well-formed AgentEvent, otherwise a list of human-readable problems.

const EFFORTS: readonly Effort[] = ['low', 'medium', 'high'];
const CONFIDENCES: readonly Confidence[] = ['high', 'medium', 'low'];
const EVIDENCE_SOURCES: readonly EvidenceSource[] = ['DYNATRACE', 'DAVIS', 'INFERRED', 'ASSUMPTION'];
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
const VERDICT_STANCES: readonly VerdictStance[] = ['confirmed', 'refuted', 'inconclusive'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkEvidence(e: unknown, path: string, errs: string[]): void {
  if (!isRecord(e)) {
    errs.push(`${path}: evidence must be an object`);
    return;
  }
  if (typeof e.id !== 'string') errs.push(`${path}.id must be a string`);
  if (typeof e.label !== 'string') errs.push(`${path}.label must be a string`);
  if (typeof e.resultSummary !== 'string') errs.push(`${path}.resultSummary must be a string`);
  if (!EVIDENCE_SOURCES.includes(e.source as EvidenceSource)) {
    errs.push(`${path}.source must be one of ${EVIDENCE_SOURCES.join(', ')}`);
  }
  if (!CONFIDENCES.includes(e.confidence as Confidence)) {
    errs.push(`${path}.confidence must be one of ${CONFIDENCES.join(', ')}`);
  }
  if (e.dql !== undefined && typeof e.dql !== 'string') errs.push(`${path}.dql must be a string`);
  if (e.deepLink !== undefined && typeof e.deepLink !== 'string') {
    errs.push(`${path}.deepLink must be a string`);
  }
}

function checkOpportunity(o: unknown, path: string, errs: string[]): void {
  if (!isRecord(o)) {
    errs.push(`${path}: opportunity must be an object`);
    return;
  }
  if (typeof o.id !== 'string') errs.push(`${path}.id must be a string`);
  if (typeof o.finding !== 'string') errs.push(`${path}.finding must be a string`);
  if (typeof o.confidenceReason !== 'string') errs.push(`${path}.confidenceReason must be a string`);
  if (typeof o.dissent !== 'string') errs.push(`${path}.dissent must be a string`);
  if (typeof o.recommendedAction !== 'string') errs.push(`${path}.recommendedAction must be a string`);
  if (!EFFORTS.includes(o.effort as Effort)) errs.push(`${path}.effort must be one of ${EFFORTS.join(', ')}`);
  if (!CONFIDENCES.includes(o.confidence as Confidence)) {
    errs.push(`${path}.confidence must be one of ${CONFIDENCES.join(', ')}`);
  }
  const impact = o.impact;
  if (!isRecord(impact)) {
    errs.push(`${path}.impact must be an object`);
  } else {
    if (typeof impact.metric !== 'string') errs.push(`${path}.impact.metric must be a string`);
    if (typeof impact.before !== 'number') errs.push(`${path}.impact.before must be a number`);
    if (typeof impact.after !== 'number') errs.push(`${path}.impact.after must be a number`);
    if (typeof impact.unit !== 'string') errs.push(`${path}.impact.unit must be a string`);
    if (typeof impact.assumption !== 'string' || impact.assumption.length === 0) {
      errs.push(`${path}.impact.assumption must be a non-empty string`);
    }
  }
  if (!Array.isArray(o.evidence)) {
    errs.push(`${path}.evidence must be an array`);
  } else {
    o.evidence.forEach((e, i) => checkEvidence(e, `${path}.evidence[${i}]`, errs));
  }
}

function checkImpact(impact: unknown, path: string, errs: string[]): void {
  if (!isRecord(impact)) {
    errs.push(`${path} must be an object`);
    return;
  }
  if (typeof impact.metric !== 'string') errs.push(`${path}.metric must be a string`);
  if (typeof impact.before !== 'number') errs.push(`${path}.before must be a number`);
  if (typeof impact.after !== 'number') errs.push(`${path}.after must be a number`);
  if (typeof impact.unit !== 'string') errs.push(`${path}.unit must be a string`);
  if (typeof impact.assumption !== 'string' || impact.assumption.length === 0) {
    errs.push(`${path}.assumption must be a non-empty string`);
  }
}

function checkVerdict(v: unknown, path: string, errs: string[]): void {
  if (!isRecord(v)) {
    errs.push(`${path}: verdict must be an object`);
    return;
  }
  if (typeof v.id !== 'string') errs.push(`${path}.id must be a string`);
  if (!VERDICT_STANCES.includes(v.stance as VerdictStance)) {
    errs.push(`${path}.stance must be one of ${VERDICT_STANCES.join(', ')}`);
  }
  if (typeof v.claim !== 'string') errs.push(`${path}.claim must be a string`);
  if (typeof v.service !== 'string') errs.push(`${path}.service must be a string`);
  if (typeof v.endpoint !== 'string') errs.push(`${path}.endpoint must be a string`);
  if (typeof v.confidenceReason !== 'string') errs.push(`${path}.confidenceReason must be a string`);
  if (typeof v.dissent !== 'string') errs.push(`${path}.dissent must be a string`);
  if (typeof v.recommendedAction !== 'string') errs.push(`${path}.recommendedAction must be a string`);
  if (!CONFIDENCES.includes(v.confidence as Confidence)) {
    errs.push(`${path}.confidence must be one of ${CONFIDENCES.join(', ')}`);
  }
  // impact is nullable: present (a full ImpactEstimate) for confirmed/refuted, null when inconclusive.
  if (v.impact !== null && v.impact !== undefined) checkImpact(v.impact, `${path}.impact`, errs);
  if (v.whySmall !== undefined && typeof v.whySmall !== 'string') errs.push(`${path}.whySmall must be a string`);
  if (!Array.isArray(v.evidence)) {
    errs.push(`${path}.evidence must be an array`);
  } else {
    v.evidence.forEach((e, i) => checkEvidence(e, `${path}.evidence[${i}]`, errs));
  }
  if (v.redirect !== undefined) {
    const r = v.redirect;
    if (!isRecord(r)) {
      errs.push(`${path}.redirect must be an object`);
    } else {
      if (typeof r.finding !== 'string') errs.push(`${path}.redirect.finding must be a string`);
      if (typeof r.deltaLine !== 'string') errs.push(`${path}.redirect.deltaLine must be a string`);
      if (!OBJECTIVE_KINDS.includes(r.objectiveKind as ObjectiveKind)) {
        errs.push(`${path}.redirect.objectiveKind invalid`);
      }
    }
  }
}

/**
 * Validate that `value` is a well-formed `AgentEvent`.
 * @returns a list of problems; empty means valid.
 */
export function validateAgentEvent(value: unknown): string[] {
  const errs: string[] = [];
  if (!isRecord(value)) return ['event must be an object'];

  if (typeof value.runId !== 'string') errs.push('runId must be a string');
  if (typeof value.seq !== 'number' || !Number.isInteger(value.seq)) errs.push('seq must be an integer');
  if (typeof value.ts !== 'string' || Number.isNaN(Date.parse(value.ts))) {
    errs.push('ts must be an ISO-8601 date string');
  }

  const type = value.type;
  if (typeof type !== 'string' || !AGENT_EVENT_TYPES.includes(type as AgentEventType)) {
    errs.push(`type must be one of ${AGENT_EVENT_TYPES.join(', ')}`);
    return errs;
  }

  switch (type as AgentEventType) {
    case 'run.started': {
      const obj = value.objective;
      if (!isRecord(obj)) {
        errs.push('objective must be an object');
      } else {
        if (!OBJECTIVE_KINDS.includes(obj.kind as ObjectiveKind)) errs.push('objective.kind invalid');
        if (typeof obj.statement !== 'string') errs.push('objective.statement must be a string');
      }
      break;
    }
    case 'plan.proposed': {
      if (!Array.isArray(value.steps) || value.steps.length === 0) {
        errs.push('steps must be a non-empty array');
      } else {
        value.steps.forEach((s, i) => {
          if (!isRecord(s) || typeof s.id !== 'string' || typeof s.description !== 'string') {
            errs.push(`steps[${i}] must have string id and description`);
          }
        });
      }
      break;
    }
    case 'step.started': {
      if (typeof value.stepId !== 'string') errs.push('stepId must be a string');
      break;
    }
    case 'step.completed': {
      if (typeof value.stepId !== 'string') errs.push('stepId must be a string');
      if (typeof value.dql !== 'string') errs.push('dql must be a string');
      if (typeof value.resultSummary !== 'string') errs.push('resultSummary must be a string');
      if (typeof value.durationMs !== 'number') errs.push('durationMs must be a number');
      if (value.rowCount !== undefined && typeof value.rowCount !== 'number') errs.push('rowCount must be a number');
      if (value.deepLink !== undefined && typeof value.deepLink !== 'string') errs.push('deepLink must be a string');
      break;
    }
    case 'step.failed': {
      if (typeof value.stepId !== 'string') errs.push('stepId must be a string');
      if (typeof value.message !== 'string') errs.push('message must be a string');
      break;
    }
    case 'opportunity.added': {
      checkOpportunity(value.opportunity, 'opportunity', errs);
      break;
    }
    case 'board.ready': {
      if (!Array.isArray(value.rankedOpportunityIds) || !value.rankedOpportunityIds.every((s) => typeof s === 'string')) {
        errs.push('rankedOpportunityIds must be an array of strings');
      }
      break;
    }
    case 'verdict.ready': {
      checkVerdict(value.verdict, 'verdict', errs);
      break;
    }
    case 'action.completed': {
      if (typeof value.opportunityId !== 'string') errs.push('opportunityId must be a string');
      if (!['dynatrace-notebook', 'ticket', 'pull-request'].includes(value.kind as string)) {
        errs.push('kind must be dynatrace-notebook, ticket, or pull-request');
      }
      if (typeof value.url !== 'string') errs.push('url must be a string');
      break;
    }
    case 'run.completed': {
      if (typeof value.totalDurationMs !== 'number') errs.push('totalDurationMs must be a number');
      if (typeof value.queryCount !== 'number') errs.push('queryCount must be a number');
      break;
    }
    case 'error': {
      if (!['plan', 'investigate', 'rank', 'export'].includes(value.stage as string)) {
        errs.push('stage must be plan, investigate, rank, or export');
      }
      if (typeof value.message !== 'string') errs.push('message must be a string');
      break;
    }
  }
  return errs;
}

/** Type guard form of {@link validateAgentEvent}. */
export function isAgentEvent(value: unknown): value is AgentEvent {
  return validateAgentEvent(value).length === 0;
}
