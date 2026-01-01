# Single UI App Cohesion (No-Retirement Shell)

## Goal
Build a **single UI shell** that makes the project’s many UI servers feel cohesive **without deleting or replacing** any existing servers, ports, scripts, or workflows.

This repo follows:
- **App-as-module, server-as-runner**: shared app logic should be importable; servers stay thin.
- **No-retirement**: existing per-feature servers remain runnable on their original ports.

## Current Unified Shell Entry Points
- Unified shell server (embedded + API): `npm run ui:unified` → `src/ui/server/unifiedApp/server.js` (default port 3000)
- Ops Hub (launcher / link-out registry): `npm run ui:ops-hub` → `src/ui/server/opsHub/server.js` (default port 3000)
- Major app catalog (z-server): `z-server/ui/appCatalog.js` (cards for major servers)

## How To Add A New Sub-App To The Unified Shell

### 1) Decide: embedded vs link-out

**Embedded (preferred when feasible)**
- The unified shell mounts the sub-app router under a stable prefix (e.g. `/quality`).
- The sub-app continues to have its own standalone server/port, unchanged.

**Link-out / external (when embedding is not feasible yet)**
- The unified shell renders a placeholder or an `<iframe>` pointing at a known URL.
- Existing port stays authoritative.

### 2) Register the sub-app
Edit `src/ui/server/unifiedApp/subApps/registry.js`:
- Add an entry `{ id, label, icon, category, description, renderContent }`.
- Keep `id` stable (tests rely on it).
- Prefer `renderContent()` returning an `<iframe class="app-embed" src="/<prefix>">` for embedded apps.

### 3) Mount the router (embedded apps)
Edit `src/ui/server/unifiedApp/server.js`:
- Add a module entry in `mountDashboardModules(...)` with:
  - `mountPath` (e.g. `/quality`)
  - `full()` returning a router factory result: `{ router, close }` (or an Express router function)
- **Do not remove** the standalone server entrypoint for that sub-app.

### 4) Add/Update a focused verification
Add one of:
- A small SSR check script under `src/ui/server/<feature>/checks/*.check.js`.
- Or a focused Jest test under `tests/ui/` that asserts registry ids + mount paths.

## How To Add `--check` Mode (Fast Verification)

### Preferred pattern: `wrapServerForCheck`
Use `src/ui/server/utils/serverStartupCheck.js`:
- Call `wrapServerForCheck(app, port, host, onListening)` in the server runner (`if (require.main === module)`).
- `node <server.js> --check --port <freePort>` should:
  - start
  - respond on `/`
  - exit with `0` on success (or `1` on failure)

### Make checks deterministic
If your `/` route is expensive (DB reads, heavy aggregation), make `--check` fast:
- Detect check mode in the route (example: `process.argv.includes('--check')`) and return minimal HTML quickly.
- Alternatively add a cheap `GET /api/health` and point your startup checker at that endpoint.

### Always support port overrides
To avoid port collisions in CI and local workflows:
- Parse `--port <n>` in the runner.
- Keep the existing default port unchanged.

## Enforcing “No-Retirement” In Practice
- Keep the original server scripts and npm scripts intact (ports remain authoritative).
- Prefer extracting a router factory from each server module (e.g. `create<Feature>Router(...)`) and mounting it in the unified shell.
- The unified shell is additive: it embeds or links to existing apps; it does not replace them.

## Suggested Validation Ladder
Run these in order for fast feedback:
- `npm run schema:check`
- `npm run diagram:check`
- One or more server checks (choose non-default ports):
  - `node src/ui/server/unifiedApp/server.js --check --port 3055`
  - `node src/ui/server/opsHub/server.js --check --port 3056`
  - `node src/ui/server/qualityDashboard/server.js --check --port 3057 --db-path data/news.db`
- Focused Jest:
  - `npm run test:by-path tests/ui/unifiedApp.registry.test.js`
