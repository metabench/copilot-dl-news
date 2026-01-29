# Plan – Distributed Worker API Versioning

## Objective
Add versioned worker API with /meta + OpenAPI schema and client-side version negotiation.

## Done When
- [x] Worker exposes `GET /meta` with `apiVersion` + `capabilities`.
- [x] Worker exposes `GET /openapi.json` for schema introspection.
- [x] Client can query /meta and safely gate `includeBody` / compression.
- [x] CLI exists to check worker versions before long runs.
- [x] Validation script demonstrates local correctness.

## Change Set (initial sketch)
- labs/distributed-crawl/worker-server.js
- src/crawler/adapters/DistributedFetchAdapter.js
- tools/dev/worker-version-check.js
- labs/distributed-crawl/checks/worker-api.check.js

## Risks & Mitigations
- Risk: Deployed workers drift from repo expectations.
	- Mitigation: `GET /meta` + `node tools/dev/worker-version-check.js` gate.
- Risk: Some workers may not support /meta yet.
	- Mitigation: client falls back to legacy `/batch` ping for liveness.

## Tests / Validation
- `node labs/distributed-crawl/checks/worker-api.check.js`
- `node tools/dev/worker-version-check.js --worker http://<host>:8081 --json`
