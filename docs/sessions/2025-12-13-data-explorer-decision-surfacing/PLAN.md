# Plan – Data Explorer: Decision/Reason Surfacing

## Objective
Surface crawler decision reasons (milestones/decision traces) in the Data Explorer UI so users can answer "Why did the crawler do X for URL Y?"

## Done When
- [x] `/decisions` view lists milestones with kind/scope/target filters
- [x] URL detail (`/urls/:id`) shows a "Decisions" card count + "Why" section when traces exist
- [x] `listMilestones()` supports `target` and `targetLike` filters
- [x] Jest tests cover the new routes
- [x] Check script generates `data-explorer.decisions.check.html`
- [x] Session summary documents the invariants

## Change Set
- `src/ui/server/dataExplorerServer.js` – added `renderDecisionsView`, `buildDecisionColumns`, `buildDecisionRows`; registered `decisions` view in `DATA_VIEWS`; extended `/urls/:id` to query milestones and show a Why panel.
- `src/db/sqlite/v1/SQLiteNewsDatabase.js` – added `target` and `targetLike` filters to `listMilestones()`.
- `src/ui/server/checks/dataExplorer.check.js` – added Decisions view preview.
- `tests/ui/server/dataExplorerServer.test.js` – added `crawl_milestones` table and `listMilestones()` mock; added tests for `/decisions` route and URL detail decisions card.

## Risks & Mitigations
- Risk: No milestones in production DB → empty view. Mitigation: Subtitle explains "No decision traces found"; check script validates render.
- Risk: Large milestone volume slows queries. Mitigation: Limit defaults to 100, capped at 200; indexed by `(scope, kind)` and new `target` column.

## Tests / Validation
- `npm run test:by-path tests/ui/server/dataExplorerServer.test.js` — 27 tests pass
- `node src/ui/server/checks/dataExplorer.check.js` — generates 3 HTML previews
