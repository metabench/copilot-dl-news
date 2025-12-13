# Architectural Contracts

This directory collects **architectural contracts**: the explicit, test-backed boundaries between modules (crawler ↔ db ↔ ui ↔ tools).

If you’re changing behavior across a subsystem boundary, start here, then follow the links to the deeper docs.

## What is a “contract” here?
A contract is a **small, explicit promise** about a boundary:
- **Shape**: inputs/outputs (types, required keys, nullability)
- **Semantics**: ordering, idempotency, monotonicity, failure modes
- **Side effects**: what is written/updated, what must be closed/cleaned up
- **Evolution**: how to make a breaking change safely (shims + deprecations)

Contracts should be:
- **Documented** (briefly, in this folder)
- **Enforced** (with a focused test or check)

## Index
- [Contracts Overview](CONTRACTS_OVERVIEW.md)
- [Contracts Catalog](CONTRACTS_CATALOG.md)
- [DB Access Contract](CONTRACTS_DB_ACCESS.md)
- [UI Query Modules Contract (SQLite UI Queries)](CONTRACTS_UI_QUERY_MODULES.md)
- [Service Layer Contract (Routes ↔ Services ↔ Repos)](CONTRACTS_SERVICE_LAYER.md)
- [Server Lifecycle Contract ("--check" Mode)](CONTRACTS_SERVER_LIFECYCLE_CHECK_MODE.md)
- [Telemetry Contract (Server Telemetry Standard v1)](CONTRACTS_TELEMETRY_SERVER_STANDARD.md)
- [Telemetry Contract (Crawler Events)](CONTRACTS_TELEMETRY_CRAWLER_EVENTS.md)

## Where the enforcement lives
Contracts are enforced via one (or more) of:
- Focused Jest tests (preferred): `npm run test:by-path <test>`
- Check scripts under `src/**/checks/*.check.js` (especially UI/HTML)
- “--check” server startup checks for long-running servers

## When to add a new contract doc
Add a new file under `docs/arch/` when you:
- Introduce a new cross-module API surface
- Change a schema/DTO that crosses module boundaries
- Add an adapter (DB, HTTP, telemetry) that other modules depend on
- Fix a bug caused by an implicit/undocumented boundary assumption
