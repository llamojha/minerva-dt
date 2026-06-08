// Minerva — notebook export via dtctl (M6, the "beyond chat" act).
//
// dtctl is the write/act layer (the Dynatrace MCP server is the read path). This creates a real
// notebook from the document built in notebook.ts and returns its URL.
//
// Auth is cloud-ready by design:
//   • Headless (Cloud Run): set DT_PLATFORM_TOKEN + DT_ENVIRONMENT → we configure a token-based
//     dtctl context at runtime (`config set-credentials` + `set-context --token-ref`). No browser.
//   • Local recording: set MINERVA_DTCTL_CONTEXT=minerva to reuse your existing OAuth context.
//
// The exact shape of `dtctl create notebook` output is confirmed at the live run; parseCreated is
// defensive (JSON envelope → id/url; falls back to scanning for a URL/UUID).

import { execFile } from 'node:child_process';
import { writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { NotebookDoc } from './notebook.js';

export interface ExecResult { stdout: string; stderr: string; code: number }
export type Exec = (cmd: string, args: string[]) => Promise<ExecResult>;

export interface ExportDeps {
  exec?: Exec;
  env?: NodeJS.ProcessEnv;
  /** Write notebook JSON somewhere dtctl can read it; returns the path + a cleanup. */
  writeTemp?: (content: string) => Promise<{ path: string; cleanup: () => Promise<void> }>;
}

export interface ExportResult { url: string; id?: string }

const HEADLESS_CONTEXT = 'minerva-export';

const defaultExec: Exec = (cmd, args) =>
  new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err && typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : err ? 1 : 0;
      resolve({ stdout: stdout?.toString() ?? '', stderr: stderr?.toString() ?? '', code });
    });
  });

const defaultWriteTemp = async (content: string) => {
  const path = join(tmpdir(), `minerva-notebook-${randomUUID()}.json`);
  await writeFile(path, content, 'utf8');
  return { path, cleanup: () => rm(path, { force: true }) };
};

function notebookUrl(environment: string, id: string): string {
  return `${environment.replace(/\/+$/, '')}/ui/apps/dynatrace.notebooks/notebook/${id}`;
}

function parseCreated(stdout: string, environment: string): ExportResult {
  try {
    const j = JSON.parse(stdout) as Record<string, unknown>;
    const obj = (j.data ?? j) as Record<string, unknown>;
    const id = (obj.id ?? obj.objectId ?? obj.documentId ?? (obj.metadata as Record<string, unknown>)?.id) as string | undefined;
    const url = (obj.url ?? (obj.links as Record<string, unknown>)?.self) as string | undefined;
    if (url) return { url, id };
    if (id) return { url: notebookUrl(environment, id), id };
  } catch {
    /* not JSON — fall through to text scan */
  }
  const urlMatch = stdout.match(/https?:\/\/\S+/);
  if (urlMatch) return { url: urlMatch[0] };
  const idMatch = stdout.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (idMatch) return { url: notebookUrl(environment, idMatch[0]), id: idMatch[0] };
  throw new Error(`could not parse notebook id/url from dtctl output: ${stdout.slice(0, 200)}`);
}

/** Resolve which dtctl context to use, configuring a headless token context if needed. */
async function resolveContext(exec: Exec, env: NodeJS.ProcessEnv): Promise<string> {
  const existing = env.MINERVA_DTCTL_CONTEXT?.trim();
  if (existing) return existing; // assume already authenticated (e.g. local OAuth)

  const environment = env.DT_ENVIRONMENT?.trim();
  const token = env.DT_PLATFORM_TOKEN?.trim();
  if (!environment || !token) {
    throw new Error(
      'export needs MINERVA_DTCTL_CONTEXT (an existing dtctl context) or DT_ENVIRONMENT + DT_PLATFORM_TOKEN for headless token auth',
    );
  }

  const run = async (args: string[]) => {
    const r = await exec('dtctl', args);
    if (r.code !== 0) throw new Error(`dtctl ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
    return r;
  };
  // set-credentials + set-context are upserts (create-or-update).
  await run(['config', 'set-credentials', HEADLESS_CONTEXT, '--token', token]);
  await run(['config', 'set-context', HEADLESS_CONTEXT, '--environment', environment, '--token-ref', HEADLESS_CONTEXT, '--safety-level', 'readwrite-all']);
  return HEADLESS_CONTEXT;
}

/** Create a Dynatrace notebook from the document and return its URL. */
export async function exportNotebook(notebook: NotebookDoc, deps: ExportDeps = {}): Promise<ExportResult> {
  const exec = deps.exec ?? defaultExec;
  const env = deps.env ?? process.env;
  const writeTemp = deps.writeTemp ?? defaultWriteTemp;
  const environment = env.DT_ENVIRONMENT?.trim() ?? '';

  const context = await resolveContext(exec, env);
  const { path, cleanup } = await writeTemp(JSON.stringify(notebook, null, 2));
  try {
    const r = await exec('dtctl', ['create', 'notebook', '-f', path, '--context', context, '-o', 'json', '--plain']);
    if (r.code !== 0) throw new Error(`dtctl create notebook failed: ${r.stderr || r.stdout}`);
    return parseCreated(r.stdout, environment);
  } finally {
    await cleanup().catch(() => {});
  }
}
