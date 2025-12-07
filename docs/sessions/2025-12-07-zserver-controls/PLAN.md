# Plan – Split z-server control factory

## Objective
Modularize z-server controls into separate files with shared index

## Done When
- [ ] Controls split into dedicated modules with a shared index/factory entrypoint.
- [ ] Call sites updated to import from the new index (no broken require paths).
- [ ] Tests/quick checks noted in `WORKING_NOTES.md`; follow-ups captured if needed.

## Change Set (initial sketch)
- z-server/ui/controls/zServerControlsFactory.js (slim entrypoint or removed)
- z-server/ui/controls/ (new per-control modules + index)
- Any call sites requiring the controls factory

## Risks & Mitigations
- Risk: Missed import paths → Mitigation: grep for `zServerControlsFactory`/`createZServerControls` and update.
- Risk: jsgui context binding drift → Mitigation: keep a single `createControls(jsgui)` entry that binds classes.
- Risk: Large file cut/paste errors → Mitigation: move incrementally, keep diff small, re-run quick smoke if available.

## Tests / Validation
- Prefer a minimal smoke: instantiate controls bundle in a small helper or existing z-server harness (if available). Otherwise, document lack of runtime test and rely on import success/linters.
