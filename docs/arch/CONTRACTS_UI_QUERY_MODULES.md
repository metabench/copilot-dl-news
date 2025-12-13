# UI Query Modules Contract (SQLite UI Queries)

## Boundary
UI servers render pages and JSON using query modules under:
- `src/db/sqlite/v1/queries/ui/`

These query modules are the contract between:
- **UI servers** (e.g. `src/ui/server/dataExplorerServer.js`)
- **SQLite schema/views** (tables like `urls`, views like `fetched_urls`)

## Contract

### Inputs
- A `better-sqlite3` database handle (`db`) as the first parameter.
- An `options` object with user-derived fields (must be sanitized):
  - `limit` and `offset` (pagination)
  - optional filters (e.g. `host`, `hosts`, `hostMode`)

### Outputs
- Page selectors return `Array<object>` (never `undefined`).
- Count selectors return `number` (never `NaN`).

### Row shape (example: URL listing)
`src/db/sqlite/v1/queries/ui/urlListingNormalized.js` returns rows with stable keys:
- `id` (number)
- `url` (string)
- `host` (string|null)
- `canonicalUrl` (string|null)
- `createdAt` (string|null)
- `lastSeenAt` (string|null)
- `lastFetchAt` (string|null)
- `httpStatus` (number|null)
- `classification` (string|null)
- `wordCount` (number|null)
- `fetchCount` (number|null)

## Invariants
- **Stable ordering**: paginated queries must use a deterministic `ORDER BY` (typically by `id`).
- **Sanitized pagination**: `limit`/`offset` are clamped to safe ranges (no unbounded reads).
- **No SQL injection via filters**: user inputs must be bound parameters (prepared statements), not interpolated SQL.
- **Backwards-compatible views**: queries that rely on optional views/tables (e.g. `latest_fetch`, `fetched_urls`) must degrade safely.

## Enforcement
- Query shape/limits: `tests/db/sqlite/ui/urlListingNormalized.contract.test.js`
- End-to-end UI usage: `tests/ui/server/dataExplorerServer.test.js`

## Change protocol
If you change a query module’s output keys or pagination semantics:
1. Update the query module.
2. Update this contract doc.
3. Update the contract test(s) so downstream breakage is caught early.
4. Only then update UI renderers that depend on the shape.
