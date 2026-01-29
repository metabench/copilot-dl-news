# Working Notes – Place hub 5-state matrix data flow

- 2026-01-06 — Session created via CLI. Add incremental notes here.
- 2026-01-06 — Added absent-mapping persistence on hub guessing 404s:
  - Propagate `placeId` from analyzers into place selection + candidate storage.
  - Add guarded `upsertAbsentPlacePageMapping` to avoid overriding verified-present mappings.
  - Record verified-absent mappings on HEAD/GET 404 or 410 in `DomainProcessor`.
- Tests:
  - `npm run test:by-path src/tools/__tests__/guess-place-hubs.test.js` → FAILED (better-sqlite3 invalid ELF header in this environment).
