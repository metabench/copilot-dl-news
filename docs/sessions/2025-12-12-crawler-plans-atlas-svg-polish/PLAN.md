# Plan – Crawler Plans Atlas SVG Polish

## Objective
Clear remaining svg-collisions strict findings for crawler-improvement-plans-atlas.svg

## Done When
- [x] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [x] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- docs/diagrams/crawler-improvement-plans-atlas.svg
- docs/sessions/2025-12-12-crawler-plans-atlas-svg-polish/*

## Risks & Mitigations
- Risk: shifting text baselines could tighten spacing and create new overlaps.
- Mitigation: keep movement minimal (+4px), re-run `svg-collisions --strict` after every change.

## Tests / Validation
- `node tools/dev/svg-collisions.js docs/diagrams/crawler-improvement-plans-atlas.svg --strict --json`
