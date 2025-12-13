# Contracts Catalog

A quick, index-driven list of the most important boundaries in this repo.

Add an entry here when you introduce a new cross-module surface.

## Crawler ↔ DB
**Boundary**: crawler code persists/reads through DB access helpers and DB adapters.
- Primary references:
  - `docs/arch/CONTRACTS_DB_ACCESS.md`
  - `docs/DATABASE_ACCESS_PATTERNS.md`
- Typical enforcement:
  - focused unit tests around adapter/service wiring
  - route tests asserting 503 on DB-unavailable

## UI Servers ↔ UI Query Modules
**Boundary**: UI servers render using stable, sanitized query module outputs.
- Primary references:
  - `docs/arch/CONTRACTS_UI_QUERY_MODULES.md`
- Typical enforcement:
  - `tests/db/sqlite/ui/urlListingNormalized.contract.test.js`
  - `tests/ui/server/dataExplorerServer.test.js`

## Routes/UI Servers ↔ Services
**Boundary**: Express route handlers should orchestrate; services implement business logic; repositories own persistence.
- Primary references:
  - `docs/arch/CONTRACTS_SERVICE_LAYER.md`
  - `docs/SERVICE_LAYER_ARCHITECTURE.md`

## Planning/GOFAI ↔ Consumers
**Boundary**: plan/trace schemas and plugin budgets are stable and validated.
- Primary references:
  - `docs/GOFAI_ARCHITECTURE.md`
  - `docs/ASYNC_PLANNER_PREVIEW.md`

## Telemetry ↔ Observability/Analysis
**Boundary**: telemetry event shapes remain compatible for consumers.
- Primary references:
  - `docs/arch/CONTRACTS_TELEMETRY_SERVER_STANDARD.md`
  - `docs/arch/CONTRACTS_TELEMETRY_CRAWLER_EVENTS.md`
  - `docs/guides/SERVER_TELEMETRY_STANDARD.md`

## UI SSR/Activation ↔ Controls
**Boundary**: server-rendered control output must be activatable client-side without assuming `dom.el` exists on the server.
- Primary references:
  - `docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md`

## Servers ↔ Lifecycle ("--check")
**Boundary**: verification runs must not hang; servers support `--check` where applicable.
- Primary references:
  - `docs/arch/CONTRACTS_SERVER_LIFECYCLE_CHECK_MODE.md`
  - `AGENTS.md` (Server Verification section)
  - `docs/COMMAND_EXECUTION_GUIDE.md`
