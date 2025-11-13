# Plan — Gap 5 Scouting & Feasibility

## Objective
Implement Gap 5 (dependency traversal flags), Gap 6 (call graph, hot paths, dead code detection), and Gap 7 (js-edit conflict resolution) per roadmap.

## Done When
- `--depends-on` and `--impacts` flags ship with enriched output + ≥15 targeted tests
- `--call-graph`, `--hot-paths`, and `--dead-code` operations available with ≥20 tests and docs
- js-edit conflict resolution workflow (Gap 7) delivered with auto-merge + detection logic and test coverage

## Change Set
- docs/sessions/2025-11-13-gap5-scouting/* (session documentation)
- tools/dev/js-scan.js and supporting operations
- tools/dev/js-scan/operations/* additions for dependency + call graph analysis
- tests/tools/js-scan/** new coverage
- tools/dev/js-edit.js and supporting BatchDryRunner/conflict modules
- tests/tools/js-edit/** new coverage

## Risks / Assumptions
- Graph computation features may require foundational refactors.
- Existing tests might need significant expansion (≥15 cases for Gap 5).
- Implementation could exceed single session scope.

## Tests & Benchmarks
- js-scan: add ≥35 combined unit/integration tests covering new flags, graph depth, edge cases
- js-edit: add regression tests validating conflict auto-merge, detection, recovery
- Execute `npm run test:by-path` for each updated test suite

## Docs to Update
- `docs/sessions/2025-11-13-gap5-scouting/` session files
- `.github/agents/Singularity Engineer.agent.md` (if new guidance required)
- `docs/INDEX.md` (if new guides are added)
