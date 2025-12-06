# Plan – Layout masks DB schema

## Objective
Add layout_masks migration + schema definition for template masking

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- src/db/migrations/013-layout-masks.sql
- src/db/sqlite/v1/schema-definitions.js
- docs/sessions/2025-12-06-structural-diffing-phase2 (notes/summary)

## Risks & Mitigations
- Schema drift vs generated definitions: run schema:sync/check after migration.
- Index/constraint choices may affect perf: keep minimal (PK + foreign key on layout_signature) and revisit later.
- Data type mis-match (JSON) vs SQLite: store mask as TEXT JSON; keep counts as INTEGER.

## Tests / Validation
- Create migration file and update schema-definitions.js to include layout_masks table.
- Run schema check or inspect schema-definitions.js for new table entry.
