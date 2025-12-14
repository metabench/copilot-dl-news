# Plan – Simplify DB Access Patterns

## Objective
Simplify database access code by implementing a singleton accessor (`getDb()`) that auto-discovers the database, reducing boilerplate in consumers while maintaining injection/testability principles.

## Done When
- [x] `src/db/index.js` exports `getDb()` with auto-discovery logic.
- [x] `WikidataCountryIngestor` is refactored to use `getDb()` as a fallback.
- [x] `GazetteerPriorityScheduler` is refactored to use `getDb()` as a fallback.
- [x] Verification scripts (`src/db/checks/*.check.js`) confirm the new pattern works.
- [x] Reusable patterns are documented in memory.

## Change Set
- `src/db/index.js`
- `src/crawler/gazetteer/ingestors/WikidataCountryIngestor.js`
- `src/crawler/gazetteer/GazetteerPriorityScheduler.js`
- `src/db/checks/` (new check scripts)

## Risks & Mitigations
- **Risk**: Legacy code expects raw `better-sqlite3` handle, but `getDb()` returns `NewsDatabaseFacade`.
- **Mitigation**: Consumers unwrap the facade (`db.getHandle()`) if needed.
- **Risk**: Global state makes testing harder.
- **Mitigation**: Constructor injection is preserved; `getDb()` is only used if no DB is passed.

## Tests / Validation
- `src/db/checks/access-patterns.check.js`: Verifies `getDb()` singleton behavior.
- `src/db/checks/ingestor-instantiation.check.js`: Verifies ingestor instantiation.
- `src/db/checks/scheduler-instantiation.check.js`: Verifies scheduler instantiation.
