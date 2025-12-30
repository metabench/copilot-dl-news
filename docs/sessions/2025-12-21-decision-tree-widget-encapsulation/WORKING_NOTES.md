# Working Notes – Decision Tree access in crawl-widget + SQL encapsulation

- 2025-12-21 — Session created via CLI. Add incremental notes here.

## Context recap (from prior sessions)
- Data Explorer “current UI” runs on port 4600 and now mounts the Decision Tree Viewer under the same server (so the user-facing entry point is `http://localhost:4600/decision-trees`).
- crawl-widget (Electron) did not previously have any Decision Tree / Data Explorer integration; it now exposes a progressive-disclosure Tools panel that can open those URLs externally.
- Encapsulation: crawl-widget no longer executes raw SQL migrations/seeding directly; it calls DB adapter methods instead.

Related sessions:
- `docs/sessions/2025-12-20-decision-tree-viewer-crawler-integration/`
- `docs/sessions/2025-12-20-crawl-widget-decision-trees/`

## Discovery hook notes
- `docs/agi/SELF_MODEL.md` exists; AGI docs index recommends starting there for constraints/assets.

## SQL leakage inventory (high-signal findings)

This is a quick “where SQL is still executed outside the DB adapter layer” snapshot based on searching for `db.prepare(` / `db.exec(`.

### Category A — UI/server code running SQL directly (likely priority)
- `src/ui/server/geoImportServer.js` uses `better-sqlite3` directly and runs multiple `db.prepare(...)` queries.
- `src/ui/server/services/themeService.js` uses `db.prepare(...)` and `db.exec(...)` (including schema/migration-ish operations).
- `src/ui/server/services/metricsService.js` uses `db.prepare(...)`.

Interpretation: this violates the strictest interpretation of “SQL stays in db adapters”. If we want that rule globally, these should be wrapped behind adapters/repositories.

### Category B — non-UI “utils” running SQL directly (medium priority / depends on policy)
- `src/utils/articleCompression.js`, `src/utils/compression.js`, `src/utils/compressionBuckets.js`, `src/utils/bucketCache.js`
- `src/utils/HttpRequestResponseFacade.js`
- `src/utils/UrlResolver.js`

Interpretation: these modules appear to be DB-adjacent utilities that accept a `better-sqlite3` handle. They are not under `src/db/`, but they behave like data-access helpers.

### Category C — tooling / scripts / migrations running SQL (usually acceptable)
- `src/crawler/schema-migrations.js` runs `db.exec(...)` migrations.
- `src/tools/*` includes migration/normalization utilities that run `db.exec(...)`.

Interpretation: these are “data maintenance” entrypoints; keeping SQL here can be OK, but we should treat them as a controlled exception.

### Category D — tests running SQL directly (acceptable)
- Multiple tests use `better-sqlite3` in-memory DBs with `db.exec(...)` and `db.prepare(...)`.

## Options for “SQL only in adapter layer” (converge)

| Option | Impact | Effort | Risk | Domains |
| --- | --- | --- | --- | --- |
| 1) Strict layering: move all SQL under `src/db/**` | Enforces clear architecture; simplest mental model | L | High (touches many modules) | Data, UI |
| 2) Pragmatic layering: forbid SQL in UI/Electron layers only | Protects UX layers; low churn | S–M | Low | UI, Data |
| 3) Add an automated guard (CI check) + allow-list | Stops new leakage; enables incremental refactor | S | Low | Tooling |

Recommendation: Option 2 + 3 first (keep momentum, prevent backsliding), then selectively migrate the worst offenders to adapters.

## Suggested experiments / proof steps
- Add a small Node “no-sql-outside-db” check script that fails on new uses of `db.prepare`/`db.exec` in `src/ui/**` and `crawl-widget/**`, with an allow-list for tests/tools.
- Pick one UI server module (e.g. `themeService`) and extract its SQL into a `src/db/sqlite/...` repository (prove the pattern once, then rinse-repeat).

## Prior art worth reusing (avoid rediscovery)
- `docs/sessions/2025-11-28-css-js-separation/` already did a deep refactor of `geoImportServer.js` (CSS extraction + asset serving). Any work touching `geoImportServer.js` should reuse that structure instead of re-introducing inline CSS or one-off asset wiring.
- `docs/sessions/2025-12-13-data-explorer-wlilo-theme/` and related UI dev sessions reference `src/ui/server/services/themeService.js` as a persistence layer for themes. Refactoring it needs to preserve behavior used by the Data Explorer theme editor.

## Guard spec (concrete proposal)
Goal: prevent backsliding while allowing incremental cleanup.

### Rule
- FAIL if new direct SQL usage appears in UI/Electron layers:
	- `src/ui/**` (server + controls)
	- `crawl-widget/**`

### Signal patterns (MVP)
- Flag these text patterns (case-sensitive) in `.js/.cjs/.mjs`:
	- `db.prepare(`
	- `db.exec(`
	- `new Database(` / `require("better-sqlite3")` / `require('better-sqlite3')`

### Allow-list (MVP)
- Always ignore:
	- `src/db/**`
	- `tests/**`
	- `tools/**`
	- `scripts/**`
	- `checks/**`
  - `crawl-widget/node_modules/**` (dependency code)
- Optionally ignore legacy-safe exceptions via a small JSON allow-list file (path + reason), so we can keep the guard strict without blocking active work.

### Success criteria
- Fast (<2s) Node script runnable in CI.
- Prints a compact table: file, line, pattern, context.
- Exit code 1 on violations.

## Implementation complete
- ✅ Created `tools/dev/sql-boundary-check.js` (Node script, ~120 lines, text-based scanning).
- ✅ Created `config/sql-boundary-allowlist.json` with ignoreRoots + allow list.
- ✅ Added npm script: `npm run sql:check-ui`.
- ✅ Guard detects 64 violations across UI/server/services + crawl-widget layers.
  - Primary offenders: `geoImportServer.js` (27 violations), `themeService.js` (14 violations).
  - crawl-widget: only `main.js` (DB opening, explicitly allowed—not UI SQL leak).
- ✅ Allowlist correctly excludes `crawl-widget/node_modules` and allows crawl-widget/main.js as a tooling entrypoint.

Guard command status (2025-12-21):
```
npm run sql:check-ui
```
- Reports 58 violations in `src/ui/**` (after allowlist).
- Output: file path, line number, pattern, context snippet.
- Exit code: 0 = clean, 1 = violations found.
- Runs in ~200ms.
