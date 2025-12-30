# Next Agent Briefing — Single UI App Cohesion

## What changed
- Fixed Windows-only false schema drift by normalizing CRLF/LF in schema hashing.
- Made `diagram:check` fast/deterministic (avoids expensive default scans).
- Ensured key UI servers support `--check` + `--port` overrides and actually pass on non-default ports.
- Added focused Jest tests for unified registry stability.
- Added a durable workflow doc: `docs/workflows/single-ui-app-cohesion.md`.

## Where to look
- Session evidence: `docs/sessions/2025-12-30-single-ui-cohesion-next/WORKING_NOTES.md`
- Workflow doc: `docs/workflows/single-ui-app-cohesion.md`
- Unified shell registry: `src/ui/server/unifiedApp/subApps/registry.js`

## What’s next (highest value)
- Add one more low-cost invariant check for unified shell API output (`/api/apps`) either as a check script or by extending the focused Jest test.
- Continue router-factory extraction for embedded apps where needed, but keep standalone servers intact.

## Validation ladder
Use: `docs/sessions/2025-12-30-single-ui-cohesion-next/VALIDATION_MATRIX.md`.
