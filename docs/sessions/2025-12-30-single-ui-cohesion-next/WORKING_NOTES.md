# Working Notes – Single UI app cohesion  next steps

- 2025-12-30 — Session created via CLI. Add incremental notes here.

## 2025-12-30

Commands run:
- `node tools/dev/session-init.js --slug "single-ui-cohesion-next" --type "implementation" --title "Single UI app cohesion — next steps" --objective "Make unified UI shell reliable + verifiable without breaking existing servers."`
- `git checkout main`
- `git pull`
- `git checkout -b chore/single-ui-cohesion-next`

Notes:
- Session init updated `docs/sessions/SESSIONS_HUB.md`.

### Validation ladder (sanity)

- `npm run schema:check` initially failed with drift on Windows (hash mismatch caused by CRLF vs LF differences).
	- Fix: normalized line endings in `tools/schema-sync.js` drift hashing so CRLF/LF compare equal.
	- Evidence: after patch, `npm run schema:check` => `✅ Schema definitions are in sync`.

- `npm run diagram:check` initially appeared to hang (due to expensive `collectDiagramData()` default sections invoking large js-scan/js-edit runs).
	- Fix: made `src/ui/server/checks/diagramAtlas.check.js` collect only the DB section during check mode.
	- Evidence: `npm run diagram:check` => `Saved diagram atlas preview to ...\diagram-atlas.check.html` and exits.

### Unified UI entrypoints (inventory)

Unified shell server:
- `src/ui/server/unifiedApp/server.js`
	- Default port: `3000`
	- Core routes:
		- `GET /` renders the unified shell HTML (`UnifiedShell`) with `?app=<id>` selecting the active sub-app.
		- `GET /api/apps` returns registry metadata (id/label/icon/category/description).
		- `GET /api/apps/:appId/content` renders sub-app content via `renderContent()`.
	- Embedded (same-process) routers mounted (legacy servers still exist; this is additive):
		- `/rate-limit` (rate limit dashboard)
		- `/webhooks` (webhook dashboard)
		- `/plugins` (plugin dashboard)
		- `/telemetry` (query telemetry)
		- `/quality` (quality dashboard)
		- `/analytics` (analytics hub)
	- Check mode:
		- Server uses `wrapServerForCheck(...)` so `node src/ui/server/unifiedApp/server.js --check` should start, respond, and exit 0/1.

Sub-app registry:
- `src/ui/server/unifiedApp/subApps/registry.js`
	- Sub-app content today is mostly:
		- Embedded iframes hitting unified-shell-mounted routes (`/rate-limit`, `/webhooks`, `/plugins`, `/telemetry`, `/quality`, `/analytics`)
		- Placeholders for external servers (example: Crawl Observer mentions port `3007`)

Z-Server app catalog (separate UI surface):
- `z-server/ui/appCatalog.js` maps “major servers” to card specs (Data Explorer, Docs Viewer, Design Studio, Diagram Atlas, Geo Import, Gazetteer).

### `--check` verification hooks

Verified startup-check runs (avoid port collisions by choosing non-default ports):
- Unified shell: `node src/ui/server/unifiedApp/server.js --check --port 3055` => `✅ UnifiedApp startup check passed (port 3055)`
- Ops Hub (added wrapServerForCheck + --port parsing): `node src/ui/server/opsHub/server.js --check --port 3056` => `✅ OpsHub startup check passed (port 3056)`
- Quality Dashboard (added --port/--db-path parsing; made `/` fast during --check):
	- `node src/ui/server/qualityDashboard/server.js --check --port 3057 --db-path "data/news.db"` => `✅ QualityDashboard startup check passed (port 3057)`

### Focused Jest

- `npm run test:by-path tests/tools/__tests__/schema-sync.line-endings.test.js tests/ui/unifiedApp.registry.test.js`
	- Result: `2 passed, 0 failed` (exit `0`)
	- Note: runner emits a warning about `--localstorage-file` without a valid path (non-fatal).

### Post-packaging re-validation

After splitting commits, reran the ladder:
- `npm run schema:check` => ✅ in sync
- `npm run diagram:check` => saved `diagram-atlas.check.html`, exits cleanly
- `node src/ui/server/unifiedApp/server.js --check --port 3055` => ✅ pass
- `node src/ui/server/opsHub/server.js --check --port 3056` => ✅ pass
- `node src/ui/server/qualityDashboard/server.js --check --port 3057 --db-path "data/news.db"` => ✅ pass
- `npm run test:by-path tests/tools/__tests__/schema-sync.line-endings.test.js tests/ui/unifiedApp.registry.test.js` => ✅ 2 suites pass
