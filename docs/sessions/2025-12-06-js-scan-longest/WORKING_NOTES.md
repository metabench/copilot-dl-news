# Working Notes – js-scan longest files

- 2025-12-06 — Session created via CLI. Add incremental notes here.
- Added `--longest-files` flag to `tools/dev/js-scan.js` with optional `--length-metric` (lines|bytes).
- New summarizer/printer reports top-N files (default limit=20) with line/byte stats plus entry/priority markers.
- Updated Chinese help row and alias mapping; normalized metric parsing.
- Added built-client filter (public/dist/build bundles) so longest list focuses on source; reran and top 10 now show crawler/orchestration/db hotspots instead of generated bundles.
- Tightened filter to drop any `*.bundle.js` globally (regardless of location) to remove lingering client bundles like `ui/server/artPlayground/client.bundle.js`.
- Ran `node tools/dev/js-scan.js --dir src --longest-files --limit 10` after stricter filter — now shows `crawler/NewsCrawler.js`, `orchestration/DomainProcessor.js`, `ui/server/dataExplorerServer.js`, `db/sqlite/...`, etc.; bundle artifacts removed.
