# Coding Standards

## Language & Runtime

- TypeScript (strict mode) for all source code
- Node.js 20+ runtime
- ES modules (`"type": "module"` in package.json)

## Project Conventions

- Use `src/` as the source root
- One concern per file; keep files under 200 lines where practical
- Named exports over default exports
- Barrel files (`index.ts`) only at module boundaries

## TypeScript

- Enable `strict: true` in tsconfig
- Prefer interfaces for object shapes, types for unions/intersections
- No `any` — use `unknown` and narrow
- Use discriminated unions for state machines (e.g., recovery states)

## Naming

- Files: `kebab-case.ts`
- Types/Interfaces: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Directories: `kebab-case`

## Error Handling

- Never swallow errors silently
- Use typed error results where appropriate (`Result<T, E>` pattern)
- Log errors with context (service, operation, incident ID)

## Evidence Model

- Every claim in generated output must carry an `evidence` field
- Evidence types: `dynatrace` | `repo` | `inferred` | `assumption`
- Confidence levels: `high` | `medium` | `low`

## Dependencies

- Pin exact versions in package.json
- Prefer well-maintained packages with active security updates
- Minimize dependency count — stdlib and platform APIs first

## Testing

- Colocate tests: `*.test.ts` next to source files
- Use Vitest as test runner
- Mock external services (Dynatrace MCP, Gemini) in tests
- Demo scenario should be runnable without live Dynatrace connection

## Git

- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`
- One logical change per commit
- Branch naming: `feat/short-description`, `fix/short-description`
