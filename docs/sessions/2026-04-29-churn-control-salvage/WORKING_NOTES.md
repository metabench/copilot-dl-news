# Working Notes: Churn Control Salvage

- 2026-04-29: Session opened for cleanup of churn-type UI files with salvage review for reusable jsgui3 controls.
- 2026-04-29: Inspected deleted control sources from `crawl-widget`, `labs/jsgui3-idiomatic-progress`, `labs/jsgui3-ssr-progress`, and `labs/remote-crawler-lab`. Existing shared `ProgressBar` and `CrawlSpeedometerControl` already cover the lab progress/speedometer primitives.
- 2026-04-29: Promoted reusable patterns into shared controls: `ActionButtonGroupControl`, `OptionPickerControl`, `ActivityLogControl`, and `CrawlProgressPanelControl`. Left app-specific shell pieces (`ToolsPanelControl`, widget title bar API calls, crawler-app Electron harness) as churn.
- 2026-04-29: Added `src/ui/controls/checks/renderCheckHarness.js` plus dedicated render checks for each promoted control.
- 2026-04-29: Removed generated unified server check artifact under `src/ui/server/unifiedApp/checks/artifacts/`; kept broad deleted churn directories (`crawl-widget`, `crawler-app`, `deprecated-ui-root`, old `labs`, old `design`) deleted after salvage review.
