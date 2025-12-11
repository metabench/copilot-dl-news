# Plan – Retire deprecated suites

## Objective
Formally retire tests flagged as deprecated for 2+ weeks; capture quick wins

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- jest configuration to ignore/skip deprecated suites older than 2 weeks (likely `jest.careful.config.js` or related config).
- Documentation artifacts in this session folder (PLAN/WORKING_NOTES/SESSION_SUMMARY/FOLLOW_UPS).
- `failing_tests.md` to reflect retired suites and remaining work.

## Risks & Mitigations
- Risk: Over-broad ignore patterns hide active regressions. Mitigation: Scope ignores narrowly to `src/deprecated-ui/**` (and any other clearly-marked deprecated trees) and document rationale.
- Risk: CI/tasks still reference retired tests. Mitigation: confirm jest configs used by runners; note follow-up if other runners exist.
- Risk: Missed non-deprecated failures. Mitigation: After quick wins, re-scan failing list and plan next stages.

## Tests / Validation
- No code execution expected for retire step; validate by `node tests/test-log-history.js --json --limit-logs 200` to confirm deprecated suites drop from active failing list (optional if time).
- Self-review of config diffs for scope and documentation updates.
