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

### Slice 2 (next)
- Add one more cheap invariant check for unified shell API:
  - e.g. a small check script that calls `GET /api/apps` and asserts required ids.
  - or expand existing Jest test to cover `/api/apps` output format.
- Consider extracting router factories where embedding isn’t clean yet (keep standalone server entrypoints).

## Validation Commands
Run these in order:
- `npm run schema:check`
- `npm run diagram:check`
- `node src/ui/server/unifiedApp/server.js --check --port 3055`
- `node src/ui/server/opsHub/server.js --check --port 3056`
- `node src/ui/server/qualityDashboard/server.js --check --port 3057 --db-path data/news.db`
- `npm run test:by-path tests/tools/__tests__/schema-sync.line-endings.test.js tests/ui/unifiedApp.registry.test.js`
