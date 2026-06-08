import { describe, it, expect } from 'vitest';
import {
  guardDql,
  loadDynatraceConfig,
  redByService,
  slowEndpoints,
  dbHotspots,
} from './index.js';

describe('guardDql — lints, never mutates', () => {
  it('returns the query unchanged (only trimmed) — no string surgery', () => {
    const q = 'fetch spans | filter span.kind == "client"';
    const { dql } = guardDql(`  ${q}  `);
    expect(dql).toBe(q);
  });

  it('warns when from: is missing, without modifying the query', () => {
    const q = 'fetch spans | filter span.kind == "client"';
    const { dql, warnings } = guardDql(q);
    expect(dql).toBe(q);
    expect(warnings).toContainEqual(expect.stringContaining('no from:'));
  });

  it('does not warn about timeframe when from: is present', () => {
    const { warnings } = guardDql('fetch logs, from: now()-1h | limit 5');
    expect(warnings).not.toContainEqual(expect.stringContaining('from:'));
  });

  it('warns about a missing limit only on row-returning fetch queries', () => {
    const { warnings } = guardDql('fetch spans, from: now()-1h | filter request.is_failed == true');
    expect(warnings).toContainEqual(expect.stringContaining('no limit'));
  });

  it('does NOT warn about limit on an aggregating (summarize) query', () => {
    const { warnings } = guardDql('fetch spans, from: now()-1h | filter x == 1 | summarize c = count(), by: { a }');
    expect(warnings).not.toContainEqual(expect.stringContaining('limit'));
  });

  it('does NOT warn about limit on a timeseries query', () => {
    const { warnings } = guardDql('timeseries { c = sum(m) }, from: now()-1h');
    expect(warnings).not.toContainEqual(expect.stringContaining('limit'));
  });

  it('warns when there is no entity/dimension filter', () => {
    const { warnings } = guardDql('fetch spans, from: now()-1h | limit 10');
    expect(warnings).toContainEqual(expect.stringContaining('unscoped'));
  });
});

describe('reference query builders', () => {
  it('redByService produces guarded, bounded DQL', () => {
    const { dql } = redByService('30m');
    expect(dql).toContain('dt.service.request.response_time');
    expect(dql).toContain('from: now()-30m');
  });

  it('slowEndpoints scopes by the given service and bounds the result', () => {
    const { dql } = slowEndpoints('checkout-service');
    expect(dql).toContain('dt.service.name == "checkout-service"');
    expect(dql).toMatch(/\| limit 10/);
  });

  it('dbHotspots groups by db.statement (the hero query)', () => {
    const { dql } = dbHotspots();
    expect(dql).toContain('by: { db.statement }');
    expect(dql).toContain('span.kind == "client"');
  });
});

describe('loadDynatraceConfig', () => {
  it('throws when DT_ENVIRONMENT is missing', () => {
    expect(() => loadDynatraceConfig({})).toThrow(/DT_ENVIRONMENT/);
  });

  it('reads token + budget from env', () => {
    const cfg = loadDynatraceConfig({
      DT_ENVIRONMENT: 'https://abc12345.apps.dynatrace.com',
      DT_PLATFORM_TOKEN: 'dt0s16.AAAA',
      DT_GRAIL_QUERY_BUDGET_GB: '25',
    });
    expect(cfg.environment).toContain('abc12345');
    expect(cfg.platformToken).toBe('dt0s16.AAAA');
    expect(cfg.grailBudgetGb).toBe(25);
  });
});
