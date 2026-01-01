# Plan – Unified App: run crawl + progress

## Objective
Add an easy crawl runner + progress view inside Unified App using existing crawler UI modules.

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

- [ ] Unified App exposes a “Crawl Status / Run Crawl” sub-app with a start form.
- [ ] Starting a crawl creates an in-process job and emits telemetry to the status UI.
- [ ] Crawl progress is visible via the telemetry stream (SSE or remote observable).

## Change Set (initial sketch)
- `src/ui/server/unifiedApp/server.js` (mount crawl telemetry + crawl v1 routes + status UI)
- `src/ui/server/unifiedApp/subApps/registry.js` (add Crawl Status sub-app iframe)
- `src/ui/server/crawlStatus/CrawlStatusPage.js` (add “start crawl” UI affordance)
- `src/ui/server/crawlStatus/server.js` (new: express router wrapper for Crawl Status page)
- `tests/ui/unifiedApp.registry.test.js` (assert new sub-app exists)

## Risks & Mitigations
- **Route surface creep**: keep mounts minimal and namespaced (`/api/v1/crawl`, `/api/crawl-telemetry/*`, `/shared-remote-obs/*`).
- **Long-running tasks**: in-process crawls run inside the Unified App process; default to single-job mode unless explicitly enabled.
- **UI base paths**: Crawl Status uses absolute `/api/...` URLs; keep APIs mounted at the root so it works from any mount path.

## Tests / Validation
- `node src/ui/server/crawlStatus/checks/crawlStatusPage.remoteObservable.check.js`
- `npm run test:by-path tests/ui/unifiedApp.registry.test.js`
- Manual smoke: start Unified App and confirm `/?app=crawl-status` can start a crawl and show events.
