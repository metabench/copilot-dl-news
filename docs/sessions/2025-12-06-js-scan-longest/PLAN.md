# Plan – js-scan longest files

## Objective
Add capability to list longest JS files via js-scan

## Done When
- [ ] `js-scan` can emit the longest JS/TS files (path + byte/line stats) via a flag.
- [ ] Behavior is documented in session notes and help output if needed.
- [ ] Focused validation evidence is captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- tools/dev/js-scan.js
- tools/dev/lib/ (helpers if needed)
- docs/sessions/2025-12-06-js-scan-longest/WORKING_NOTES.md

## Risks & Mitigations
- Large directory walks could be slow → reuse existing file filters and limits; allow configurable limit.
- Output clutter → provide terse/default view consistent with other js-scan tables.

## Tests / Validation
- Dry-run the new flag against `src` with a small limit.
- If feasible, add/update a unit test fixture; otherwise capture CLI output in `WORKING_NOTES.md`.
