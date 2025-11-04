# enhanced_adapter Family

The **enhanced_adapter** family layers queue, planner, and coverage analytics on top of the base `NewsDatabase`. It is optional—crawler runs succeed without it—but when present it enables richer telemetry, clustering, and milestone tracking.

## Supported Databases & Versions
| Database | Versions | Entry Point |
| --- | --- | --- |
| SQLite | v1 | `src/db/EnhancedDatabaseAdapter.js`

## Components
- `QueueDatabase` – Priority-aware queue logging, clustering, and gap prediction tables.
- `PlannerDatabase` – Pattern knowledge store, hub validation cache, knowledge reuse metrics.
- `CoverageDatabase` – Coverage snapshots, hub discoveries, coverage gaps, dashboard metrics.

Each component receives the underlying `better-sqlite3` handle and ensures the associated schema is present. If initialization fails (missing tables, migration mismatch), the adapter throws with a descriptive error so the caller can fall back to the base database.

See the [v1 adapter details](./sqlite/v1.md) for configuration, feature flags, and usage scenarios.
