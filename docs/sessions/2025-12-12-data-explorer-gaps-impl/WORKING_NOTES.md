# Working Notes – Data Explorer gaps: plan + first implementation

- 2025-12-12 — Session created via CLI. Add incremental notes here.

## PR1: Batched domain counts

- Change: `/api/domains/counts` now uses a grouped/batched DB query (no per-host loop).
- New query module: `src/db/sqlite/v1/queries/ui/domainCounts.js`.

### Validation

- Jest: `npm run test:by-path tests/ui/server/dataExplorerServer.test.js`
	- Result: PASS (includes new `/api/domains/counts` test asserting batched `.all()` calls).
- HTML check: `node src/ui/server/checks/dataExplorer.check.js`
	- Result: OK (generated `data-explorer.urls.check.html` and `data-explorer.dashboard.check.html`).

## PR2 (slice): URL host filter + experiment harness

- Change: URL listing now supports `?host=<domain>` (case-insensitive exact match) for both server-rendered `/urls` and `/api/urls`.
- New check/experiment: `node src/ui/server/checks/dataExplorerUrlFilters.check.js`
	- Writes: `data-explorer.urls.*.check.html` + `data-explorer.urls.filters.check.json`.
- DB query support: `src/db/sqlite/v1/queries/ui/urlListingNormalized.js` now includes host-filtered page + count helpers.

### Validation

- Jest: `npm run test:by-path tests/ui/server/dataExplorerServer.test.js`
	- Result: PASS (includes `/api/urls` host-filtering coverage).
- HTML experiment/check: `node src/ui/server/checks/dataExplorerUrlFilters.check.js`
	- Result: OK (artifacts written).
