# Plan – jsgui3 platform helpers via lab

## Objective
Experiment with jsgui3 platform helpers and document patterns

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- src/ui/lab/experiments/002-platform-helpers/ (new experiment)
- docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md (platform helper/activation addendum)
- docs/guides/JSGUI3_EFFECTIVE_PATTERNS_QUICK_REFERENCE.md (fast patterns update)
- docs/sessions/2025-12-11-jsgui3-gaps/WORKING_NOTES.md, SESSION_SUMMARY.md


- Overfitting to internal APIs not stable → keep changes scoped to documentation and lab, note version observed.
- Time drift vs actual behavior → verify via experiment check.js exercising helpers.

- _Note potential risks and how to mitigate them._
- Run lab experiment check script to confirm helper usage works (node src/ui/lab/experiments/002-platform-helpers/check.js).
- Manual sanity: render/activate experimental control to confirm style proxy, compositional model, and control registration behave as documented.
## Tests / Validation
- _Describe tests to run or evidence required before completion._
