# Working Notes — 2025-11-17 jsgui3 isomorphic screenshot sweep

## Sense
- reviewed existing automation under `scripts/ui/capture-diagram-atlas-screenshot.js` and `scripts/ui/capture-url-table-screenshots.js`
- inspected `src/ui/server/dataExplorerServer.js` to understand available routes and data requirements

## Act
- added `scripts/ui/capture-data-explorer-screenshots.js` to spin up the Data Explorer server, collect sample URL/host context, and capture a batch of Puppeteer screenshots + HTML artifacts across `/urls`, `/urls?hasFetches=1`, `/domains`, `/crawls`, `/errors`, `/urls/:id`, and `/domains/:host`
- added `scripts/ui/capture-domain-detail-screenshot.js` as a thin utility that reuses the batch runner for targeted domain detail captures (usable for docs or regression tracking)

## Verify
- ran the batch capture with HTML exports for all default routes:
  - `cmd /c "node scripts/ui/capture-data-explorer-screenshots.js --routes urls,urls-fetched,domains,crawls,errors,url-detail,domain-detail --html > tmp/data-explorer-screens.log 2>&1"`
  - outputs in `screenshots/data-explorer/01-urls.png … 07-domain-detail.png` plus HTML mirrors and `manifest.json` (see `tmp/data-explorer-screens.log` for chronological capture logs)
- ran the focused domain helper with HTML export:
  - `cmd /c "node scripts/ui/capture-domain-detail-screenshot.js --html > tmp/domain-detail-screenshot.log 2>&1"`
  - outputs in `screenshots/data-explorer/domains/01-domain-detail.png` with companion HTML + manifest

## Follow-ups
- consider wiring these scripts into `npm run screenshot:data-explorer` / `npm run screenshot:domain-detail` for easier CI hooks
- add a lightweight gallery viewer under `screenshots/data-explorer/gallery.html` (optional)

## Follow-up — 2025-11-21 refresh

### Act
- widened the Diagram Atlas “Database Structure” tiles (treated as buttons) by introducing a DB-specific tile variant so each table name fits on a single line during SSR + hydration
- capped Puppeteer captures to a 1200px viewport/clip height in both `capture-data-explorer-screenshots.js` and `capture-diagram-atlas-screenshot.js`, ensuring tall pages no longer produce scroll-length PNGs

### Verify
- `node src/ui/server/checks/diagramAtlas.check.js` (via `npm run diagram:check`) to regenerate `diagram-atlas.check.html` with the new styling
- `cmd /c "node scripts/ui/capture-data-explorer-screenshots.js --routes urls,urls-fetched,domains,crawls,errors,url-detail,domain-detail --html > tmp/data-explorer-screens.log 2>&1"`
- `cmd /c "node scripts/ui/capture-domain-detail-screenshot.js --html > tmp/domain-detail-screenshot.log 2>&1"`
- `npm run diagram:screenshot` to capture the refreshed atlas preview with the 1200px cap
