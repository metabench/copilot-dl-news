# Plan – Crawl queued URLs with Electron speedometer

Mode: Place Disambiguation Singularity (active)

## Objective
Show distributed downloader progress with queue list and color transitions in Electron UI

## Done When
- [ ] Electron crawl UI shows queue list + speedometer with distributed downloader progress and color transitions when items finish.
- [ ] Crawl uses existing distributed download pipeline; progress appears rapid through queue.
- [ ] Validations/notes captured in `WORKING_NOTES.md`; follow-ups in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `src/ui/electron/*` (likely extend existing crawl Electron shell or create new view)
- `src/ui/server/crawl*` or downloader orchestration to expose queue/progress feed
- Checks under `src/ui/server/*/checks/` (for UI snapshot harness)
- Session docs in this folder (working notes, summary)

## Risks & Mitigations
- Missing or unclear distributed downloader hooks → inspect existing APIs/services before wiring UI; add adapters instead of duplicating logic.
- UI drift vs SSR controls → reuse jsgui3 patterns and add a check harness.
- Long-running crawl visibility → use observable pattern with periodic progress events.
- Electron packaging quirks on Windows → run via existing Electron app templates to avoid new build steps.

## Tests / Validation
- Run relevant UI check (new or updated) for Electron view (e.g., `node src/ui/electron/<app>/checks/*.check.js`).
- If server endpoints added, add/execute targeted unit/integration test or manual check via the Electron window.
- Verify distributed downloader invoked by running a small queued crawl and observing speedometer + color transitions.
