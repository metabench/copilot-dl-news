# Plan – Data consolidation + archival tooling

## Objective
Consolidate/prune low-value generated data and ensure archived artifacts remain accessible via CLI tools

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

- [ ] Size inventory exists for the main artifact dirs (`tmp`, `tmp-debug`, `testlogs`, `screenshots`, `analysis-charts`, optionally `data`).
- [ ] A safe archival workflow exists (dry-run default) with CLI support to list/search/extract archived artifacts.
- [ ] Prune vs archive recommendations are written down (what to keep locally hot vs cold storage).

## Change Set (initial sketch)
- `tools/dev/dir-sizes.js` (new)
- `tools/dev/artifact-archive.js` (new)
- `tools/dev/README.md` (document new CLIs)
- Session notes: `WORKING_NOTES.md`, `SESSION_SUMMARY.md`, `FOLLOW_UPS.md`

## Risks & Mitigations
- Risk: archiving moves/deletes evidence that a user still needs → Mitigation: dry-run default; require `--fix` for changes; extract defaults to a safe directory.
- Risk: ZIP extraction/search is expensive → Mitigation: bucket archives by month/day; search limit; keep manifests so listing is fast.

## Tests / Validation
- Run `node tools/dev/dir-sizes.js --json` and capture output in session notes.
- Run `node tools/dev/artifact-archive.js --target testlogs --archive --older-than 28` (dry-run) and capture plan.
- Optionally run `node tools/dev/tmp-prune.js --root tmp --keep 10 --json` (dry-run) to quantify cleanup without deleting.
