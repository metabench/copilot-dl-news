# Working Notes – Standardized Nested Progress Bars

## Goal
Create a reusable, standardized pattern for progress bars and nested progress bars (progress trees) that can be driven from telemetry.

## What I built
- A pure HTML renderer for standardized progress bars + nested progress tree output.
- A new telemetry schema event type for progress-tree updates/completion.
- A premium panel in the crawl-widget tools UI that renders nested progress when those events appear.

## Files
- crawl-widget/ui/telemetry/progressBars.js (new)
- crawl-widget/checks/progressTreeLab.check.js (new)
- crawl-widget/checks/progressTreeTelemetryPanel.check.js (new)
- crawl-widget/styles.css (adds .cw-pbar / .cw-ptree styles)
- crawl-widget/ui/telemetry/telemetryPanels.js (adds “Nested Progress” premium panel)
- src/crawler/telemetry/CrawlTelemetrySchema.js (adds progress-tree event types + factory)

## Notes
- The nested progress UI supports both determinate (current/total) and indeterminate (unknown total) bars.
- Active-path highlighting is supported via `activePath` (adds `cw-ptree__node--active` and `cw-pbar--active`).
- Large child lists are truncated via `maxChildrenPerNode`, with an “... (N more)” placeholder node.
- Telemetry standard shape (minimal):
	- { root: { label, current?, total?, unit?, status?, children?[] }, activePath?: string[] }

## Validation (executed)
- node crawl-widget/checks/progressTreeLab.check.js
- node crawl-widget/checks/progressTreeTelemetryPanel.check.js
- node crawl-widget/checks/crawlWidget.check.js
- node crawl-widget/checks/telemetrySse.check.js
