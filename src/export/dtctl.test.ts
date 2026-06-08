import { describe, it, expect, vi } from 'vitest';
import { exportNotebook, type Exec } from './dtctl.js';
import { buildNotebook } from './notebook.js';
import type { Opportunity, StartObjectiveRequest } from '../contract.js';

const objective: StartObjectiveRequest = { kind: 'improve-performance', statement: 'fast' };
const opp: Opportunity = {
  id: 'opp-1', finding: 'f', impact: { metric: 'p95', before: 4, after: 1, unit: 's', assumption: 'a' },
  effort: 'low', confidence: 'high', confidenceReason: 'r', dissent: '', recommendedAction: 'do it',
  evidence: [{ id: 'e1', source: 'DYNATRACE', label: 'q', resultSummary: 's', dql: 'fetch spans', confidence: 'high' }],
};
const notebook = buildNotebook(opp, objective, 'https://env.apps.dynatrace.com');

const okWrite = async (content: string) => ({ path: '/tmp/nb.json', cleanup: async () => {}, content });

describe('exportNotebook', () => {
  it('configures a headless token context and creates the notebook, returning the URL', async () => {
    const calls: string[][] = [];
    const exec: Exec = vi.fn(async (_cmd, args) => {
      calls.push(args);
      if (args[0] === 'create') {
        return { stdout: JSON.stringify({ id: 'nb-123' }), stderr: '', code: 0 };
      }
      return { stdout: '', stderr: '', code: 0 };
    });

    const res = await exportNotebook(notebook, {
      exec,
      env: { DT_ENVIRONMENT: 'https://env.apps.dynatrace.com', DT_PLATFORM_TOKEN: 'dt0s16.AAA' },
      writeTemp: okWrite,
    });

    // set-credentials + set-context were run before create
    expect(calls.some((a) => a[0] === 'config' && a[1] === 'set-credentials')).toBe(true);
    expect(calls.some((a) => a[0] === 'config' && a[1] === 'set-context')).toBe(true);
    const create = calls.find((a) => a[0] === 'create');
    expect(create).toContain('notebook');
    expect(create).toContain('-f');
    // URL constructed from env + parsed id
    expect(res.url).toBe('https://env.apps.dynatrace.com/ui/apps/dynatrace.notebooks/notebook/nb-123');
    expect(res.id).toBe('nb-123');
  });

  it('reuses an existing context (no credential setup) when MINERVA_DTCTL_CONTEXT is set', async () => {
    const calls: string[][] = [];
    const exec: Exec = vi.fn(async (_cmd, args) => {
      calls.push(args);
      return { stdout: JSON.stringify({ url: 'https://env/ui/notebook/x' }), stderr: '', code: 0 };
    });

    const res = await exportNotebook(notebook, {
      exec,
      env: { DT_ENVIRONMENT: 'https://env.apps.dynatrace.com', MINERVA_DTCTL_CONTEXT: 'minerva' },
      writeTemp: okWrite,
    });

    expect(calls.some((a) => a[1] === 'set-credentials')).toBe(false);
    const create = calls.find((a) => a[0] === 'create');
    expect(create).toContain('--context');
    expect(create?.[create.indexOf('--context') + 1]).toBe('minerva');
    expect(res.url).toBe('https://env/ui/notebook/x'); // url taken straight from output
  });

  it('throws when no auth is available', async () => {
    await expect(
      exportNotebook(notebook, { exec: async () => ({ stdout: '', stderr: '', code: 0 }), env: {}, writeTemp: okWrite }),
    ).rejects.toThrow(/MINERVA_DTCTL_CONTEXT|DT_PLATFORM_TOKEN/);
  });

  it('surfaces a dtctl create failure', async () => {
    const exec: Exec = async (_cmd, args) =>
      args[0] === 'create'
        ? { stdout: '', stderr: 'boom', code: 1 }
        : { stdout: '', stderr: '', code: 0 };
    await expect(
      exportNotebook(notebook, { exec, env: { MINERVA_DTCTL_CONTEXT: 'minerva', DT_ENVIRONMENT: 'https://e' }, writeTemp: okWrite }),
    ).rejects.toThrow(/create notebook failed/);
  });
});
