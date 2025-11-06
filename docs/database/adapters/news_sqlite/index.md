# news_sqlite Adapter Family

The **news_sqlite** family wraps the primary SQLite schema that backs the crawler. It provides the canonical `NewsDatabase` implementation together with helper functions that control connection policy, schema bootstrapping, and telemetry wiring.

## Supported Databases & Versions
| Database | Versions | Entry Point |
| --- | --- | --- |
| SQLite | v1 | `src/db/sqlite/v1/index.js`

## Feature Highlights
- Unified `NewsDatabase` class with statement caching via `StatementManager`.
- High-level helpers: `createSQLiteDatabase`, `ensureDatabase`, `wrapWithTelemetry`, `createInstrumentedDb`.
- Schema bootstrap with fingerprint-based fast path (`schemaMetadata.shouldUseFastPath`).
- WAL-mode connection defaults with busy timeout and FK enforcement.
- Gazetteer tooling exposed through `initGazetteerTables` and `dedupePlaceSources`.

## Related Modules
- `src/db/sqlite/v1/SchemaInitializer.js` – full schema creation logic.
- `src/db/sqlite/v1/ArticleOperations.js` – article upsert, fetch insert, and alias utilities.
- `src/db/sqlite/v1/queries/*` – reusable query builders for UI/API endpoints.

### Recent Changes (2025-11-05)
- Removed the circular dependency between `ArticleOperations.js` and the v1 module index by dropping the unused `ensureDatabase` import. The legacy crawl CLI (`node src/crawl.js --help`) now runs without Node's circular dependency warning.

See [v1 details](./sqlite/v1.md) for configuration, transaction patterns, and usage examples.
