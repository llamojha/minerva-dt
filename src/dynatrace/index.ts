// Minerva — Dynatrace read path (M1).
//
// The agent's senses. The single Gemini agent (M3) calls `execute_dql` as a *discovered
// MCP tool*, so the model itself drives the investigation — that's the "meaningful Dynatrace
// MCP integration" the hackathon's Partner-Power goal requires. The write/act side (creating
// the notebook artifact) is dtctl, in M6.
//
// This module provides three things:
//   1. createDynatraceToolset() — the @google/adk MCPToolset over the Dynatrace MCP server.
//   2. guardDql()               — the cost-aware query guard (from: + entity filter + limit).
//   3. reference query builders — the verified RED / slow-endpoint / DB-hotspot DQL.
//
// DQL is verified against docs/dynatrace-reference.md (units: response_time = microseconds,
// span duration = nanoseconds; use == not =; percentile() needs rollup:).

import { MCPToolset } from '@google/adk';
import type { StdioConnectionParams } from '@google/adk';

// ─── Config ──────────────────────────────────────────────────────────────────

export interface DynatraceConfig {
  /** e.g. https://wut43341.apps.dynatrace.com */
  environment: string;
  /** Platform token (dt0s16…). If omitted, the MCP server falls back to browser OAuth. */
  platformToken?: string;
  /** Hard Grail scan budget handed to the MCP server (env DT_GRAIL_QUERY_BUDGET_GB). */
  grailBudgetGb: number;
}

/** Read config from the environment (.env). Throws if the tenant URL is missing. */
export function loadDynatraceConfig(env: NodeJS.ProcessEnv = process.env): DynatraceConfig {
  const environment = env.DT_ENVIRONMENT?.trim();
  if (!environment) {
    throw new Error('DT_ENVIRONMENT is required (e.g. https://abc12345.apps.dynatrace.com)');
  }
  return {
    environment,
    platformToken: env.DT_PLATFORM_TOKEN?.trim() || undefined,
    grailBudgetGb: Number(env.DT_GRAIL_QUERY_BUDGET_GB ?? 10),
  };
}

// ─── MCP toolset ─────────────────────────────────────────────────────────────

/**
 * Build the Dynatrace MCP toolset for the ADK agent. Runs the official server over stdio
 * (`npx @dynatrace-oss/dynatrace-mcp-server`). The server exposes ~20 tools; Minerva's read path
 * uses `execute_dql` (the investigation is entirely DQL). We do NOT filter/prefix here — the agent
 * doesn't receive these tools directly; `run.ts` picks `execute_dql` and wraps it in `run_query`
 * (so step events stay clean), and a filter+prefix would only risk hiding the tool by name.
 *
 * Remember to `await toolset.close()` on shutdown to stop the child process.
 */
export function createDynatraceToolset(config: DynatraceConfig = loadDynatraceConfig()): MCPToolset {
  const connection: StdioConnectionParams = {
    type: 'StdioConnectionParams',
    serverParams: {
      command: 'npx',
      args: ['-y', '@dynatrace-oss/dynatrace-mcp-server'],
      env: {
        // Pass through PATH so npx resolves; then the Dynatrace-specific config.
        ...process.env,
        DT_ENVIRONMENT: config.environment,
        ...(config.platformToken ? { DT_PLATFORM_TOKEN: config.platformToken } : {}),
        DT_GRAIL_QUERY_BUDGET_GB: String(config.grailBudgetGb),
      } as Record<string, string>,
    },
  };

  return new MCPToolset(connection);
}

// ─── Cost-aware DQL guard ────────────────────────────────────────────────────

export interface GuardedDql {
  /** The query, trimmed and otherwise UNCHANGED (guardDql does not rewrite DQL). */
  dql: string;
  /** Non-fatal advisories (e.g. "no from: timeframe", "no entity filter"). */
  warnings: string[];
}

/** Aggregating commands don't need a row `limit` — a limit there would be wrong. */
const AGGREGATING = /\|\s*(summarize|makeTimeseries|fieldsAdd|dedup)\b/i;
const HAS_TIMESERIES = /^\s*timeseries\b/i;
const HAS_FROM = /\bfrom\s*:/i;
const HAS_LIMIT = /\|\s*limit\b/i;
const HAS_FILTER = /\|\s*filter\b/i;

/**
 * Lint a DQL string for the three cost controls and return WARNINGS — it does NOT modify the
 * query. (An earlier version injected `from:`/`limit` via string surgery; that corrupted
 * model-authored DQL — e.g. `fetch x,, from:` — so we no longer mutate.) The hard cost ceiling is
 * `DT_GRAIL_QUERY_BUDGET_GB` enforced by the MCP server; these warnings are returned to the agent
 * so it can self-correct, and the agent's prompt already instructs it to scope every query.
 */
export function guardDql(raw: string): GuardedDql {
  const dql = raw.trim();
  const warnings: string[] = [];

  if (!HAS_FROM.test(dql)) {
    warnings.push('no from: timeframe — add one (e.g. from: now()-2h) to bound cost');
  }
  if (!HAS_FILTER.test(dql)) {
    warnings.push('no filter: — query is unscoped by entity/dimension (higher Grail scan)');
  }
  // A row `limit` only matters for row-returning fetch queries, not aggregations/timeseries.
  const returnsRows = /^\s*fetch\b/i.test(dql) && !AGGREGATING.test(dql) && !HAS_TIMESERIES.test(dql);
  if (returnsRows && !HAS_LIMIT.test(dql)) {
    warnings.push('no limit — add | limit N to cap rows');
  }

  return { dql, warnings };
}

// ─── Verified reference queries (docs/dynatrace-reference.md) ─────────────────
// The three steps of the Improve-Performance investigation. Each returns guarded DQL.

/** Step 1 — service RED, ranks services by latency contribution. response_time = microseconds. */
export function redByService(timeframe = '30m'): GuardedDql {
  return guardDql(
    `timeseries {
       p95 = percentile(dt.service.request.response_time, 95, rollup: avg),
       total_requests = sum(dt.service.request.count),
       failures = sum(dt.service.request.failure_count)
     }, by: {dt.service.name}, from: now()-${timeframe}
     | fieldsAdd p95_ms = p95[] / 1000, error_rate_pct = (failures[] * 100.0) / total_requests[]`,
  );
}

/** Step 2 — slowest endpoints on a service. span duration = nanoseconds. */
export function slowEndpoints(serviceName: string, timeframe = '30m'): GuardedDql {
  return guardDql(
    `fetch spans, from: now()-${timeframe}
     | filter request.is_root_span == true and dt.service.name == "${serviceName}"
     | summarize p95_ns = percentile(duration, 95, rollup: avg), calls = count(), by: { endpoint.name }
     | fieldsAdd p95_ms = p95_ns / 1000000
     | sort p95_ns desc
     | limit 10`,
  );
}

/** Step 3 — DB hotspots by statement: the hero query (unindexed scan should top this). */
export function dbHotspots(timeframe = '30m'): GuardedDql {
  return guardDql(
    `fetch spans, from: now()-${timeframe}
     | filter span.kind == "client" and isNotNull(db.statement)
     | summarize p95_ns = percentile(duration, 95, rollup: avg), calls = count(), by: { db.statement }
     | fieldsAdd p95_ms = p95_ns / 1000000
     | sort p95_ns desc
     | limit 10`,
  );
}
