# Working Notes – z-server Main-Area Progress Bars

- 2025-12-14 — Session created via CLI. Add incremental notes here.

- 2025-12-14 01:53 — ## Session Update: DB Access Simplification

### Completed
- Implemented `getDb()` in `src/db/index.js` (Singleton + Auto-discovery).
- Refactored `WikidataCountryIngestor` to use soft dependency injection.
- Refactored `GazetteerPriorityScheduler` to use soft dependency injection.
- Verified both with new check scripts in `src/db/checks/`.
- Added "Soft Dependency Injection for DB Access" pattern to memory.
- Added "Hidden Wrapper Incompatibility" anti-pattern to memory.

### Findings
- The "Soft Dependency Injection" pattern works well: it allows zero-config instantiation for the majority of cases while preserving testability via constructor injection.
- The `NewsDatabaseFacade` wrapper requires unwrapping (`.getHandle()`) for legacy components that expect a raw `better-sqlite3` instance. This logic is now embedded in the consumers.

### Next Steps
- Continue refactoring other consumers identified by `js-scan` (e.g., `HierarchicalPlanner`, `MultiGoalOptimizer`).
- Consider standardizing the "unwrap" logic into a utility if it spreads to too many files.