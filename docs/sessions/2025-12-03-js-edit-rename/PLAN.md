# Plan – Enable js-edit file rename support

## Objective
Allow js-edit to rename files and continue editing pipelines

## Done When
- [ ] js-edit accepts rename operations (JSON + CLI flags) and applies them before/after edits without crashing.
- [ ] Tests cover rename flows (unit + ai-native smoke if applicable) with docs referencing the feature.
- [ ] Session docs updated (WORKING_NOTES, SUMMARY, FOLLOW_UPS) with results + next steps.

## Change Set (initial sketch)
- `tools/dev/js-edit.js` (CLI parsing, dispatcher, guard handling)
- `tools/dev/js-edit/operations/*` (new rename operation module?)
- `tools/dev/README.md` or `/docs/agi/tools/JS_EDIT_DEEP_DIVE.md` (usage notes)
- Tests: `tests/tools/ai-native-cli.smoke.test.js`, any js-edit-specific suites
- Session docs under `docs/sessions/2025-12-03-js-edit-rename/`

## Risks & Mitigations
- **Guard integrity**: Renaming may break guard hashes. _Mitigation_: ensure guards capture original + new path, run digest checks pre/post rename.
- **Cross-platform paths**: Windows vs POSIX separators. _Mitigation_: rely on Node `path` helpers and add tests.
- **Pipeline order confusion**: Rename might need to happen before edits referencing new path. _Mitigation_: design explicit sequence (renames first?) and document.

## Tests / Validation
- Extend js-edit unit tests (if present) to cover rename plan.
- Update/run `npm run test:by-path tests/tools/ai-native-cli.smoke.test.js`.
- Manual dry-run with `--dry-run` rename payload to confirm output.
