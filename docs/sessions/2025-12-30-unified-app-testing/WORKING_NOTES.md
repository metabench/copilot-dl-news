# Working Notes – Unified App  Extensive Test Pass
## 2025-12-30

### Gate runs

- `npm run diagram:check` ✅ (writes `diagram-atlas.check.html`)
- `npm run ui:client-build` ✅ (writes `public/assets/ui-client.js`)

### `schema:check` + better-sqlite3 ABI churn

- Initial `npm run schema:check` failed: `better_sqlite3.node` was built for Electron ABI 119.
- Fixed by rebuilding for current Node (v25.2.1 / ABI 141):
	- `npm rebuild better-sqlite3 --build-from-source`
	- `npm run schema:check` ✅

Note: Electron runs may require flipping back via `npm run electron:rebuild` (Electron ABI 119).

### Unified server smoke

- `node src/ui/server/unifiedApp/checks/unified.server.check.js` ✅

### Jest (focused)

- `npm run test:by-path tests/ui/unifiedApp.http.test.js` ✅
	- Note: Jest printed an unrelated warning about `--localstorage-file`.

### Puppeteer E2E (navigation smoke)

- `npm run test:by-path tests/ui/unifiedApp.puppeteer.e2e.test.js`
	- First run appeared to hang (interrupted with Ctrl+C)
	- Fixes applied:
		- Hardening: deterministic readiness polling (AbortController), stronger teardown
		- Correct server path resolution using `process.cwd()`
		- Ignore benign 404 console noise (favicon) and validate via response tracking
	- Final result: ✅ PASS (~4s)

### Puppeteer E2E (all apps navigation)

- Added a second E2E test that clicks every sidebar app and asserts:
	- Non-iframe apps render `.home-dashboard` or `.app-placeholder`
	- Iframe apps' mounted routes return HTTP 200 (e.g. `/docs`, `/design`, `/rate-limit`, etc.)
- `npm run test:by-path tests/ui/unifiedApp.puppeteer.e2e.test.js` ✅ (2 tests)
	- Note: Added an explicit wait for async `loadAppContent()` after nav clicks (prevents timing flakes).

### Ladder rerun

- `node src/ui/server/unifiedApp/checks/unified.server.check.js` ✅
- `npm run test:by-path tests/ui/unifiedApp.http.test.js` ✅
- `npm run test:by-path tests/ui/unifiedApp.puppeteer.e2e.test.js` ✅

### Bugfix: Home stuck on "Loading..."

- Symptom: Home tab shows "Loading..." forever.
- Root cause: initial active container was rendered with `data-loaded="true"` even though it only contained the loading placeholder, so the client skipped `loadAppContent('home')`.
- Fix: stop marking the active container as loaded; let client fetch content.
- Regression guard: Puppeteer smoke now asserts `.home-dashboard` renders.

- 2025-12-30 — Session created via CLI. Add incremental notes here.
