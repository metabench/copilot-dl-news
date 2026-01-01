# Working Notes – Place Hub Guessing: jsgui3 controls + DB-layer SQL

- 2025-12-30 — Session created via CLI.

- Refactor scope
	- Goal: remove UI-layer SQL from Place Hub Guessing server and render with isomorphic jsgui3 controls.
	- Notes: router is mounted under Unified App at `/place-hubs`, so link generation must respect `req.baseUrl`.

- Implementation notes
	- Updated `src/ui/server/placeHubGuessing/server.js` to:
		- call DB-layer model builders (`buildMatrixModel`, `getCellModel`, `upsertCellVerification`) from `src/db/sqlite/v1/queries/placeHubGuessingUiQueries.js`
		- render matrix and cell pages using jsgui3 controls:
			- `PlaceHubGuessingMatrixControl`
			- `PlaceHubGuessingCellControl`
		- use shared wrapper `renderPageHtml()` from `src/ui/server/shared/index.js`
		- build links/forms via `basePath = req.baseUrl || ''`

- Validation evidence
	- Deterministic SSR matrix check:
		- Command: `node src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.check.js`
		- Result: PASS (7/7)
			- Has root test id
			- Has legend
			- Has matrix table
			- Has filters form
			- Has drilldown cell links

	- SQL boundary scan (repo-wide):
		- Command: `node tools/dev/sql-boundary-check.js`
		- Result: FAIL with "SQL boundary violations found (73)"
		- Interpretation: appears to be pre-existing violations in other modules; not specific to Place Hub Guessing refactor.

	- Focused Jest regression:
		- Command: `npm run test:by-path src/tools/__tests__/guess-place-hubs.test.js`
		- Result: PASS (4/4)

- Matrix header UX + reuse (follow-on)
	- Added a reusable, isomorphic `MatrixTableControl` under shared controls.
		- Supports swapping axes by passing different `rows`/`cols` and label/title/key accessors.
		- Supports rotated column headers (45°) and label truncation with `…` + tooltip.
	- Updated `PlaceHubGuessingMatrixControl` to use `MatrixTableControl` and new header markup.

- Validation evidence (follow-on)
	- Deterministic SSR matrix check:
		- Command: `node src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.check.js`
		- Result: PASS (8/8)
			- Includes new assertion: `data-testid="matrix-col-headers"`
	- Screenshot check:
		- Command: `node src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.screenshot.check.js`
		- Result: PASS
		- Output: `screenshots/place-hub-guessing-matrix.png`
		- Output (flipped view): `screenshots/place-hub-guessing-matrix-flipped.png`

- Flip-axes toggle (follow-on)
	- Added a `Flip axes` button (`data-testid="flip-axes"`) and a second, flipped matrix orientation.
	- Implemented as SSR of both views + CSS hide/show based on `data-view`, plus a tiny inline script to toggle `data-view` on click.
	- Deterministic SSR matrix check now asserts:
		- `data-testid="flip-axes"`
		- `data-testid="matrix-view-a"` and `data-testid="matrix-view-b"`
		- `data-testid="matrix-table-flipped"`
