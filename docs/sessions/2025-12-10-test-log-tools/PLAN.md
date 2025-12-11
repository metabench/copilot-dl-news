# Plan – Test log scanning CLI

## Objective
Summarize test failures/passes from logs

## Done When
- [ ] Discover existing test-log tooling and document gaps.
- [ ] Add or enhance a CLI that scans stored test logs to report failing/passing tests and their status changes.
- [ ] Provide usage examples and update docs/session notes with validation evidence.
- [ ] Capture follow-ups in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `tools/dev/` for new or improved CLI.
- `docs/sessions/2025-12-10-test-log-tools/` for notes and summary.
- Possibly `docs/INDEX.md` or AGENTS pointer if a new tool is added.

## Risks & Mitigations
- Parsing variability across different test runners/log formats → keep parser pluggable/minimal assumptions.
- Large log files → stream or limit by size; offer path filtering.
- Time constraints → start with minimal useful summary (failures + later passes) before enhancements.

## Tests / Validation
- Unit-style checks or fixture-based runs against sample logs.
- Manual run over current workspace logs (e.g., `testresults.txt`, `testlogs/`) showing extracted failure→pass transitions.
