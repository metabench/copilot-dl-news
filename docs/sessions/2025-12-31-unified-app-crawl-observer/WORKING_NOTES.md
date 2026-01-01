# Working Notes – Unified App: mount Crawl Observer

- 2025-12-31 — Session created via CLI. Add incremental notes here.

## Known facts (repo state)
- Unified App mounts sub-routers in-process via `mountDashboardModules()` in `src/ui/server/unifiedApp/server.js`.
- Sub-app navigation content is currently iframe-based in `src/ui/server/unifiedApp/subApps/registry.js`.
- Crawl Observer was refactored to be mountable (router factory exists), but the Unified App registry still shows a placeholder mentioning a separate port.

## Ranked options
| Option | Impact | Effort | Risk | Domains |
| --- | --- | --- | --- | --- |
| A) True in-process mount + iframe embed | High | S | Medium | UI + Ops |
| B) Reverse-proxy “single port” (transitional) | Medium | S | Low–Medium | Ops |
| C) First-class Unified App integration (no iframe; shared shell DOM) | Very high | L | Medium–High | UI |

### Option A (recommended)
- Mount Crawl Observer router under `/crawl-observer` inside the unified Express app.
- Update unified sub-app registry to embed `<iframe src="/crawl-observer">`.
- If Crawl Observer uses absolute internal links, add a `basePath` option and prefix links.

## Suggested implementation checklist (handoff-ready)
1) Add router mounting in unified app module list: id `crawl-observer`, mountPath `/crawl-observer`.
2) Inject DB handle from Unified App to Crawl Observer (avoid opening a second DB / avoid separate listen).
3) Update registry entry `crawl-observer` to iframe src `/crawl-observer` and remove port text.
4) Update `tests/ui/unifiedApp.registry.test.js` to assert the new embed mount path.
5) Run the focused Jest path test and capture output here.

## Validation
- `npm run test:by-path tests/ui/unifiedApp.registry.test.js`
	- Result: PASS (2 tests)
	- Note: observed warning `(node:114044) Warning: --localstorage-file was provided without a valid path` (test still passes)
