# Plan – Fix CrawlTelemetryBridge progress normalization

## Objective
Repair CrawlTelemetryBridge structure and validate progress normalization + finished mappings with tests

## Done When
- [x] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [x] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- src/crawler/telemetry/CrawlTelemetryBridge.js
- tests/crawler/telemetry/telemetry.test.js

## Risks & Mitigations
- Risk: progress payloads vary by crawler implementation (base crawler vs orchestrator).
	- Mitigation: normalize progress input in the bridge before `createProgressEvent()`.
- Risk: terminal lifecycle events missing from some emitters.
	- Mitigation: map consolidated `finished` events to `crawl:completed` / `crawl:failed` / `crawl:stopped`.

## Tests / Validation
- Run: tests/crawler/telemetry/telemetry.test.js
- Validate: progress normalization for base crawler + orchestrator payload shapes
- Validate: `finished` event mapping to completed/failed
