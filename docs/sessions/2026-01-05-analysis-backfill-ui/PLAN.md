# Plan: Analysis Backfill UI Lab

Objective: Create a lab demonstrating analysis backfill on all database items with a navigable UI showing different analysis types.

Done when:
- [x] Lab directory `labs/analysis-backfill-ui/` created
- [x] Backend script fetches all downloads/URLs from DB
- [x] UI (Electron/Web) displays items and allows running analysis
- [x] UI shows different analysis types (e.g., Place Extraction, Sentiment, Classification)
- [x] Progress monitoring is visible

Change set:
- `labs/analysis-backfill-ui/*`
- `src/analysis/page-analyzer.js` (Added `analysisOptions`)
- `src/tools/analyse-pages-core.js` (Pass options, emit results)

Risks/assumptions:
- Database might be large, need pagination or streaming.
- "Different types of analysis" might need to be mocked or hooked into existing `page-analyzer.js`.

Tests:
- Manual verification of the UI.
- `node labs/analysis-backfill-ui/run-all.js --limit 5 --headless` passes.
