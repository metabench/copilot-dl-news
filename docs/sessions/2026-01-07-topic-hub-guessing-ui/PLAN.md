# Plan – Topic hub guessing UI parity

## Objective
Align topic hub guessing UI with place hub guessing and share reusable chrome

## Done When
- [x] Topic hub guessing UI uses the shared matrix chrome/actions with place hub guessing.
- [x] Topic hub guessing routes can run distributed guessing (same as place hub guessing).
- [ ] Tests/validation (if any) are captured in `WORKING_NOTES.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `src/ui/server/topicHubGuessing/*`
- `src/ui/server/hubGuessing/controls/HubGuessingMatrixChromeControl.js` (shared chrome)
- `src/ui/server/placeHubGuessing/controls/PlaceHubGuessingMatrixControl.js` (DRY refactors)
- `src/ui/server/topicHubGuessing/server.js`

## Risks & Mitigations
- Risk: chrome control assumes place-specific fields; mitigate by making fields/presets configurable.
- Risk: topic server has different data model; keep adapter layer in topic control.

## Tests / Validation
- Run topic hub guessing checks if present; otherwise document manual verification.
