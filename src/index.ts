// Minerva — objective-driven optimization agent.
// Local entry point: one Hono server that serves BOTH the static site (web/) and the API (/api/*)
// on a single origin — matching the same-origin Vercel deploy (static on the CDN + the same Hono
// app as a serverless function). In production this file is unused; Vercel invokes the app via
// `api/[[...route]].ts`. Here it just adds static-file serving for one-command local dev.

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './server/app.js';

// Load .env (Node ≥20.12) so MINERVA_LIVE mode has DT_ENVIRONMENT / GEMINI_API_KEY. Harmless in
// fixture mode, and a no-op if .env is absent.
try {
  (process as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.();
} catch {
  /* no .env — rely on the ambient environment */
}

const port = Number(process.env.PORT ?? 8787);
const app = createApp();

// Serve the prototype site. serveStatic falls through (calls next) on a miss, so the /api/* routes
// registered in createApp still win; this only handles the non-API paths.
app.use('/*', serveStatic({ root: './web' }));
app.get('/', serveStatic({ path: './web/index.html' }));

serve({ fetch: app.fetch, port }, (info) => {
  console.log('Minerva — You bring the goal. Minerva finds the wisest move, proven by your data.');
  console.log(`  ↳ http://localhost:${info.port}  (site + API, one origin)`);
  console.log('     GET  /                          → the app');
  console.log('     POST /api/objectives            → { runId }');
  console.log('     GET  /api/objectives/:id/events → SSE stream');
});
