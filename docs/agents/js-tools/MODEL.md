# js-tools Model

- `tools/dev/js-scan.js`: CLI orchestrator that parses arguments (search, hash lookup, pattern, index, dependency summaries) and dispatches to operations; now exposes `--deps-of`, `--follow-deps`, and `--dep-depth` toggles (source: tools/dev/js-scan.js).
- `tools/dev/js-scan/shared/scanner.js`: Traverses the workspace, emits file records, and records `resolvedDependencies` with normalized `imports` and `requires` arrays for later fan-in queries (source: tools/dev/js-scan/shared/scanner.js).
- `tools/dev/js-scan/lib/fileContext.js`: Builds per-file metadata: module kind, priority score, dependency specs via `collectDependencies`, and byte-span previews (source: tools/dev/js-scan/lib/fileContext.js).
- `tools/dev/js-scan/operations/indexing.js`: Produces the repository index sorted by priority with dependency counts but leaves graph assembly to dedicated helpers (source: tools/dev/js-scan/operations/indexing.js).
- `tools/dev/js-scan/operations/dependencies.js`: Aggregates scanner output into bidirectional graphs with `fanOut` (imports) and `fanIn` (dependents); exports `runDependencySummary` for CLI use (source: tools/dev/js-scan/operations/dependencies.js).

## Dependency summary (implemented 2025-11-07)
- `--deps-of <path|hash>` resolves a target using hash, path, or selection; emits two terse tables (`Imports`, `Dependents`) plus counts, honoring `--limit` and `--dep-depth` flags.
- Default columns: `rank`, `path`, `relation`, `kind`, `depth`. `relation` is `out` for imports and `in` for dependents; depth > 1 adds a `via` column to show the previous hop.
- `--json` output structure: `{ file, fanOutCount, fanInCount, imports: [{ path, kind, depth }], dependents: [...] }` with entries sorted by depth then path.
- Guidance: zero results yield `fmt.info('deps.none', ...)`, prompting the agent to inspect siblings or entry points.
- Sample CLI output (depth 1, limit 3):
```
Imports (3)
1  src/utils/time.js        out  import  1
2  src/utils/logger.js      out  import  1
3  src/constants/format.js  out  import  1

Dependents (2)
1  src/app/processor.js     in   import  1
2  src/app/index.js         in   import  1
```
- Parse errors: text mode suppresses detailed messages by default and replaces them with `Use --deps-parse-errors for details.`; `--deps-parse-errors` (or legacy `--show-parse-errors`) prints samples after the tables and injects `parseErrors.samples` into `--json` responses.

## Active module notes (2025-11-07)
- tools/dev/js-scan/operations/dependencies.js -> fan-out: builds graph via `addEdge`; fan-in served by `collectDirection`; JSON payloads feed downstream agents.
- tools/dev/js-scan/shared/scanner.js -> records `resolvedDependencies` once per file, enabling instant fan-in lookup without rescanning.

## Sample runs (2025-11-07)
- Command: `node tools/dev/js-scan.js --deps-of tests/fixtures/tools/js-scan/sample.js --dep-depth 2 --limit 5` (≈3.3s). Output surfaced three pre-existing parse warnings and showed empty imports/dependents, exercising the guidance messaging:
```
Imports (0)
[⚠ WARN] No imports discovered for this file.

Dependents (0)
[ℹ INFO] No files import this module. Consider reviewing sibling directories or entry points.
[ℹ INFO] 3 files could not be parsed. Use --deps-parse-errors for details.
```
- Command: same arguments plus `--json` (≈3.2s). Returned minimal payload:
```
{
	"stats": { "fanOut": 0, "fanIn": 0, "depth": 2, "limit": 5 },
	"outgoing": [],
	"incoming": []
}
```
