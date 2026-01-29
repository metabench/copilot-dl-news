# Plan – Place hub guessing matrix + distributed downloader

## Objective
Assess matrix control and wire distributed downloader usage

## Done When
- [x] Place hub guessing matrix uses the distributed downloading system for data fetches.
- [x] UI/controls still render correctly and wiring is documented in `SESSION_SUMMARY.md`.
- [ ] Tests/validation (if any) are captured in `WORKING_NOTES.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `src/ui/server/placeHubGuessing/controls/PlaceHubGuessingMatrixControl.js`
- `src/orchestration/DistributedBatchProcessor.js`
- Related downloader/orchestration modules as needed.

## Risks & Mitigations
- Risk: UI control assumes local fetch path; mitigate by isolating downloader calls behind a small adapter.
- Risk: distributed batch processor API mismatch; mitigate by reading current orchestration entrypoints and matching usage.

## Tests / Validation
- Run the smallest relevant check or UI sanity script if available; otherwise document manual verification steps.
