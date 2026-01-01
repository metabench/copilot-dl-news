# Plan – Unified App  Extensive Test Pass

## Objective
Add/verify broad automated coverage for unified server + mounts + Electron packaging

## Done When
- [ ] `npm run schema:check`, `npm run diagram:check`, `npm run ui:client-build` are green on Windows.
- [ ] Unified server has a deterministic start→probe→stop check covering `/`, `/docs`, `/design` + key assets.
- [ ] Targeted Jest tests cover: unified app registry schema + basic HTTP contracts for `/` + `/api/apps` + mount paths.
- [ ] A short Puppeteer navigation smoke runs against the unified server and fails on console errors.
- [ ] Electron dev run and packaged EXE smoke are repeatable (scripted) and documented.
- [ ] Evidence (commands + outputs) is captured in `WORKING_NOTES.md` and summarized in `SESSION_SUMMARY.md`.

## Change Set (initial sketch)
- src/ui/server/unifiedApp/checks/unified.server.check.js (new)
- tests/ui/unifiedApp.http.test.js (new)
- tests/ui/unifiedApp.puppeteer.e2e.test.js (new)
- src/ui/electron/unifiedApp/checks/packagedExe.check.js (new, optional)
- docs/sessions/2025-12-30-unified-app-testing/* (plan + notes + summary)

## Risks & Mitigations
- `better-sqlite3` ABI churn (Node vs Electron rebuild): document the required rebuild commands and keep Node checks running on Node ABI.
- Flaky E2E: keep Puppeteer assertions minimal and timeouts explicit; always shut down server/browser.
- Hanging processes: ensure all checks call `server.close()` and kill child processes in `finally`.

## Tests / Validation
- Gates:
	- `npm run schema:check`
	- `npm run diagram:check`
	- `npm run ui:client-build`
- Unified server check:
	- `node src/ui/server/unifiedApp/checks/unified.server.check.js`
- Jest (focused):
	- `npm run test:by-path tests/ui/unifiedApp.registry.test.js`
	- `npm run test:by-path tests/ui/unifiedApp.http.test.js`
	- `npm run test:by-path tests/ui/unifiedApp.puppeteer.e2e.test.js`
- Electron (focused / local evidence):
	- `npm run electron:unified -- --port 3172`
	- `npm run electron:unified:pack`
	- `node src/ui/electron/unifiedApp/checks/packagedExe.check.js`
