# Plan – Decision Tree access in crawl-widget + SQL encapsulation

## Objective
Inventory remaining SQL leakage and propose next safe encapsulation/enforcement steps after integrating Decision Tree access into crawl-widget.

## Done When
- [ ] `WORKING_NOTES.md` contains an inventory of “SQL outside db adapters” with prioritized buckets (UI vs tools/tests).
- [ ] A clear recommendation is recorded for what “SQL belongs in db adapter layer” means in this repo (strict vs pragmatic) and what exceptions are acceptable.
- [ ] Follow-ups are recorded for (a) adding an automated guard, and (b) at least 1 concrete module to migrate next.
- [ ] `SESSION_SUMMARY.md` captures the chosen path + rationale.

## Change Set (initial sketch)
- Docs only (this session folder):
	- `docs/sessions/2025-12-21-decision-tree-widget-encapsulation/WORKING_NOTES.md`
	- `docs/sessions/2025-12-21-decision-tree-widget-encapsulation/FOLLOW_UPS.md`
	- `docs/sessions/2025-12-21-decision-tree-widget-encapsulation/SESSION_SUMMARY.md`

If we implement enforcement (future session):
- Add a check script (likely under `tools/` or `checks/`) to prevent new SQL usage in UI/Electron layers.

## Risks & Mitigations
- Risk: “SQL only in db adapters” is not currently true across the repo; enforcing it strictly will be high-churn.
	- Mitigation: start with a narrow guard (UI/Electron only), then migrate incrementally.
- Risk: Some modules in `src/utils/` are effectively repositories that just live in the wrong folder.
	- Mitigation: treat them as transitional; either move them under `src/db/` or wrap behind adapters.

## Tests / Validation
- Evidence for this session: grep/md-scan outputs recorded in `WORKING_NOTES.md`.
