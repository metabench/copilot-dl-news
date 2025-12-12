# Plan – Data Explorer gaps: plan + first implementation

## Objective
Plan Data Explorer gaps and implement first high-leverage improvement (domain counts batching) with tests.

## Done When
- [ ] Plan has a prioritized, PR-sized roadmap with acceptance criteria.
- [ ] `/api/domains/counts` uses a batched/grouped DB query (no per-host querying).
- [ ] Focused Jest regression test covers batched counts behavior.
- [ ] Data Explorer HTML check script still renders core pages.
- [ ] Evidence (commands + outcomes) recorded in `WORKING_NOTES.md`.
- [ ] `SESSION_SUMMARY.md` + `FOLLOW_UPS.md` updated.

## Change Set
- `src/db/sqlite/v1/queries/ui/domainCounts.js` (new)
- `src/ui/server/dataExplorerServer.js` (update `/api/domains/counts` to use batched query)
- `tests/ui/server/dataExplorerServer.test.js` (new test cases)
- `docs/sessions/2025-12-12-data-explorer-gaps-impl/*` (plan + evidence + summary)

## Roadmap (PR-sized)

### PR1 — Batched domain counts (this session)
- Problem: `/api/domains/counts` loops hosts and issues per-host queries (scales poorly).
- Change:
	- Add `selectDomainCountsByHosts(db, hosts)` that returns counts grouped by host for a host list.
	- Keep existing schema-fallback behavior (http_responses/content_analysis path, with legacy fallbacks).
	- Update endpoint to map requested hosts → normalized host → batched result.
- Acceptance:
	- Counts are correct for multiple hosts and case/whitespace variants.
	- Response shape stays `{ counts: { [inputHost]: { allArticles, fetches }}}`.
	- Jest test asserts limited query execution (batched `.all()`), not per-host `.get()`.

### PR2 — Filters & search (URLs/Domains)
- Add queryable filters (host, classification, status ranges, time windows) and keep them shareable via URL.
- Acceptance:
	- Works without client JS (server-rendered links preserve filters).
	- APIs accept the same filter parameters.

### PR3 — Crawl/job drilldowns
- Extend crawl job listing with drilldown pages (job details, associated URLs/errors if present).

### PR4 — Real-time events (incremental)
- Replace stub `/api/events` with real server-sent events sourced from telemetry or crawl events.
- Keep “no Puppeteer required” validation via supertest.

### PR5 — Export tooling
- Add server-side export endpoints (CSV/NDJSON) for current table view + filters.

### PR6 — View consolidation
- Reduce duplicated per-view wiring (columns/rows/meta/renderOptions) with shared helpers.

## Risks & Mitigations
- **Schema drift / fallbacks**: keep try/catch fallback strategy already used in UI query modules.
- **Behavior drift**: preserve response keys and defaults (missing host => 0 counts).
- **Perf regressions**: include a small “experiment” check (optional) measuring old vs new on 50 hosts.

## Tests / Validation
- Jest: `npm run test:by-path tests/ui/server/dataExplorerServer.test.js`
- HTML check: `node src/ui/server/checks/dataExplorer.check.js`

## Experiments (separate, disposable)
- `checks/*.check.js` is the primary “no browser” rendering harness.
- Optional one-off script under `tmp/` to time counts for 50 hosts (record numbers, then delete or keep as follow-up).
