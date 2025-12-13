# Service Layer Contract (Routes ↔ Services ↔ Repositories)

## Boundary
Route handlers should be thin controllers; domain logic lives in services; persistence lives in repositories/adapters.

**Deep reference**: `docs/SERVICE_LAYER_ARCHITECTURE.md`

## Contract

### Rule 1 — Routes are orchestration, not business logic
Routes should:
- parse/validate request inputs (basic checks)
- call a service
- map service results/errors to HTTP responses

Services should:
- implement domain rules
- coordinate operations across repos
- return domain results/DTOs
- throw domain errors (not raw HTTP responses)

### Rule 2 — Dependency injection is explicit
Services receive dependencies through constructors/factories (no hidden globals).

### Rule 3 — Services don’t own process concerns
Services should not start servers, attach readline handlers, or create long-lived intervals as a side effect.

## Invariants
- A route can be tested without booting a full Express server (when practical).
- A service can be tested with stubbed repos (no DB required).
- Changing DB schema/persistence details shouldn’t force route rewrites.

## Enforcement
- Add a unit test for the service class/function.
- Add a small route/controller test ensuring HTTP mapping is correct.

Existing enforcement examples in this repo:
- `tests/ui/server/dataExplorerServer.test.js` (route mapping + HTML output with mocked `dbAccess`)
- `tests/server/diagram-atlas.e2e.test.js` (server responses, SSR shell vs static mode, API payload behavior)

## Change protocol
When extracting logic from a route:
1. Write a test for the behavior (baseline)
2. Move logic into a service behind an explicit interface
3. Inject dependencies
4. Keep route/controller as a thin wrapper
5. Run the smallest relevant Jest suite via `npm run test:by-path`
