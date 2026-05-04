# Session Summary: Churn Control Salvage

Status: Complete

## Summary
Identified deleted churn-type UI sources, inspected the control definitions before letting the churn stay removed, and promoted the reusable patterns into the shared jsgui3 controls library.

## Outcome
Complete. The disposable app/lab shells remain removed, while four reusable controls now live under `src/ui/controls/` with focused render checks and shared-control catalog documentation.

## Churn Kept Removed
- `crawl-widget/`: old Electron/widget shell, renderer bundle, widget-specific API wiring, and CSS.
- `crawler-app/`: older standalone crawler Electron app harness.
- `deprecated-ui-root/`: retired gazetteer UI root.
- Old `labs/` experiments and generated benchmark/results artifacts.
- Old `design/` SVG scratch assets from before the repo slim-down.
- Generated `src/ui/server/unifiedApp/checks/artifacts/unified.server.check.result.json`.

## Controls Promoted
- `ActionButtonGroupControl`: generic configurable command button group replacing widget-specific crawl buttons.
- `OptionPickerControl`: generic picker replacing one-off crawl type/start URL selectors.
- `ActivityLogControl`: generic typed activity/log list replacing the widget-specific crawl log viewer pattern.
- `CrawlProgressPanelControl`: reusable crawl progress panel built on the existing shared `ProgressBar` primitive.

## Existing Shared Coverage Confirmed
- `ProgressBar` already covers the deleted progress bar lab/widget primitives.
- `CrawlSpeedometerControl` already covers the deleted remote crawler speedometer lab primitive.

## Verification
- `node src/ui/controls/checks/ActionButtonGroupControl.check.js`
- `node src/ui/controls/checks/OptionPickerControl.check.js`
- `node src/ui/controls/checks/ActivityLogControl.check.js`
- `node src/ui/controls/checks/CrawlProgressPanelControl.check.js`
- `node src/ui/controls/checks/ProgressBar.check.js`
- `node src/ui/controls/checks/CrawlSpeedometerControl.check.js`
- Shared export/manifest Node smoke check passed.
- Editor diagnostics reported no errors for the promoted controls, checks, exports, and docs.
