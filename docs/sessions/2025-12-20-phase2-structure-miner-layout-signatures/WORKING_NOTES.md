# Working Notes – Phase 2: Structure Miner + Layout Signature Storage

- 2025-12-20 — Session created via CLI. Add incremental notes here.

## Key discoveries (reality check)

- `layout_signatures` already exists in `data/news.db` and in the canonical schema definitions (`src/db/sqlite/v1/schema-definitions.js`).
- `layout_templates` does not appear to exist in the DB/schema.
- A miner already exists: `tools/structure-miner.js`.
	- It upserts into `layout_signatures`.
	- It also creates/writes `layout_masks` ad-hoc (not present in DB/schema).
- A query helper exists for masks: `src/db/sqlite/v1/queries/layoutMasks.js`.
	- But `layout_masks` is not present in the current DB.

## Useful commands (execution phase)

- Inspect schema tables:
	- `node tools/db-schema.js table layout_signatures`
	- `node tools/db-schema.js table layout_templates`
	- `node tools/db-schema.js table layout_masks`

- Schema workflow:
	- `npm run schema:sync`
	- `npm run schema:check`

- Targeted tests (when added):
	- `npm run test:by-path tests/db/sqlite/layoutSignatures.test.js`
	- `npm run test:by-path tests/tools/structure-miner.test.js`

## Executed (this session)

- Quest map:
	- Added: `docs/sessions/2025-12-20-phase2-structure-miner-layout-signatures/quest-map.svg`
	- Tweaks: Forest Bridge rotated to a clearer diagonal crossing; north/south approach roads re-snapped to the rotated endpoints; bridge sign counter-rotated to keep label level.
	- Validated: `node tools/dev/svg-collisions.js docs/sessions/2025-12-20-phase2-structure-miner-layout-signatures/quest-map.svg --strict` (clean)

- Migration applied to dev DB:
	- `node tools/migrations/add-layout-templates-and-masks.js`

- Canonical schema regenerated + checked:
	- `npm run schema:sync`
	- `npm run schema:check`

- Tests:
	- `npm run test:by-path src/db/sqlite/v1/__tests__/layout-tables.test.js`
