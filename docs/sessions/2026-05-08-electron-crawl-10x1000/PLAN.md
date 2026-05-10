# Plan: Electron Cloud Crawl 10x1000

Objective: Run a 10-site x 1000-page remote crawl, show live progress in the Electron unified UI, and keep local downloads syncing in near-immediate timestamped batches.

Done when:
- Electron unified app can open directly to `cloud-crawl` and show the remote 10x1000 run.
- Remote crawl server has all 10 domains configured and running via a single profile command.
- Local `data/news.db` receives timestamped export batches every 5 seconds, with remote export queries indexed and measured.
- Evidence is captured under this session: command output, health/sync metrics, screenshots, and review notes.

Change set:
- `src/ui/electron/unifiedApp/main.js`
- `src/ui/server/crawlStatus/**`
- `src/ui/controls/CloudCrawlPanelControl.js`
- `src/ui/server/unifiedApp/server.js`
- `tools/crawl/crawl-remote.js`
- `tools/crawl/profiles/remote-news-10x1000.json`
- `deploy/remote-crawler-v2/multi-domain-server.js`
- `deploy/remote-crawler-v2/crawl-domains.news-10x1000.json`
- `package.json`
- `docs/sessions/2026-05-08-electron-crawl-10x1000/**`

Risks / assumptions:
- The in-process Electron crawl path can starve the UI at 10 x 1000; the durable path is the remote/cloud crawler plus local sync.
- The crawl is long-running; success for this session means active workers, local sync, and visible Electron progress, not necessarily completion of all 10,000 pages before handoff.
- Remote API server restarts must use a 10-domain no-auto-start config so PM2 worker state is preserved and recoverable.

Validation commands:
- `node --check src/ui/electron/unifiedApp/main.js`
- `node --check src/ui/server/crawlStatus/CrawlStatusPage.js`
- `node --check src/ui/server/crawlStatus/crawl-status-client.js`
- `node --check src/ui/server/crawlStatus/controls/CrawlBatchLauncherControl.js`
- `node tools/crawl/crawl-batch.js --preset news-10 --max-pages 1000 --ui-port 3170 --dry-run --json`
- `node tools/crawl/crawl-batch.js --preset news-10 --max-pages 1000 --ui-port 3170 --json`
- `node tools/crawl/index.js --dry-run remote-news-10x1000`
- `node tools/crawl/index.js remote-news-10x1000`
- `node tools/crawl/crawl-remote.js health --host 141.144.193.218:3200 --json`
- `node tmp/_benchmark_remote_export.js 141.144.193.218:3200 since=2026-05-08T00:59:27Z limit=250 includeContent=false includeLinks=false`
- `node scripts/ui/capture-unified-crawl-display.js --base-url http://127.0.0.1:3170 --output docs/sessions/2026-05-08-electron-crawl-10x1000/screenshots --save-screenshots --save-dom-snapshots`

Docs to update:
- `WORKING_NOTES.md`
- `SCREENSHOT_REVIEW.md`
- `SCREENSHOT_COMMENTS.md`
- `SESSION_SUMMARY.md`
