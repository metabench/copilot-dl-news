---
status: canonical
source: AGENTS.md
last_migrated: 2025-11-04
owner: data-platform
---

# Adapters Overview

- `src/db/sqlite/ensureDb.js` – primary SQLite adapter ensuring WAL-mode connections.
- `src/db/EnhancedDatabaseAdapter.js` – optional analytics adapter, see [enhanced_database_adapter.md](enhanced_database_adapter.md).
- Refer to `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` for migration tooling and adapter expectations.
