# Single UI Cohesion — Implementation Plan

## Scope (this session)
Harden the “single UI shell” workflow by making validation fast and deterministic, and by adding regression tests/docs that keep the unified registry stable.

## Acceptance Criteria
- `npm run schema:check` passes on Windows even when line endings differ.
- `npm run diagram:check` completes quickly and exits cleanly.
- Servers support `--check` + `--port` overrides:
  - `src/ui/server/unifiedApp/server.js`
  - `src/ui/server/opsHub/server.js`
  - `src/ui/server/qualityDashboard/server.js`
- Focused Jest test(s) exist for unified shell sub-app registry stability.
- Workflow doc exists describing how to add sub-apps and how to implement `--check`.

## Risks / Assumptions
- Schema drift hashing change must not hide “real drift” → only CRLF/LF normalization + timestamp stripping.
- `--check` fast-path must not change normal runtime → route short-circuit only applies under `--check`.
- Port handling must preserve defaults → parsing should override only when provided.

## Implementation Slices
### Slice 1 (completed)
- Normalize schema drift hashing for CRLF/LF and lock with Jest.
- Make `diagram:check` deterministic (DB section only).
- Add/verify `--check` + `--port` across servers.
- Add focused unified registry Jest test.
- Add workflow doc + index link.

### Slice 2 (completed)
- Add deterministic startup checks for the dashboard modules mounted by the unified app:
  - Rate Limit Dashboard
  - Webhook Dashboard
  - Plugin Dashboard
- Extend the focused Jest registry test to cover `GET /api/apps` schema.

### Slice 3 (completed)
- Make Docs Viewer mountable under `/docs` (base-path-aware assets + API URLs).
- Mount Docs Viewer into the unified shell and add a `Docs` sub-app entry.
- Add a focused Jest regression test for mount-path behavior.

### Slice 4 (next)
- Make Design Studio mountable under a prefix (e.g. `/design`) without breaking asset URLs or `/design-files/*` links.
- Add `--check` + a deterministic `src/ui/server/designStudio/checks/designStudio.check.js` startup check.
- Mount Design Studio into the unified shell and add a `Design` sub-app entry.
- Add a focused Jest test proving mount-path correctness.

## Validation Commands
Run these in order:
- `npm run schema:check`
- `npm run diagram:check`
- `node src/ui/server/unifiedApp/server.js --check --port 3055`
- `node src/ui/server/opsHub/server.js --check --port 3056`
- `node src/ui/server/qualityDashboard/server.js --check --port 3057 --db-path data/news.db`
- `node src/ui/server/rateLimitDashboard/checks/rateLimitDashboard.check.js`
- `node src/ui/server/webhookDashboard/checks/webhookDashboard.check.js`
- `node src/ui/server/pluginDashboard/checks/pluginDashboard.check.js`
- `npm run ui:docs:build`
- `node src/ui/server/docsViewer/checks/docsViewer.check.js`
- `npm run test:by-path tests/tools/__tests__/schema-sync.line-endings.test.js tests/ui/unifiedApp.registry.test.js tests/ui/docsViewer.mountPath.test.js`
