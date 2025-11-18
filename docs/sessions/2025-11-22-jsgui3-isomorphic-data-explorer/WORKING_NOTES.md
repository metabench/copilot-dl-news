# Working Notes – 2025-11-22 jsgui3 Isomorphic Data Explorer

## Sense
- Re-read `src/ui/server/dataExplorerServer.js` and `src/ui/render-url-table.js` to map how SSR payloads end up in the shared jsgui `renderHtml` helper.
- Looked at Diagram Atlas polish sessions for layout cues and ran `node tools/dev/js-scan.js --what-imports src/ui/server/dataExplorerServer.js --json` to inventory dependents before touching exports.

## Plan
- Followed `PLAN.md` (wide-layout refresh, tidy typography, new check, server + production tests) without scope changes.

## Act
- Rebuilt the shared `buildCss()` styles with a flex-based hero header, wider max-width clamps (up to 1760px), balanced subtitles, and refreshed meta-card/table/pager styling so text stays tidy on ultra-wide displays.
- Updated `renderHtml()` to wrap headings + subtitle in a `.page-shell__hero` container with optional action slot so the filter toggle docks to the right on large screens.
- Exported `DATA_VIEWS` + `renderUrlListingView` and added `src/ui/server/checks/dataExplorer.check.js` to render a standalone `/urls` preview for fast regressions.

## Verify
- `node src/ui/server/checks/dataExplorer.check.js`
- `npm run test:by-path tests/ui/server/dataExplorerServer.test.js`
- `npm run test:by-path tests/ui/server/dataExplorerServer.production.test.js`
