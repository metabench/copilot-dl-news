# Validation Matrix: Playwright Control Centre Visual QA

| Check | Command / method | Result | Evidence |
|---|---|---|---|
| Unified app startup | `node src/ui/server/unifiedApp/server.js --check --port 3097` | Pass | Startup check returned 200; optional missing `design` and `remote-crawl-admin` routers remain pre-existing warnings. |
| Initial visual pass | Browser automation against `http://localhost:3097` | Found mobile sidebar/content squeeze and Home `${activityRows}` leak | `screenshots/playwright-fallback/` |
| Shell render check | `node src/ui/server/unifiedApp/checks/shell.check.js` | Pass, 48/48 | Mobile icon rail CSS and home overview grid assertions included. |
| Unified server check | `node src/ui/server/unifiedApp/checks/unified.server.check.js` | Pass | Server check passed on a random port. |
| 5x5 crawl limit | `node tools/crawl/crawl-remote.js bounded --domains bbc.com,theguardian.com,cbsnews.com,nbcnews.com,france24.com --max-pages 5 --max-concurrent 5 --poll 3 --timeout-min 10` | Bounded run started; wrapper timed out after observing 19/25, later UI status showed 25/25 | `screenshots/standard-after-5x5/analysis.json` |
| Standard screenshot capture | `C:\nvm4w\nodejs\node.exe scripts/ui/capture-unified-crawl-display.js --base-url http://localhost:3097 --output docs/sessions/2026-05-04-playwright-control-centre-visual-qa/screenshots/standard-after-5x5 --save-screenshots --save-dom-snapshots` | Pass, `ok=true` | 8 PNGs, 8 DOM snapshots, `analysis.json` |
| Direct image review | `view_image` on mobile and desktop screenshots | Pass | Confirmed mobile content is no longer crushed and Cloud Crawl reports `25 / 25`. |
| Crawl Status mobile fix | `node src/ui/server/crawlStatus/checks/crawlStatusPage.remoteObservable.check.js` plus targeted Puppeteer recapture | Pass | `screenshots/crawl-status-mobile-fix/`; report shows desktop/mobile outer overflow false, table scroll guarded inside iframe. |

## Notes

- Playwright MCP tool names were discoverable, but this chat runtime did not expose callable `playwright/browser_*` namespaces directly. The inspection used the same browser automation path through repo-local Puppeteer and direct `view_image` review.
- No crawl larger than five sites by five pages was started in this session.
- The Crawl Status table remains horizontally scrollable on mobile by design because it is a dense operational table.
