// Minerva — live agent smoke test (M1 + M3 de-risk).
//
//   npm run agent:smoke -- "Improve checkout performance"
//
// Runs ONE real objective against the live tenant (Gemini + Dynatrace MCP) and prints the emitted
// AgentEvents as JSONL. Needs .env (DT_ENVIRONMENT, DT_PLATFORM_TOKEN, GEMINI_API_KEY). Until M2
// seeds the tenant this returns 0-row queries → the agent should reach "insufficient data", which
// still proves the MCP connection + token auth + the loop end-to-end.
//
// Tip: redirect to capture a fixture for the M8 fixture-backed deploy:
//   npm run agent:smoke -- "Improve checkout performance" > fixtures/improve-performance.live.jsonl

import { runMinerva } from './run.js';
import type { StartObjectiveRequest } from '../contract.js';

// Node ≥20.12 loads .env without a dependency.
try {
  (process as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.();
} catch {
  // no .env — rely on the ambient environment
}

const statement = process.argv.slice(2).join(' ').trim() || 'Improve checkout performance';
const objective: StartObjectiveRequest = { kind: 'improve-performance', statement };
const runId = `smoke_${Date.now()}`;

console.error(`[smoke] running "${statement}" as ${runId} …`);
let count = 0;
for await (const ev of runMinerva(objective, runId)) {
  count += 1;
  console.log(JSON.stringify(ev));
}
console.error(`[smoke] done — ${count} events`);
