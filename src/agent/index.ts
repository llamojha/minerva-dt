// Minerva — the single agent definition (M3).
//
// One LlmAgent (Gemini 2.5 Flash) with the system prompt and the local emitter tools. The Dynatrace
// MCP toolset is consumed *inside* the run_query tool (see tools.ts), not exposed to the model
// directly, so every step event carries a clean stepId. This is one agent — no sub-agents.

import { LlmAgent, type FunctionTool } from '@google/adk';
import { MODEL, SYSTEM_PROMPT } from './prompt.js';

export interface MinervaAgentDeps {
  /** The emitter tools (run_query, emit_plan, add_opportunity, finalize_board, …). */
  tools: FunctionTool[];
  /** The system instruction; defaults to discovery's SYSTEM_PROMPT (validation passes VALIDATION_PROMPT). */
  instruction?: string;
}

/** Build the Minerva agent for one run. */
export function buildMinervaAgent({ tools, instruction = SYSTEM_PROMPT }: MinervaAgentDeps): LlmAgent {
  return new LlmAgent({
    name: 'minerva',
    description: 'Objective-driven optimization analyst over Dynatrace runtime data.',
    model: MODEL,
    instruction,
    tools,
  });
}
