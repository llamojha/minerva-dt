# Spec: Fix DQL Syntax Using dynatrace-for-ai Skills

## Goal

Pull the verified DQL syntax and field names from the official `Dynatrace/dynatrace-for-ai` skills repo and capture them as the project's verified DQL reference (`docs/dynatrace-reference.md`).

## Status

Largely complete — the verified patterns now live in `docs/dynatrace-reference.md`, which
supersedes the earlier unverified DQL examples. This spec is retained for traceability.

## Why

Early drafts contained DQL query examples with field names marked as uncertain (e.g., `dt.entity.service`, `otel.status_code`, `dt.service.request.response_time`, `loglevel`). The `dynatrace-for-ai` repo contains ground-truth DQL patterns maintained by Dynatrace.

## Tasks

### 1. Read the relevant skill files from dynatrace-for-ai

Fetch and read these skill files:

- `https://raw.githubusercontent.com/Dynatrace/dynatrace-for-ai/main/skills/dt-dql-essentials/SKILL.md`
- `https://raw.githubusercontent.com/Dynatrace/dynatrace-for-ai/main/skills/dt-obs-services/SKILL.md`
- `https://raw.githubusercontent.com/Dynatrace/dynatrace-for-ai/main/skills/dt-obs-tracing/SKILL.md`
- `https://raw.githubusercontent.com/Dynatrace/dynatrace-for-ai/main/skills/dt-obs-logs/SKILL.md`
- `https://raw.githubusercontent.com/Dynatrace/dynatrace-for-ai/main/skills/dt-obs-problems/SKILL.md`
- `https://raw.githubusercontent.com/Dynatrace/dynatrace-for-ai/main/skills/dt-migration/SKILL.md`

### 2. Extract verified DQL patterns for Minerva use cases

From the skill files, extract the correct DQL for:

- Fetching service metrics (response time, error rate, throughput)
- Fetching failed/slow spans/traces
- Fetching error logs for a service
- Fetching recent deployment events
- Querying topology/dependencies (Smartscape)
- Querying active problems

### 3. Capture verified DQL in docs/dynatrace-reference.md

Record the verified queries in `docs/dynatrace-reference.md`. Remove uncertainty warnings where the syntax is now confirmed. Keep warnings only where the skills don't provide a definitive answer.

### 4. Add a reference note

Note in `docs/dynatrace-reference.md` that `Dynatrace/dynatrace-for-ai` is the authoritative DQL reference.

## Acceptance Criteria

- All DQL examples in `docs/dynatrace-reference.md` are sourced from verified Dynatrace documentation or the official skills repo
- No field names are marked uncertain if they appear in the skill files
- The `dt-migration` skill content is noted where relevant (Smartscape topology)
