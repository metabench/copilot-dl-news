# Plan – z-server: file scan progress with counted calibration

## Objective
Count files first, then emit progress updates to UI with calibrated progress bar

## Done When
- [x] z-server scan shows calibrated progress based on a count-first phase.
- [x] Progress forwarding is standardized and robust to JSONL edge cases.
- [x] Focused unit tests cover stream parsing + protocol normalization.
- [x] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.

## Change Set (initial sketch)
- z-server/main.js
- z-server/preload.js
- z-server/lib/jsonlStreamParser.js
- z-server/lib/scanProgressProtocol.js
- z-server/tests/unit/jsonlStreamParser.test.js
- z-server/tests/unit/scanProgressProtocol.test.js

## Risks & Mitigations
- Child stdout chunking / CRLF / noise can break naive parsing → buffered JSONL parser + non-JSON ignore.
- Out-of-order or malformed progress messages → protocol normalizer clamps and rejects invalid payloads.

## Tests / Validation
- `npm run test:by-path z-server/tests/unit/jsonlStreamParser.test.js`
- `npm run test:by-path z-server/tests/unit/scanProgressProtocol.test.js`
- `npm run test:by-path z-server/tests/unit/zServerAppControl.scanProgress.test.js`
