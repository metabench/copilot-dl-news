# Session Summary – Place Hub Guessing: jsgui3 controls + DB-layer SQL

## Accomplishments
- Refactored Place Hub Guessing server to remove UI-layer SQL and delegate all DB reads/writes to `src/db/sqlite/v1/queries/placeHubGuessingUiQueries.js`.
- Switched SSR rendering from manual HTML strings to isomorphic jsgui3 controls:
	- `PlaceHubGuessingMatrixControl` (matrix + filters + legend)
	- `PlaceHubGuessingCellControl` (drilldown + verification form)
- Fixed mount-prefix correctness by deriving links/forms from `req.baseUrl || ''` (works when mounted at `/place-hubs` in Unified App).
- Preserved compatibility with the deterministic check by keeping the `renderPlaceHubGuessingMatrixHtml()` export and required `data-testid` markers.

## Metrics / Evidence
- Deterministic SSR check: `node src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.check.js` → PASS (7/7)
- Jest regression: `npm run test:by-path src/tools/__tests__/guess-place-hubs.test.js` → PASS (4/4)
- SQL boundary scan: `node tools/dev/sql-boundary-check.js` → FAIL (73 violations) across other UI modules (not scoped to this feature).

## Decisions
- No separate ADR; followed the repo’s architecture directive: “all SQL in DB layer; UI uses isomorphic controls.”

## Next Steps
- Decide how to treat `tools/dev/sql-boundary-check.js` results (scope to “no new violations” vs “zero violations repo-wide”).
- If enforcing repo-wide, migrate other UI servers that still contain inline SQL to the DB adapter/query layer.
