# Plan – Past/Present/Future view for what-next

## Objective
Add past-present-future view and feature history surfacing in what-next output

## Done When
- [ ] what-next has a past/present/future view (human + JSON) for the selected session, including quick links to session docs.
- [ ] The tool surfaces nearby historical sessions (same slug stem) and highlights follow-ups/tests for the current session.
- [ ] README documents the new flags/fields; WORKING_NOTES captures validation notes.

## Change Set (initial sketch)
- tools/dev/what-next.js
- tools/dev/README.md
- docs/sessions/2025-12-06-what-next-past-present-future/WORKING_NOTES.md

## Risks & Mitigations
- Fragile matching of related sessions → use slug stem matching with clear fallback when none found.
- JSON/human output drift → gate new fields behind explicit view section; keep existing shape stable and additive.
- Over-scanning large hub → reuse existing hub parse and avoid extra file I/O.

## Tests / Validation
- Manual: `node tools/dev/what-next.js --json --session what-next-past-present-future` shows past/present/future fields populated (with empty past if no prior sessions).
- Manual: run without flags to confirm human view shows the new sections and does not regress exit codes.
