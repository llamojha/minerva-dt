import { describe, it, expect } from 'vitest';
import { buildNotebook, buildVerdictNotebook } from './notebook.js';
import type { Opportunity, StartObjectiveRequest, Verdict } from '../contract.js';

const objective: StartObjectiveRequest = { kind: 'improve-performance', statement: 'make checkout fast' };

const opp: Opportunity = {
  id: 'opp-1',
  finding: 'checkout /pay p95 is dominated by one unindexed orders query',
  impact: { metric: 'p95', before: 4.2, after: 1.5, unit: 's', assumption: 'the query is the dominant cost share' },
  effort: 'low',
  confidence: 'high',
  confidenceReason: 'query share measured directly from spans',
  dissent: 'traffic could shift the hotspot',
  recommendedAction: 'add an index on orders(email)',
  evidence: [
    { id: 'e1', source: 'DYNATRACE', label: 'db-hotspots', resultSummary: '65% of p95', dql: 'fetch spans | limit 1', confidence: 'high' },
    { id: 'e2', source: 'INFERRED', label: 'cost share', resultSummary: 'derived', confidence: 'medium' },
  ],
};

describe('buildNotebook', () => {
  const nb = buildNotebook(opp, objective, 'https://wut43341.apps.dynatrace.com');

  it('produces a valid notebook document shell', () => {
    expect(nb.type).toBe('notebook');
    expect(nb.content.version).toBe('7');
    expect(nb.content.defaultTimeframe).toEqual({ from: 'now()-2h', to: 'now()' });
    expect(nb.name.startsWith('Minerva —')).toBe(true);
  });

  it('leads with a markdown section carrying the finding, impact, and assumption', () => {
    const md = nb.content.sections[0];
    expect(md?.type).toBe('markdown');
    expect(md?.markdown).toContain(opp.finding);
    expect(md?.markdown).toContain('4.2 → 1.5 s');
    expect(md?.markdown).toContain('-64%');
    expect(md?.markdown).toContain(opp.impact.assumption);
    expect(md?.markdown).toContain('add an index on orders(email)');
  });

  it('adds one DQL section per evidence that has a query (and none for those without)', () => {
    const dqls = nb.content.sections.filter((s) => s.type === 'dql');
    expect(dqls).toHaveLength(1); // only e1 has dql
    expect(dqls[0]?.title).toBe('db-hotspots');
    expect(dqls[0]?.state?.input.value).toBe('fetch spans | limit 1');
    expect(dqls[0]?.state?.visualizationSettings.autoSelectVisualization).toBe(true);
  });

  it('renders "none" when there is no dissent', () => {
    const nb2 = buildNotebook({ ...opp, dissent: '' }, objective, 'https://x');
    expect(nb2.content.sections[0]?.markdown).toContain('**Dissent:** none');
  });
});

const validateObjective: StartObjectiveRequest = {
  kind: 'validate-task',
  statement: 'Cache the product catalog',
};

const confirmedVerdict: Verdict = {
  id: 'v-cache-catalog',
  stance: 'confirmed',
  claim: 'Caching the product catalog will cut read latency.',
  service: 'product-catalog',
  endpoint: '/read',
  impact: { metric: 'read p95', before: 820, after: 180, unit: ' ms', assumption: 'most reads hit warm entries' },
  confidence: 'medium',
  confidenceReason: '86% of reads are repeat lookups',
  dissent: 'adds cache-invalidation complexity',
  recommendedAction: 'add a 60s read-through cache keyed by SKU',
  evidence: [
    { id: 'e1', source: 'DYNATRACE', label: 'catalog-read-latency', resultSummary: 'p95 820ms', dql: 'timeseries p95 = percentile(x, 95)', confidence: 'medium' },
    { id: 'e2', source: 'INFERRED', label: 'repeat-rate', resultSummary: '86% repeats', confidence: 'medium' },
  ],
};

const inconclusiveVerdict: Verdict = {
  id: 'v-split-checkout',
  stance: 'inconclusive',
  claim: 'Splitting checkout into modules will improve scalability.',
  service: 'checkout',
  endpoint: 'service',
  impact: null,
  confidence: 'low',
  confidenceReason: 'no module-level boundary on spans',
  dissent: 'a split could add network hops',
  recommendedAction: 'instrument module-level CPU/lock contention for ~1 week, then re-validate',
  evidence: [
    { id: 'e1', source: 'DYNATRACE', label: 'module-attribution', resultSummary: 'code.namespace null on 100% of spans', dql: 'fetch spans | summarize count()', confidence: 'low' },
  ],
  redirect: {
    finding: 'the measurable win is the unindexed scan on orders(status, created_at) — 65% of /pay p95',
    deltaLine: 'p95 4.2s → ~1.5s (−64%)',
    objectiveKind: 'improve-performance',
  },
};

describe('buildVerdictNotebook', () => {
  it('leads with the stance + claim and renders the projected impact (confirmed)', () => {
    const nb = buildVerdictNotebook(confirmedVerdict, validateObjective, 'https://env');
    expect(nb.type).toBe('notebook');
    expect(nb.content.version).toBe('7');
    const md = nb.content.sections[0];
    expect(md?.type).toBe('markdown');
    expect(md?.markdown).toContain('Confirmed:');
    expect(md?.markdown).toContain(confirmedVerdict.claim);
    expect(md?.markdown).toContain('820 → 180  ms');
    expect(md?.markdown).toContain('-78%');
    expect(md?.markdown).toContain(confirmedVerdict.evidence[0]!.resultSummary);
  });

  it('adds one DQL section per evidence that has a query', () => {
    const nb = buildVerdictNotebook(confirmedVerdict, validateObjective, 'https://env');
    const dqls = nb.content.sections.filter((s) => s.type === 'dql');
    expect(dqls).toHaveLength(1); // only e1 has dql
    expect(dqls[0]?.title).toBe('catalog-read-latency');
    expect(dqls[0]?.state?.visualizationSettings.autoSelectVisualization).toBe(true);
  });

  it('says "not projectable" and shows the redirect when inconclusive (impact null)', () => {
    const nb = buildVerdictNotebook(inconclusiveVerdict, validateObjective, 'https://env');
    const md = nb.content.sections[0]?.markdown ?? '';
    expect(md).toContain('Inconclusive:');
    expect(md).toContain('not projectable');
    expect(md).not.toContain('**Assumption:**'); // no projected-impact block
    expect(md).toContain('What actually matters');
    expect(md).toContain(inconclusiveVerdict.redirect!.deltaLine);
  });
});
