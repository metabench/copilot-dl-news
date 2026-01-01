# Plan – Place Hub Guessing: jsgui3 controls + DB-layer SQL

## Objective
Refactor Place Hub Guessing UI server to use DB query module + isomorphic jsgui3 controls (no UI-layer SQL), while keeping existing checks passing.

## Done When
- [x] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [x] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- UI server/router refactor: `src/ui/server/placeHubGuessing/server.js`
- Isomorphic controls:
	- `src/ui/server/placeHubGuessing/controls/PlaceHubGuessingMatrixControl.js`
	- `src/ui/server/placeHubGuessing/controls/PlaceHubGuessingCellControl.js`
	- `src/ui/server/placeHubGuessing/controls/index.js`
- DB-layer UI queries (SQL lives here): `src/db/sqlite/v1/queries/placeHubGuessingUiQueries.js`
- Shared HTML wrapper used by controls: `src/ui/server/shared/index.js`

## Risks & Mitigations
- Risk: breaking deterministic matrix check expectations (test IDs, drilldown links).
	- Mitigation: preserve `renderPlaceHubGuessingMatrixHtml()` export and required `data-testid` markers.
- Risk: incorrect links when mounted under Unified App prefix.
	- Mitigation: build links/forms from `req.baseUrl || ''`.
- Risk: DB handle lifecycle / RW vs RO.
	- Mitigation: keep reads on injected handle; open a RW handle only for verification upserts.

## Tests / Validation
- Deterministic SSR check:
	- `node src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.check.js`
- Focused Jest regression:
	- `npm run test:by-path src/tools/__tests__/guess-place-hubs.test.js`
- SQL boundary scan (repo-wide; informational unless scoped):
	- `node tools/dev/sql-boundary-check.js`
