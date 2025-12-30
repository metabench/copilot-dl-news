# Plan – Single UI app cohesion roadmap

## Objective
Review current UI/server structure and outline remaining work to make a cohesive, well-running single UI app.

## Constraints / Non-Goals
- Keep existing UI servers and standalone apps for now (no retirements; no loss of functionality).
- Prefer modularization that allows both:
	- Standalone servers (current scripts/ports keep working)
	- A new unified “single UI” app that reuses the same modules

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- Primary candidates (pick one “home”):
	- `src/ui/server/dataExplorerServer.js` (most mature: theme + nav + client bundle + SSE)
	- `src/ui/server/unifiedApp/server.js` + `src/ui/server/unifiedApp/views/UnifiedShell.js` (SPA-like shell)
	- `src/ui/server/opsHub/server.js` (launcher only; overlaps with unified shell)
- Likely integration targets:
	- `src/ui/server/rateLimitDashboard/server.js`
	- `src/ui/server/webhookDashboard/server.js`
	- `src/ui/server/pluginDashboard/server.js`
	- `src/ui/server/*/server.js` (crawlObserver, crawlerMonitor, docsViewer, designStudio, etc.)
	- `src/ui/client/index.js` (shared client bootstrap + control activation)
	- `public/assets/ui-client.js` (built artifact; ensure unified entry rebuilds it)

## Recommended Integration Approach (No-Retirement)
### 1) “App-as-module, server-as-runner”
For each UI surface we want inside the unified app, extract a mountable module:
	- `create<Feature>Router({ getDbRW, deps })` returning `express.Router()`
	- `render<Feature>Page({ req, ... })` or a jsgui3 control responsible for SSR markup
	- Optional `assets/` or view helpers under that feature directory

Then keep the existing server by rewriting it as a thin runner that mounts the router at `/` and listens on its legacy port.

### 2) Mount features inside the unified root
The unified root server imports those same `create<Feature>Router` modules and mounts them under stable prefixes, e.g.:
	- `/rate-limit/*`
	- `/webhooks/*`
	- `/plugins/*`
	- `/telemetry/*`

### 3) Standardize shared dependencies (DB + theme + telemetry)
- DB injection: prefer the existing unified pattern in `src/db/dbAccess.js` (middleware + `getDbRW`), so mounted routers don’t open their own `better-sqlite3` handles.
- Theme/layout: keep one shared theme service and allow legacy servers to use it (so UI looks consistent without breaking old entrypoints).
- Telemetry/SSE: keep SSE endpoints in the root where possible; sub-apps should register event topics/handlers rather than starting their own SSE.

### 4) Compatibility layer for “HTML fragment” loading
If we keep the Unified Shell’s “fetch fragment” approach for a while:
- Enforce script-free fragments.
- Ensure any dynamic behavior comes from the shared client bundle and can be re-activated on demand.

## First Slice (Low Risk)
- Start by modularizing one dashboard that already exports `app` and has minimal cross-coupling.
- Candidates: `rateLimitDashboard`, `webhookDashboard`.
- Goal: prove the pattern works (standalone server unchanged + same routes mounted under the unified root).

## Risks & Mitigations
- Overlap/port collision: `opsHub` and `unifiedApp` both default to port 3000.
	- Mitigation: choose a single “root” UI server for the unified app, but keep the other servers running on different ports (no retirement).
- “HTML via fetch + innerHTML” does not execute embedded `<script>` tags.
	- Mitigation: keep sub-app fragments script-free, or move scripts into the shared bundle and re-run activation hooks after content load.
- Multiple DB connections across mounted dashboards.
	- Mitigation: inject a shared DB handle (prefer `openNewsDb`) instead of each dashboard creating its own `better-sqlite3` connection.

## Tests / Validation
- Add/extend check scripts for the chosen root server:
	- SSR check for shell routing + at least one integrated sub-app.
	- Minimal Puppeteer smoke test for “nav click → content loads → no console errors”.
