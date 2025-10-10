# RUNBOOK.md — Operational guide for agents

**Status**: COMPLETE  
**Last Updated**: September 29, 2025  
**When to Read**: You need to run the server, trigger crawls, run tests, or understand operational workflows

This handbook collects workflow reminders so `AGENTS.md` can stay focused on architecture and contracts.

## Weekly focus

- **Current focus:** Keep crawl orchestration centered on named `crawlType` presets (especially `intelligent`) while deepening place-hub detection/telemetry and upgrading live analysis UX.
- **If blocked:** Leave a short note in the roadmap table (see `ROADMAP.md`) with a link to your branch or draft PR so the next agent can pick it up.
- **Definition of done this week:** Docs and tests match the crawler CLI flags; run a fast smoke test with `UI_FAKE_RUNNER=1` before handing off.

## Quick start for agents

- Install dependencies once per checkout: `npm install`.
- Start the UI server from the project root when needed: `node src/ui/express/server.js`.
- **Database migrations**: Check schema status before starting work. See `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` for migration procedures.
- The server auto-selects an available high-numbered port (41000+ range by default); watch the `GUI server listening ...` log or set `PORT` to override.
- Trigger a deterministic crawl preview (no network) by posting to `POST /api/crawl` with `UI_FAKE_RUNNER=1`.
- Run a focused Jest suite: `npm test -- --runTestsByPath ui/__tests__/server.test.js`. For the full suite, drop the `--runTestsByPath` flag.
- Refresh analysis + milestone prerequisites: `npm run analysis:run` (reuses `analysis-run.js`).
- Golden rule: if you change an HTTP, SSE, or CLI contract, update the relevant section in `AGENTS.md` and add a single-line changelog entry to `CHANGELOG.md`.

## Guardrails & gotchas

- Deterministic tests expect `UI_FAKE_RUNNER=1`; without it, suites may hang waiting for real network traffic.
- `ui/server.js` is a legacy shim; keep all new Express logic in `src/ui/express/server.js`.
- Keep the changelog lean: fold related edits into a single dated bullet instead of adding multiple entries per day.
- SQLite writes happen in the crawler; when running locally, avoid deleting the DB while a job is active to prevent `SQLITE_BUSY` issues.

## Testing approach

- **Framework:** Jest; tests live in `ui/__tests__/`.
- **Cheat sheet:**
  - Fast cycle (PowerShell): ``$env:UI_FAKE_RUNNER=1; $env:TEST_FAST=1; npm test -- --runTestsByPath ui/__tests__/server.test.js``
  - Full suite: `npm test`
- **Pattern:** Spawn `src/ui/express/server.js` on a random port (via `PORT=0`) and exercise HTTP/SSE with the Node `http` module.
- **Fake runner toggles:**
  - Set `UI_FAKE_RUNNER=1` to use a built-in fake child runner that emits realistic progress quickly for tests.
  - Set `UI_FORCE_SPAWN_FAIL=1` to simulate immediate spawn failure (`done` should appear fast).
- **Timing notes:** Tests read seeded progress/log frames shortly after `/api/crawl` returns 202 to ensure the UI shows immediate activity.
