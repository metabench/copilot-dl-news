# Next Agent Briefing — Single UI App Cohesion

## What changed
- Fixed Windows-only false schema drift by normalizing CRLF/LF in schema hashing.
- Made `diagram:check` fast/deterministic (avoids expensive default scans).
- Ensured key UI servers support `--check` + `--port` overrides and actually pass on non-default ports.
- Added focused Jest tests for unified registry stability.
- Added a durable workflow doc: `docs/workflows/single-ui-app-cohesion.md`.
- Added deterministic startup checks for unified-mounted dashboard modules (rate-limit / webhooks / plugins).
- Made Docs Viewer mountable under `/docs` (base-path-aware assets + API URLs) and mounted it into the unified shell.
- Made Design Studio mountable under `/design` (base-path-aware assets + design file links) and mounted it into the unified shell.

## Where to look
- Session evidence: `docs/sessions/2025-12-30-single-ui-cohesion-next/WORKING_NOTES.md`
- Workflow doc: `docs/workflows/single-ui-app-cohesion.md`
- Unified shell registry: `src/ui/server/unifiedApp/subApps/registry.js`

## What’s next (highest value)
- Pick one of the remaining “placeholder” unified sub-apps (Decision Tree / Template Teacher / Test Studio) and do the same cohesion treatment:
	- expose a mountable router (or mount its existing server) under a stable prefix
	- ensure `--check` exists and add `checks/<feature>.check.js`
	- switch the sub-app from placeholder HTML to an iframe pointing at the mounted prefix
	- add a focused Jest mount-path regression test

## Validation ladder
Use: `docs/sessions/2025-12-30-single-ui-cohesion-next/VALIDATION_MATRIX.md`.
