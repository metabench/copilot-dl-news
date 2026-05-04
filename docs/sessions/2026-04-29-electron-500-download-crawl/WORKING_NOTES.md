# Working Notes

## 2026-04-29 Kickoff
- User requested another similar crawl, using 500 as the baseline rather than 250.
- User also asked to ensure the Electron app stays loaded once the crawl is complete.
- Reviewed previous session `WORKING_NOTES.md` and `FOLLOW_UPS.md` before editing because the user noted intervening changes.
- Reviewed `src/ui/electron/unifiedApp/main.js`: the app auto-exits only when run with `--smoke` or `--screenshot`; default mode remains loaded until the user closes the window.

- 2026-04-29 21:01 — 
## Memory / Session Setup
- docs-memory MCP health check passed.
- Created a dedicated session for the Electron 500-download crawl.

- 2026-04-29 21:02 — 
## Persistent Electron UI
- Launched Electron with `npm run electron:unified -- --url-path "/?app=downloads" --port 51014`.
- This intentionally omits `--smoke` and `--screenshot`, so `src/ui/electron/unifiedApp/main.js` keeps the window loaded until user close.
- Verified Electron process running: PID 22172.
- Verified Electron-spawned unified server route responded: `http://127.0.0.1:51014/api/downloads/stats` returned HTTP 200.

- 2026-04-29 21:03 — 
## Baseline
- Selected sites: `bbc.com`, `aljazeera.com`, `theguardian.com`, `cbsnews.com`, `nbcnews.com`, `france24.com`, `euronews.com`, `independent.co.uk`.
- Run-start timestamp for new downloads: `2026-04-29T21:02:54.481Z`.
- Baseline verifier showed zero new local downloads for all eight selected sites.

## Crawl Run
- Remote preflight initially showed the server idle and reset to just `bbc.com`, so the eight selected domains were registered cleanly for this run.
- Started continuous sync before crawling: `node tools/crawl/crawl-remote.js sync --interval 15 --window 300`.
- Started bounded crawl: `node tools/crawl/crawl-remote.js bounded --domains bbc.com,aljazeera.com,theguardian.com,cbsnews.com,nbcnews.com,france24.com,euronews.com,independent.co.uk --max-pages 600 --poll 20 --timeout-min 240`.
- Remote bounded crawl completed all 8 domains in 370.6s, each at 600 remote fetched pages.
- Final remote status: orchestrator `IDLE`, 4,800 fetched, 7,212 stored, 2 errors.

## Final Local Verification
- Final verifier command: `node docs/sessions/2026-04-29-electron-500-download-crawl/host-download-delta.js --since 2026-04-29T21:02:54.481Z`.
- Result: `allMetTarget: true` with target `500`.
- New local OK downloads:
	- `bbc.com`: 595
	- `aljazeera.com`: 595
	- `theguardian.com`: 581
	- `cbsnews.com`: 595
	- `nbcnews.com`: 587
	- `france24.com`: 592
	- `euronews.com`: 576
	- `independent.co.uk`: 572
- Final explicit pull after stopping continuous sync returned no new data.

## Electron UI Evidence
- Electron remained loaded after crawl completion and after screenshot capture: PID 22172.
- Electron-spawned server remained responsive: `http://127.0.0.1:51014/api/downloads/stats` returned HTTP 200.
- UI screenshot command: `npm run ui:crawl-display-screenshots -- --base-url http://127.0.0.1:51014 --output screenshots/electron-500-download-crawl`.
- UI screenshot analysis: `ok: true`; no horizontal overflow, no stuck iframe loading text, no serious browser events.
- Evidence paths:
	- `screenshots/electron-500-download-crawl/downloads.png`
	- `screenshots/electron-500-download-crawl/crawl-status.png`
	- `screenshots/electron-500-download-crawl/analysis.json`

## Final Process State
- Remote crawler: idle.
- Continuous sync: stopped.
- Electron unified app: intentionally left running on port `51014` for user inspection.

- 2026-04-29 21:04 — 
## 500 Crawl Start
- Remote preflight status was idle and reset to only `bbc.com`, with zero fetched/stored/pending.
- Started continuous sync: `node tools/crawl/crawl-remote.js sync --interval 15 --window 300`.
- Started bounded crawl: `node tools/crawl/crawl-remote.js bounded --domains bbc.com,aljazeera.com,theguardian.com,cbsnews.com,nbcnews.com,france24.com,euronews.com,independent.co.uk --max-pages 600 --poll 20 --timeout-min 240`.
- Missing domains were registered with `maxPages=600`.
