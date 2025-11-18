# Working Notes — 2025-11-17 jsgui-forward

## Sense
- Ran `node tools/dev/js-scan.js --dir src/ui --search Page_Context --json` to list SSR entry points (`render-url-table`, `diagramAtlasServer`, etc.); confirmed fallback issues tie back to registry seeding.
- Vendor jsgui client still auto-creates `Client_Page_Context`; hydration bugs traced to missing control registrations rather than context creation.
- `DiagramDataService` only exposed snapshot load/refresh; no telemetry/status endpoint, so Diagram Atlas progress UI remained binary.
- 2025-11-19: `node tools/dev/md-scan.js --dir docs --search "Data Explorer" --json` surfaced the UI Data Explorer planning notes + production test sessions we need to follow while designing the shared listing store.

## Plan
- See `PLAN.md` for objectives; record refinements here as the work evolves.
- Shared listing store next: url toggles, listing tables, diagnostics, pagers should hydrate from a single `/api/urls` payload with reset hooks per fetch.

## Act
- Added status tracking to `DiagramDataService` (ready/refreshing/error metadata, lastSuccess/error timestamps) plus `/api/diagram-data/status` route.
- Updated `renderDiagramAtlasHtml` to embed `statusUrl` in the bootstrapped state; client bundle now polls the status endpoint when refreshes are triggered.
- Client `hydrateDiagramAtlas` starts/stops a status watcher per refresh, updating the progress control with detail text while the CLI runs and reporting errors if the service fails.
- Introduced an optional `refreshDelayMs` hook on `DiagramDataService` (used only in tests) so we can deterministically capture the `refreshing` state, and expanded the diagram atlas e2e suite to cover the status endpoint.
- Built a shared URL listing store: the server now seeds `window.__COPILOT_URL_LISTING_STATE__`, the client boots a global store that feeds the table/meta/pagers, and `UrlFilterToggleControl` simply publishes API responses into the store.
- Extracted Diagram Atlas DOM + hydration logic into `src/ui/client/diagramAtlas.js` so the client entry only coordinates registry hooks, binding config, and bootstrap calls.
- Created `src/ui/client/jobsManager.js` and `src/ui/client/sseHandlers.js`, lifted from the CLIENT_MODULARIZATION_PLAN Phase 4 patterns so job rendering + SSE wiring live outside `index.js` and depend purely on injected DOM/actions.
- Added status indicator helpers + resume refresh scheduler to `src/ui/client/index.js`, so the entry file now boots control seeding, diagram atlas, URL listing store, and the new jobs/SSE modules without direct DOM mutations.

## Verify
- 2025-11-19: `npm run ui:client-build` after extracting the Diagram Atlas bootstrap module.
- 2025-11-17: End-to-end checks after wiring the listing store + Diagram Atlas module:
	- `node src/ui/server/checks/diagramAtlas.check.js`
	- `node src/ui/server/checks/dataExplorer.check.js`
	- `npm run test:by-path tests/ui/server/dataExplorerServer.test.js`
	- `npm run test:by-path tests/ui/server/dataExplorerServer.production.test.js`
	- `npm run test:by-path tests/ui/client/listingStateStore.test.js`
- 2025-11-22: `npm run ui:client-build` to confirm the jobs/SSE modularization compiles.
