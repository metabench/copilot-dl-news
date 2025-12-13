# Contracts Overview

This doc defines the repo’s contract vocabulary and the minimum “definition of done” for boundary work.

## Contract types

### 1) Data contracts (DTOs, rows, API payloads)
Promises about data shape and meaning.
- Required vs optional keys
- Stable field names
- Pagination semantics (cursor/offset invariants)

See also:
- `docs/arch/CONTRACTS_UI_QUERY_MODULES.md`

### 2) Behavioral contracts (semantics)
Promises about how functions behave.
- Ordering guarantees (stable sort)
- Idempotency (retries don’t duplicate writes)
- Monotonicity (counters don’t go backwards)

### 3) Lifecycle contracts (resources)
Promises about process cleanup.
- DB handles are closed
- timers/intervals are cleared
- servers use `--check` in validation contexts

See also:
- `docs/arch/CONTRACTS_SERVER_LIFECYCLE_CHECK_MODE.md`

### 4) Evolution contracts (versioning)
Promises about how breaking changes happen.
- compatibility shims
- deprecation windows
- tests proving both old + new path during migration

## Contract documentation template
When adding a new contract doc, keep it tight:

1. **Boundary**: what talks to what?
2. **Inputs**: required/optional fields, types, defaults
3. **Outputs**: shape and error forms
4. **Invariants**: 3–7 bullet points (must always hold)
5. **Enforcement**: which test/check proves it?
6. **Change protocol**: how to evolve without breakage

## Evidence / enforcement rule
A contract doc without enforcement is just a suggestion.

Preferred enforcement order:
1. A focused Jest test near the boundary
2. A check script (when generating HTML/UI)
3. A “--check” server startup script for server wiring

## Existing deeper docs worth linking
- Database access patterns: see `docs/DATABASE_ACCESS_PATTERNS.md`
- Service layer boundaries: see `docs/SERVICE_LAYER_ARCHITECTURE.md`
- Crawl modularization and seam planning: see `docs/CHANGE_PLAN.md` and `docs/CRAWL_REFACTORING_TASKS.md`

## Existing enforcement worth linking
- Server telemetry standard (v1): `tests/ui/server/serverTelemetryStandard.test.js`
- Crawler telemetry schema + bridge behavior: `tests/crawler/telemetry/telemetry.test.js`
