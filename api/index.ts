// Minerva — Vercel serverless entry for the API (Node runtime).
//
// `vercel.json` rewrites every `/api/*` request to this single function; the static site (web/) is
// served by the CDN, same-origin. The app is imported from the compiled `dist/` (built by
// `npm run build` in vercel.json's buildCommand) so the bundler never resolves TS `.js` specifiers.
//
// We hand-bridge Node (req,res) → the Hono app rather than using hono/vercel's `handle`:
//   • @vercel/node invokes Node-style (req,res); `handle` expects a Web Request → it silently
//     times out.
//   • @vercel/node also pre-parses the request body into `req.body`, consuming the stream — so we
//     rebuild the body from `req.body` into the Web Request, then stream the Response back (SSE).
//
// Fixture mode only here: the live agent + dtctl export spawn subprocesses, which Vercel functions
// can't do — the frontend falls back to a simulated artifact for export; live runs stay local.

import type { IncomingMessage, ServerResponse } from "node:http";
// @ts-ignore - dist/ is built by `npm run build` (vercel.json buildCommand) before functions bundle
import { createApp } from "../dist/server/app.js";

const app = createApp();

export const config = { maxDuration: 60 };

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
): Promise<void> {
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host = req.headers.host || "localhost";
  const url = `${proto}://${host}${req.url || "/"}`;
  const method = req.method || "GET";

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v != null) headers.set(k, v as string);
  }

  // @vercel/node already parsed the body into req.body — re-serialize it for the Web Request.
  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD" && req.body != null) {
    if (typeof req.body === "string") body = req.body;
    else if (Buffer.isBuffer(req.body)) body = req.body.toString("utf8");
    else {
      body = JSON.stringify(req.body);
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    }
  }

  const response = await app.fetch(new Request(url, { method, headers, body }));

  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));

  if (!response.body) {
    res.end();
    return;
  }
  // Stream the Web ReadableStream to the Node response (keeps SSE incremental).
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
      (res as ServerResponse & { flush?: () => void }).flush?.();
    }
  } finally {
    res.end();
  }
}
