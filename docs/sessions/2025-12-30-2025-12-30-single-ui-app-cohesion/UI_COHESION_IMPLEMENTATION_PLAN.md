# Implementation Plan — Cohesive single UI app (no-retirement)

## Objective
Deliver a cohesive “single UI” experience while preserving all legacy servers and ports.

## Guiding constraints
- No retirement: legacy servers remain runnable.
- Prefer mechanical, repeatable refactors.
- Validate continuously: `--check` for every server you touch.

## Phase 0 — Inventory + invariants (0.5–1 day)

### Outputs
- A validated list of UI server entrypoints.
- A validation matrix (commands that should succeed).

### Tasks
- Enumerate `src/ui/server/**/server.js`.
- For each server, record:
  - default port (if any)
  - whether it already exports a router factory
  - whether it supports `--check`

## Phase 1 — Finish dashboard modularization (1–3 days)

### Goal
All UI servers can be mounted as modules.

### Core work
For each remaining server:
1) Extract `create<Feature>Router({ dbPath, getDbRW, getDbHandle, mountPrefix, includeRootRoute })`.
2) Gate runtime startup behind `require.main === module`.
3) Implement `--check`.
4) Ensure DB usage obeys injection contract.

### Priority order (recommended)
- Servers that are easiest and least coupled first:
  - `docsViewer`, `goalsExplorer`, `controlHarness` (typically minimal DB + fewer routes)
- Then:
  - `opsHub` (launcher)
  - `adminDashboard` (heavier; may require careful prefix handling)
- Then:
  - `designStudio`, `testStudio`, `artPlayground`, `wysiwyg-demo`, `visualDiff`, `decisionTreeViewer`

### Risks
- Some servers may rely on being mounted at `/`.
- Some servers may be using legacy jsgui control patterns that break under `--check` SSR.

## Phase 2 — Unified app as the canonical entry (1–2 days)

### Goal
`unifiedApp` is the “home” UI server. Other servers remain available but become optional.

### Tasks
- Ensure unified app mounts every modularized router under a stable prefix.
- Add a single navigation registry that:
  - lists available subapps
  - links to mounted prefixes
  - does not depend on hardcoded ports

### UX outcomes
- Users can reach every dashboard from a single homepage.
- Embedded content works (iframe or direct SSR routes).

## Phase 3 — Shared theme/layout/client activation (2–5 days)

### Theme
- Decide a single base theme / shared layout wrapper.
- Avoid breaking legacy servers: theme changes must be opt-in or non-breaking.

### Client activation
- Standardize a shared client bootstrap that can re-activate controls after navigation.
- If using fragment loading, enforce script-free fragments; move JS into shared bundle.

## Phase 4 — SSE/telemetry consolidation (optional, 2–4 days)

### Goal
Reduce duplicated SSE endpoints and enable a unified “event stream” in the root app.

### Tasks
- Identify dashboards that expose SSE.
- Provide a common SSE service in the unified app; dashboards register topics/handlers.

## Validation strategy

### Per-server
- `node src/ui/server/<feature>/server.js --check`

### Unified app
- `node src/ui/server/unifiedApp/server.js --check`
- Add an integrated probe that confirms at least one mounted dashboard endpoint responds.

### Optional targeted Jest
- Prefer `npm run test:by-path ...` for any new tests.

## Done when
- Every UI server is mountable and `--check` passes.
- Unified app presents stable navigation to all features.
- A single operator-facing entrypoint exists without breaking legacy ports.
