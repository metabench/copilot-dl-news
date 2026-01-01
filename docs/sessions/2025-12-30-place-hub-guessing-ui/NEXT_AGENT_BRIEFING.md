# Next Agent Briefing — Place Hub Guessing UI

## Where we are
- Goal: dedicated UI for place hub guessing (matrix coverage view) + subsystem breakdown with tests.
- This session started by locating relevant tables and code:
  - Tables: `place_page_mappings`, `place_hub_candidates`, `place_hubs`, `domains`, `places`.
  - Tools: `src/tools/guess-place-hubs.js`, `src/tools/find-place-hubs.js`, detector/analyzers.

## Immediate next implementation slice
- Add `src/ui/server/placeHubGuessing/server.js` router.
- Mount it from Unified App.
- Add a new Unified App sub-app entry.
- Add `checks/placeHubGuessing.matrix.check.js`.

## Guardrails
- Keep it read-only first.
- Prefer stable, deterministic SQL + small payloads.
- Avoid opening DB in global module scope; do it per-request or via injected handle.

## Validation
- Run focused Jest and the new check script(s) listed in VALIDATION_MATRIX.
