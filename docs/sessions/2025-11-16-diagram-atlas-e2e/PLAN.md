# Plan: diagram-atlas-e2e

Objective: ensure the diagram atlas server boots cleanly and returns HTML by adding a runnable e2e test plus automation to execute it.

Done when:
- New e2e test program starts `diagramAtlasServer`, performs an HTTP request, and validates an HTML payload containing known markers.
- Test handles startup/teardown safely (dynamic port, timeout, informative diagnostics on failure).
- Test is wired into the existing test runner (e.g., `npm run test:by-path` or equivalent) and actually executed once to prove it passes locally.
- Session docs + hub updated with plan, notes, summary.

Change set:
- `tests/**` (likely under `tests/e2e` or similar) for the new Jest test file and helpers.
- Possibly `package.json` / scripts if a dedicated npm script is needed (avoid unless necessary).
- Docs: this session folder files + `docs/sessions/SESSIONS_HUB.md` entry.

Risks / assumptions:
- Server currently fails (per user) so we must understand root cause before writing a test; failure might be due to missing build artifacts, so test must build or mock data as needed.
- Server requires `tools/dev/diagram-data.js` output; ensure the test either stubs data or allows CLI to run quickly.
- Need to keep tests fast; avoid heavy CLI calls or large dataset loads.

Tests / Benchmarks:
- New Jest e2e test file (name TBD) executed via `npm run test:by-path` pointed at the new path.
- No extra benchmark needed; test should finish <5s ideally.

Docs to update:
- `docs/sessions/2025-11-16-diagram-atlas-e2e/WORKING_NOTES.md`
- `docs/sessions/2025-11-16-diagram-atlas-e2e/SESSION_SUMMARY.md`
- `docs/sessions/SESSIONS_HUB.md` with link to this session.
