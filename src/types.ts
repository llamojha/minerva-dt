// Core domain types for Minerva.
//
// The wire contract (events, opportunities, evidence) lives in `./contract.ts` — the single
// source of truth shared with the frontend. This module re-exports it and adds a few
// agent-internal types that never cross the SSE boundary.

export * from './contract.js';

import type { Confidence } from './contract.js';

/**
 * Internal investigation-step state held by the agent while a plan executes.
 * (The wire form is emitted as `step.started` / `step.completed` events — see contract.)
 */
export interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  /** One-line result once the step completes. */
  result?: string;
  dql?: string;
  durationMs?: number;
}

/** An objective the agent is actively investigating, with its scope. */
export interface ObjectiveContext {
  statement: string;
  scope?: { serviceId?: string };
  /** Calibrated confidence in the overall recommendation, set after ranking. */
  overallConfidence?: Confidence;
}
