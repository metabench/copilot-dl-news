# Plan: nested-progress-bars

Objective: Standardize nested progress reporting (telemetry shape + UI) so hierarchical work (e.g. countries → cities) renders as consistent nested progress bars in the crawl-widget.

Done when:
- A canonical telemetry event type exists for nested progress trees.
- The crawl-widget has a premium panel that renders nested progress bars by default.
- A small lab check demonstrates and validates nested progress rendering patterns.
- Existing crawl-widget checks still pass.

Change set:
- src/crawler/telemetry/CrawlTelemetrySchema.js
- crawl-widget/ui/telemetry/progressBars.js (new)
- crawl-widget/ui/telemetry/telemetryPanels.js
- crawl-widget/styles.css
- crawl-widget/checks/progressTreeLab.check.js (new)
- crawl-widget/checks/progressTreeTelemetryPanel.check.js (new)

Risks/assumptions:
- Telemetry producers may not emit progress-tree events immediately; UI must remain useful without them.
- Nested progress can be indeterminate at some levels (unknown totals); UI must support that cleanly.

Validation:
- node crawl-widget/checks/progressTreeLab.check.js
- node crawl-widget/checks/progressTreeTelemetryPanel.check.js
- node crawl-widget/checks/crawlWidget.check.js
- node crawl-widget/checks/telemetrySse.check.js
