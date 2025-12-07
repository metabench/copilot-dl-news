# Plan – Post-push code structure review

## Objective
Identify structural improvements after recent additions

## Done When
- [ ] High-level structural risks in the new push are identified and prioritised.
- [ ] At least one concrete improvement (code or docs) is delivered or explicitly deferred with rationale.
- [ ] Tests/validations (if any) are noted in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `src/ui/server/shared/isomorphic/controls/ui/ContextMenuControl.js` (possible structure note; avoid large churn)
- `src/ui/server/dataExplorer/views/*` (layout/state structure review)
- Session docs under `docs/sessions/2025-12-06-structure-review/`

> Limit scope to review + lightweight tweaks; avoid touching the large generated-looking files unless a small, safe fix emerges.

## Risks & Mitigations
- Large new files (3k–10k LOC) make direct refactors risky → prefer notes + scoped follow-ups.
- Unknown test surface for new pipelines → avoid behavioural changes without quick validation hook.
- Time/complexity creep → keep edits minimal and documented.

## Tests / Validation
- None planned unless a small code tweak is made; if so, run the closest scoped test (`npm run test:by-path <file>`).
