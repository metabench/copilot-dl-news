# Follow-Ups: Five-Site Cloud Crawl UI

1. Add an operator control for the compact panel's date scope.
   - Acceptance: users can switch between `today`, `last hour`, and `all time` without changing routes.
   - Validation: rerun `CloudCrawlPanelControl.check.js` and screenshot capture; confirm `analysis.json` still reports `ok=true`.

2. Surface remote orchestrator state in the panel.
   - Acceptance: panel shows remote `currentlyRunning`, `maxConcurrent`, and per-domain remote fetched/done counts when the remote endpoint is reachable.
   - Validation: run `node tools/crawl/crawl-remote.js status --json`, then verify `/api/cloud-crawl/status` includes remote status without blocking local DB evidence.

3. Add a one-click screenshot action once UI action wiring is available.
   - Acceptance: the panel exposes a command/action marker that can trigger or copy the screenshot capture command for `?app=cloud-crawl`.
   - Validation: run `scripts/ui/capture-unified-crawl-display.js` and confirm the route-specific PNG and analysis are updated.

4. Add a compact mobile viewport screenshot check.
   - Acceptance: screenshot tool captures `cloud-crawl` at desktop and mobile widths and reports overflow separately per viewport.
   - Validation: rerun screenshot script and confirm both viewport entries are nonblank and overflow-free.

5. Investigate the missing `remote-crawl-admin` unified mount.
   - Acceptance: either restore the router or remove the dangling optional reference with documentation.
   - Validation: unified server smoke still passes, and crawl operator paths remain reachable.