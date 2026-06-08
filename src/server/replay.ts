// Minerva — fixture replayer (M0/M5 seam).
//
// Reads a `.jsonl` stream of AgentEvents and yields them with the same *relative* cadence the
// real agent would produce — the gap between consecutive events is the delta of their `ts`
// fields. This lets the frontend connect a real `EventSource` to the locked endpoints with no
// Gemini and no Dynatrace yet. When the real agent (M3/M4) emits the same events over the same
// endpoints, this replayer is deleted and nothing on the frontend changes.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { type AgentEvent, validateAgentEvent } from '../contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve a bundled fixture. Tries the module-relative path (local dev via tsx and the compiled
 * dist/) first, then falls back to the process CWD — on Vercel the file is force-included via
 * `vercel.json` `includeFiles` and resolves relative to the function's working directory, where the
 * module-relative `../../fixtures` no longer holds.
 */
function resolveFixture(name: string): string {
  const local = join(__dirname, '../../fixtures', name);
  if (existsSync(local)) return local;
  return join(process.cwd(), 'fixtures', name);
}

/** Path to the bundled improve-performance sample stream. */
export const PERF_FIXTURE = resolveFixture('improve-performance.jsonl');

/** Path to the bundled validate-task sample stream (validation mode). */
export const VALIDATE_FIXTURE = resolveFixture('validate-task.jsonl');

/**
 * Parse a `.jsonl` fixture into validated `AgentEvent`s. Throws if any line is not a well-formed
 * event — we want a malformed fixture to fail loudly at load, not mid-stream.
 */
export function loadFixture(path: string): AgentEvent[] {
  const lines = readFileSync(path, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.map((line, i) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (e) {
      throw new Error(`fixture ${path} line ${i + 1}: invalid JSON — ${(e as Error).message}`);
    }
    const errs = validateAgentEvent(parsed);
    if (errs.length) {
      throw new Error(`fixture ${path} line ${i + 1}: ${errs.join('; ')}`);
    }
    return parsed as AgentEvent;
  });
}

/** Milliseconds to wait before emitting `events[i]`, derived from the `ts` deltas. */
function gapBeforeMs(events: AgentEvent[], i: number): number {
  const prev = events[i - 1];
  const cur = events[i];
  if (i === 0 || !prev || !cur) return 0;
  return Math.max(0, Date.parse(cur.ts) - Date.parse(prev.ts));
}

export interface ReplayOptions {
  /** Multiply every gap (e.g. 0 = fire instantly, 2 = half speed). Default 1 = real cadence. */
  speed?: number;
  /** Resolves true to stop early (e.g. client disconnected). */
  aborted?: () => boolean;
}

/**
 * Async-iterate a fixture at its recorded cadence, rebinding each event's `runId` to the live
 * run. `seq` and `ts` are preserved so the stream stays a faithful, contract-valid replay.
 */
export async function* replay(
  events: AgentEvent[],
  runId: string,
  opts: ReplayOptions = {},
): AsyncGenerator<AgentEvent> {
  const speed = opts.speed ?? 1;
  for (let i = 0; i < events.length; i++) {
    if (opts.aborted?.()) return;
    const wait = gapBeforeMs(events, i) * speed;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (opts.aborted?.()) return;
    const ev = events[i];
    if (!ev) continue;
    yield { ...ev, runId } as AgentEvent;
  }
}
