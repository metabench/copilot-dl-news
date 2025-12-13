# Session Summary – Crawler Documentation Coverage & Accuracy

## Accomplishments
- Made crawler documentation discoverable from the docs index (new `## Crawling` section).
- Reduced README drift by updating UI startup commands and clearly separating the active Data Explorer UI from the deprecated Express dashboard.
- Linked roadmap usage guidance to the session/decision workflow.
- Refreshed the existing crawler operations runbook and child-process debugging guide to match current repo paths.

## Metrics / Evidence
- Evidence: `package.json` contains `ui:data-explorer`, `diagram:server`, `ui:docs`, `ui:client-build` (README now references these).
- Evidence: `docs/INDEX.md` now links to `docs/RUNBOOK.md` and `docs/DEBUGGING_CHILD_PROCESSES.md` under the Crawling section.

## Decisions
- None.

## Next Steps
- Consider adding a short “crawl CLI entrypoints” note explaining the difference between `src/crawl.js` (npm start) and the repo-root `crawl.js` (operations/sequences).
- If we still want `npm run gui`, decide whether to reintroduce it as a compatibility alias for the deprecated server (or keep it intentionally absent).
