# Working Notes – Telemetry: process handler idempotency

- 2025-12-12 — Session created via CLI. Add incremental notes here.

## Change

- Made `createTelemetry().wireProcessHandlers()` idempotent so repeated server/test setups do not keep adding `process.on('uncaughtException'| 'unhandledRejection')` listeners (prevents `MaxListenersExceededWarning`).

## Validation

- Jest: `npm run test:by-path tests/ui/server/serverTelemetryStandard.test.js` (PASS)

## Follow-up validation (broader suite)

- Ran Data Explorer suites to ensure the warning is gone in practice.
- Observed a timeout in `tests/ui/server/dataExplorerServer.production.test.js` on `/domains/:host`; optimized the underlying domain detail queries to use the `urls(host)` index on the common path.
- Jest: `npm run test:by-path tests/ui/server/dataExplorerServer.production.test.js` (PASS after query change)
