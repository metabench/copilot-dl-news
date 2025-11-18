# Working Notes

## 2025-11-20
- Session bootstrapped; CLI defaulting to `--json --ai-mode` outputs for `js-scan`/`js-edit`.
- Need to map `config/crawl-runner.json` sections to workspace tabs plus compute override diffs.
- Ran `js-scan --what-imports` for ConfigMatrix and CrawlBehavior panels to confirm only the check script, tests, and index import them (low risk radius).
- Verified `config/crawl-runner.json` is the primary input plus `config/crawl-sequences/README.md` + schema for step metadata; no concrete sequence files exist yet, so workspace must tolerate zero-step state or synthesize demo data.
- Added `config/crawl-sequences/basicArticleDiscovery.json` to provide concrete step metadata for the workspace timeline and diff visualizations.
- Implemented `CrawlConfigWorkspaceControl` (tabs, drawer, timeline, diff mini-map), hooked it into the controls index, and created a dedicated check script + Jest test.
- Ran `npm run test:by-path -- tests/ui/controls/crawlConfigWorkspaceControl.test.js` to verify the new control renders all four feature areas.
- Remaining requirements plan/order:
	1. Enhance property grid for sticky headers + client-side filter textbox per section.
	2. Support pinning multiple crawl profile drawers (side-by-side), keeping CrawlBehaviorPanel inside each card.
	3. Wire timeline/behavior click interactions to scroll + highlight target property rows.
	4. Upgrade diff mini-map to compare runner vs default configs and trigger hover/click focus on matching rows.
	5. Embed the workspace into the UI HTML app (likely under `src/ui/server` render path / static page) with data hydration.
