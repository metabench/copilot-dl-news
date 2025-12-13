# Working Notes – jsgui3 Stack Regression Sweep

- 2025-12-13 — Goal: establish a repeatable pre-upgrade baseline for the jsgui3 UI stack.

## Key finding: Puppeteer flake root cause
- `tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js` can race UI client hydration.
	- Symptom: `page.waitForResponse(.../api/urls...)` times out because the `.filter-toggle__checkbox` change handler was not yet attached.
	- Fix: wait for the client bundle bootstrap (`window.__COPILOT_REGISTERED_CONTROLS__` includes `url_filter_toggle` and `window.__COPILOT_URL_LISTING_STORE__` exists) and use `waitUntil: "load"`.

## Baseline commands (pre-upgrade)

### Build
```powershell
npm run ui:client-build
```

### Server-side E2E (Jest)
```powershell
npm run test:by-path tests/server/diagram-atlas.e2e.test.js tests/ui/server/decisionTreeViewer.connection.e2e.test.js
```
Result: 2 suites passed, 16 tests passed.

### Puppeteer UI E2E (Jest)
```powershell
npm run test:by-path \
	tests/ui/e2e/art-playground.puppeteer.e2e.test.js \
	tests/ui/e2e/art-playground-resize.puppeteer.e2e.test.js \
	tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js \
	tests/ui/e2e/wysiwyg-demo.puppeteer.e2e.test.js
```
Result (after hydration wait fix): 4 suites passed, 35 tests passed.

### Data Explorer server tests (Jest)
```powershell
npm run test:by-path tests/ui/server/dataExplorerServer.test.js tests/ui/server/dataExplorerServer.production.test.js
```
Result: 2 suites passed, 33 tests passed.

## SSR check artifacts

### Diagram Atlas
```powershell
npm run diagram:check
```
Output: `diagram-atlas.check.html`

### Decision Tree Viewer
```powershell
npm run ui:decision-tree:check
```
Output: `decision-tree-viewer.check.html` (script reports `53 passed, 0 failed`).

### Data Explorer (URLs + dashboard + decisions)
```powershell
node src/ui/server/checks/dataExplorer.check.js
```
Outputs:
- `data-explorer.urls.check.html`
- `data-explorer.dashboard.check.html`
- `data-explorer.decisions.check.html`

### Data Explorer URL filter variants
```powershell
node src/ui/server/checks/dataExplorerUrlFilters.check.js
```
Outputs:
- `data-explorer.urls.default.check.html`
- `data-explorer.urls.hasFetches.check.html`
- `data-explorer.urls.host_example.com.check.html`
- `data-explorer.urls.host_example.com_hasFetches.check.html`
- `data-explorer.urls.filters.check.json`

### Facts page
```powershell
node src/ui/server/checks/facts.check.js
```
Output: `facts.check.html`.

### Home dashboard
```powershell
node src/ui/server/checks/homeDashboard.check.js
```
Output: `tmp/home.html`.

## Notes
- Some Jest runs print: `Force exiting Jest: Have you considered using --detectOpenHandles`. Tests still pass; follow-up is to address open handles noise separately.
- There are repeated `baseline-browser-mapping` freshness warnings; consider updating the dev dependency after the npm upgrade.
