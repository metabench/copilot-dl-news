# Plan – Crawl Widget Telemetry UI Neatness

## Objective
Polish crawl-widget LIVE TELEMETRY feed/panels for fetch/cache activity events

## Done When
- [x] Fetch/cache activity is visible at a glance (counts + last lines).
- [x] Telemetry feed lines align cleanly and are readable.
- [x] Tests/validations are captured in `WORKING_NOTES.md`.
- [x] Key deliverables are summarized in `SESSION_SUMMARY.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- crawl-widget/ui/telemetry/telemetryPanels.js
- crawl-widget/ui/telemetry/telemetryRenderers.js
- crawl-widget/styles.css

## Risks & Mitigations
- _Note potential risks and how to mitigate them._

## Tests / Validation
- `node --check crawl-widget/ui/telemetry/telemetryRenderers.js`
- `node --check crawl-widget/ui/telemetry/telemetryPanels.js`
- `node checks/crawl-telemetry-stdout-format.check.js`
- `npm run sql:check-ui`
