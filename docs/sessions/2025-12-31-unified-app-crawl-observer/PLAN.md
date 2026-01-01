# Plan – Unified App: mount Crawl Observer

## Objective
Expose Crawl Observer inside unified app under a mounted router so it runs on the unified server/port (no separate service).

## Done When
- [x] Crawl Observer is reachable inside Unified App on the unified port (no separate listener).
- [x] Unified App sub-app registry embeds the mounted Crawl Observer route (no “loads from port …” placeholder).
- [x] Any required Crawl Observer base-path support (for links/assets) is implemented (or explicitly not needed).
- [x] Tests/validation evidence is captured in `WORKING_NOTES.md`.
- [ ] Key deliverables are summarized in `SESSION_SUMMARY.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- [ ] src/ui/server/unifiedApp/server.js
- [ ] src/ui/server/unifiedApp/subApps/registry.js
- [ ] tests/ui/unifiedApp.registry.test.js
- [ ] (Maybe) src/ui/server/crawlObserver/controls/* (if absolute links need a basePath)

## Risks & Mitigations
- **Base path / absolute links**: Crawl Observer pages may generate links like `/task/:id` that break when mounted under `/crawl-observer`.
	- Mitigation: add a `basePath` option to controls and prefix all internal links; or use relative URLs everywhere.
- **DB handle injection mismatch**: Unified App uses `openNewsDb` (`getDbRW()?.db`), while Crawl Observer currently resolves its own handle.
	- Mitigation: wire Crawl Observer router with a `getDbHandle` injected from Unified App.
- **Mount ordering + async router factories**: Unified App mounts modules via `Promise.resolve(...).then(app.use(...))`; mistakes can be subtle.
	- Mitigation: keep Crawl Observer mounting consistent with other modules and add a focused request test.

## Tests / Validation
- Update and run: `npm run test:by-path tests/ui/unifiedApp.registry.test.js`
- Manual sanity: start unified app and open `/?app=crawl-observer`, confirm navigation + task/event pages load.
