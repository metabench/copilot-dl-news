# Plan – Crawl Observer: SQL to DB layer + extract controls

## Objective
Finish Crawl Observer refactor:
- Move all SQL in Crawl Observer UI into the DB-layer module.
- Move all jsgui3 controls into `src/ui/server/crawlObserver/controls/`.
- Keep behavior + efficiency stable (seq cursor paging, tail-by-default, limit clamp, payload gating for polling).

## Done When
- [x] `src/ui/server/crawlObserver/server.js` contains no SQL and no embedded control classes.
- [x] Routes use `src/db/sqlite/v1/queries/crawlObserverUiQueries.js` (no `db.prepare(...)` in server).
- [x] Controls are imported from `src/ui/server/crawlObserver/controls/`.
- [x] Telemetry page behavior remains compatible.
- [x] A small check exists under `src/ui/server/crawlObserver/checks/` and has been run successfully.
- [x] `WORKING_NOTES.md` includes the validation output.

## Change Set
- `src/ui/server/crawlObserver/server.js`
- `src/db/sqlite/v1/queries/crawlObserverUiQueries.js`
- `src/ui/server/crawlObserver/controls/TaskListControl.js`
- `src/ui/server/crawlObserver/controls/TaskDetailControl.js`
- `src/ui/server/crawlObserver/controls/TelemetryDashboardControl.js`
- `src/ui/server/crawlObserver/checks/crawlObserver.smoke.check.js` (new)

## Risks & Mitigations
- Telemetry UI drift (control mismatch vs current server) → move the current telemetry UI into the control file so behavior stays compatible.
- DB path / read-only handle issues → reuse `resolveBetterSqliteHandle` + keep reads only.
- Live polling payload gating regression → ensure `includePayload` continues to be an opt-in query param and the UI only requests payload when needed.

## Tests / Validation
- `node src/ui/server/crawlObserver/checks/crawlObserver.smoke.check.js`

## Rollback Plan
- Revert the DB module and restore SQL in `server.js`.
- Switch `server.js` back to inline controls if needed.
