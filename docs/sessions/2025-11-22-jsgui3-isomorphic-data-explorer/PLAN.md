# Plan: data-explorer-makeover
Objective: Refresh the Data Explorer SSR surface so its typography/layout match the recent Diagram Atlas polish and stay stable on ultra-wide windows.

Done when:
- Updated shell/layout utilities produce tidy headers, stats, and tables across URLs/Domains/Crawls/Error views.
- Styles gracefully expand past 1600px without awkward gutters or stretched text blocks.
- Check scripts and targeted tests cover the new markup to guard SSR + hydration and reflect the makeover in screenshots/docs.

Change set:
- `src/ui/server/dataExplorerServer.js` (layout composition, metadata strings, class hooks)
- `src/ui/render-url-table.js` or adjacent style helpers if global shell adjustments are needed
- `src/ui/client/**` to ensure hydration wiring for any new control hooks
- `docs/ui/...` and this session log for traceability

Risks/assumptions:
- Assumes existing data payloads already expose everything needed; if not, log backend follow-up instead of patching here.
- Wide-layout tweaks must not break earlier screenshots/tests; will compare check output before/after.
- Need to ensure any shared CSS is loaded for both server/client bundles (might require client rebuild).

Tests:
- `node src/ui/server/checks/diagramAtlas.check.js` (baseline visual parity reference)
- `node src/ui/server/checks/dataExplorer.check.js` (add/update if missing)
- `npm run test:by-path tests/ui/server/dataExplorerServer.test.js`
- `npm run test:by-path tests/ui/server/dataExplorerServer.production.test.js`

Docs to update:
- `docs/ui/README.md` (add makeover notes if helpful)
- `docs/sessions/SESSIONS_HUB.md` (link this folder once work progresses)
