# Plan – Phase 5: Layout Intelligence & Quality Feedback

## Objective
Implement Items 1-2 from Phase 5: Structure Miner and Signature Storage

## Done When
- [x] Item 2: Signature Storage — Tables exist, adapter created, 14 tests passing
- [x] Item 1: Structure Miner — Class created, 23 tests passing, CLI verified
- [x] Tests and validations captured in `WORKING_NOTES.md`
- [ ] Follow-ups recorded in `FOLLOW_UPS.md`

## Change Set
- `src/db/sqlite/v1/queries/layoutSignatures.js` — NEW (query module)
- `src/db/sqlite/v1/queries/layoutAdapter.js` — NEW (unified adapter)
- `src/crawler/planner/StructureMiner.js` — NEW (service class)
- `tests/db/layoutAdapter.test.js` — NEW (14 tests)
- `tests/crawler/StructureMiner.test.js` — NEW (23 tests)

## Design Notes
- **Schema deviation**: Task spec proposed URL-based signatures. Existing schema uses hash-based
  signatures (`signature_hash` as PK). Kept existing design for consistency.
- **Existing CLI**: `tools/structure-miner.js` already existed with inline logic. Created
  reusable `StructureMiner` class that could replace inline logic in future.
- **Integration path**: StructureMiner uses layoutAdapter, which uses existing query modules.

## Tests / Validation
```bash
npm run test:by-path tests/db/layoutAdapter.test.js
# 14 passed

npm run test:by-path tests/crawler/StructureMiner.test.js  
# 23 passed

npm run schema:check
# ✅ Schema definitions are in sync

node tools/structure-miner.js --limit 5 --json
# 533 L1, 521 L2 signatures in database
```

## Risks & Mitigations
- **FK constraints**: Templates require signatures to exist first. Tests handle this.
- **SkeletonHash differences**: CLI uses `src/analysis/structure/SkeletonHash.js`, 
  task spec references `src/teacher/SkeletonHasher.js`. Both exist; StructureMiner
  uses the analysis version (same as CLI).
