# DB Access Contract

## Boundary
All non-DB modules access SQLite through the shared DB access helpers.

- **DB helpers live in**: `src/db/dbAccess.js`
- **Deep reference**: `docs/DATABASE_ACCESS_PATTERNS.md`

## Contract

### Rule 1 — No direct DB driver usage outside `src/db/`
- Code outside `src/db/` must not instantiate the underlying DB driver directly.
- Prefer adapters/repositories + `dbAccess` helpers.

### Rule 2 — Use the correct helper for the context
Use the patterns documented in `docs/DATABASE_ACCESS_PATTERNS.md`:
- CLI scripts / tools: `withNewsDb()` (auto-close)
- Long-lived processes (services/background tasks): `openNewsDb()` + explicit close
- Express routes: `createDbMiddleware()` + `getDbOrError()` patterns

### Rule 3 — Cleanup is part of the contract
If you open a DB connection, you must close it deterministically (typically `finally`).

### Rule 4 — Errors are typed and actionable
When a DB is unavailable (missing path, locked, etc), the caller should get a clear error message and (where relevant) an HTTP 503.

## Invariants
- A one-off CLI/tool execution must not leave a DB handle open.
- Express handlers never access DB via hidden globals.
- DB helpers provide a single, consistent place to evolve DB lifecycle behavior.

## Enforcement
- UI server wiring + DB lifecycle: `tests/ui/server/dataExplorerServer.test.js`
  - mocks `openNewsDb()` and asserts server shutdown closes the handle
  - asserts route behavior (including 404s) with an in-memory sqlite DB
- Failure-mode mapping (DB unavailable): prefer a route/controller test that asserts HTTP 503 for DB-unavailable surfaces.

## Change protocol
If you need a new DB access pattern:
1. Add it to `src/db/dbAccess.js`
2. Document it in `docs/DATABASE_ACCESS_PATTERNS.md`
3. Add a focused test proving the lifecycle behavior
4. Migrate call sites incrementally
