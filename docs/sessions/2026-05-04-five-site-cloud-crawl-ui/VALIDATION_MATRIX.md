# Validation Matrix: Five-Site Cloud Crawl UI

| Area | Command / Check | Expected Evidence | Status |
| --- | --- | --- | --- |
| Crawl remote availability | `node tools/crawl/crawl-remote.js status --json` | Remote fleet reachable; final status showed `maxConcurrent=5`, 25 fetched, 0 errors | Passed |
| Five-site crawl | `node tools/crawl/crawl-remote.js bounded --domains bbc.com,theguardian.com,cbsnews.com,nbcnews.com,france24.com --max-pages 5 --max-concurrent 5 --poll 3 --timeout-min 10` | Five sites targeted, five pages each, parallel cloud downloads | Passed |
| Remote sync | `C:\nvm4w\nodejs\node.exe tools/crawl/crawl-remote.js pull --window 600 --limit 5000` | Pulled 25 URLs/content/responses and ingested 25 responses into local `data/news.db` | Passed |
| Local DB evidence | Inline Node call to `getCloudCrawlStatusSnapshot(... since:'2026-05-04')` | 25/25 OK downloads, 5/5 sites at goal, 100 percent progress | Passed |
| UI render | `C:\nvm4w\nodejs\node.exe src/ui/controls/checks/CloudCrawlPanelControl.check.js` | Markup includes concise status filters, target grid, stats, and screenshot affordance | Passed |
| UI screenshot | `C:\nvm4w\nodejs\node.exe scripts/ui/capture-unified-crawl-display.js --output docs/sessions/2026-05-04-five-site-cloud-crawl-ui/screenshots` | `cloud-crawl.png`, `downloads.png`, `crawl-status.png`, and `analysis.json`; final `ok=true` | Passed |
| Server/app stability | `C:\nvm4w\nodejs\node.exe src/ui/server/unifiedApp/checks/shell.check.js`; `C:\nvm4w\nodejs\node.exe src/ui/server/unifiedApp/checks/unified.server.check.js` | 43/43 shell assertions and unified server smoke passed | Passed |
| Editor diagnostics | VS Code diagnostics for touched UI/crawl files | No errors reported | Passed |

Notes:
- Use Windows-safe PowerShell/Node commands only.
- Prefer `npm run test:by-path` or local check scripts over direct Jest invocations.
- One terminal lost `node` from PATH; explicit `C:\nvm4w\nodejs\node.exe` worked for validation and sync.