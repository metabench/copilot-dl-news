# Plan – Lab Coverage Risk Review

## Objective
Identify app patterns that lack lab/check coverage and may be error-prone

## Done When
- [ ] We have a prioritized list of “misunderstanding-prone” patterns + where they live.
- [ ] For each top item, we identify existing proofs (tests/checks/labs) or confirm the gap.
- [ ] For each confirmed gap, we propose the smallest “proof harness” (check/test/lab) to add.
- [ ] Results captured in `SESSION_SUMMARY.md` and `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- Docs only (this session):
	- `docs/sessions/2026-01-01-lab-coverage-risk-review/*`

## Risks & Mitigations
- Risk: confusing “labs/” coverage with “src/ui/lab/” coverage.
	- Mitigation: inventory both, and treat “lab check” scripts as first-class proof.
- Risk: missing co-located checks/tests looks like no coverage.
	- Mitigation: search `tests/**` and root `checks/**` for each module name.

## Tests / Validation
- Evidence sources:
	- Existing Jest tests under `tests/**` (e.g., API routers, UI servers).
	- Root `checks/*.check.js` scripts (UI smoke checks).
	- `src/ui/lab/experiments/*/check.js` lab checks.
