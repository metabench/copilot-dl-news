# Dashboard Modularization Standard — App-as-module, server-as-runner

## Objective
Define the standard abstraction for UI dashboards so they can:
- run as standalone servers (legacy behavior preserved), and
- mount cleanly inside the unified UI server under a prefix.

This document is intentionally prescriptive: the goal is to make “one more dashboard” a repeatable mechanical task.

## Standard module contract

### Export shape
Each dashboard `server.js` (or a sibling module) should export:

- `async function create<Feature>Router(options = {})` → returns `{ router, close }`
  - `router`: an Express app/router ready to mount.
  - `close`: async function that releases resources opened by the feature.

Additionally, legacy exports (like `app`, `PORT`, `initDb`) can remain for compatibility.

### Options
A dashboard router factory MUST accept DB injection and SHOULD accept mount/prefix configuration:

- `dbPath?: string`
- `getDbRW?: () => NewsDatabase`
- `getDbHandle?: () => import('better-sqlite3').Database`
- `mountPrefix?: string` (recommended)
- `includeRootRoute?: boolean` (default: `true` for standalone, `false` for unified mounting when `/` collisions exist)
- `deps?: object` (optional dependency injection: services, trackers, managers)

### DB resolution rule
- If `getDbRW` is provided, use that (preferred).
- Else if `getDbHandle` is provided, use that.
- Else open a local `better-sqlite3` connection using `dbPath`.

In this repo, the bridging helper lives at:
- `src/ui/server/utils/dashboardModule.js` (exposes `resolveBetterSqliteHandle(...)`).

## Runner contract (legacy server behavior)

### Import safety
A server module MUST NOT start listening during module import.
Use:
- `if (require.main === module) { ... start server ... }`

### `--check` support
Every server runner should implement:
- `node <server.js> --check`

Behavior:
- start server on the requested/default port
- perform a simple probe (HTTP GET) for a known route
- close server + resources
- exit 0 on success, exit 1 on failure

The shared wrapper used in recent refactors is `wrapServerForCheck(...)`.

## Prefix-safety guidelines
When a feature is mounted under `/some-prefix`:
- Internal links must be built relative to `mountPrefix` (or based on `req.baseUrl`).
- Avoid hardcoding absolute paths like `/api/...` unless they intentionally target the root app.

Recommended convention:
- Provide `mountPrefix` to page renderers/controls.
- Build URLs as `${mountPrefix}/api/...`.

## Minimal per-dashboard migration checklist
1) Add `create<Feature>Router(options)` returning `{ router, close }`.
2) Ensure DB injection works (use `resolveBetterSqliteHandle`).
3) Ensure import safety (`require.main === module`).
4) Ensure `--check` works and probes at least one SSR route.
5) Ensure unified mounting does not conflict at `/`.
6) If mounted under a prefix, verify links and assets load.

## Acceptance criteria
A dashboard is “modularized” when:
- Standalone mode works on its legacy port.
- Unified mode works when mounted under a prefix.
- `--check` exits 0.
- The router factory requires no global mutable state to initialize.
