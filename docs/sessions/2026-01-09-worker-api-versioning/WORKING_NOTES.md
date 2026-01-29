# Working Notes – Distributed Worker API Versioning

- 2026-01-09 — Implemented API versioning + introspection for the distributed worker.

## What changed

- Worker now exposes:
	- `GET /meta` → `{ apiVersion, capabilities, serverDefaults }`
	- `GET /health` → `{ ok, apiVersion }`
	- `GET /openapi.json` → OpenAPI 3.0 schema
	- `POST /batch` now includes `summary.apiVersion` and sets `x-worker-api-version` response header.

## Orchestration workflow

1) When you change worker protocol, bump:
	 - `WORKER_API_VERSION` in `labs/distributed-crawl/worker-server.js`

2) Deploy worker code to each remote worker host, restart service.

3) Verify workers match the repo version before long runs:
	 - `node tools/dev/worker-version-check.js --worker http://<host>:8081`
	 - `node tools/dev/worker-version-check.js --worker http://<host>:8081 --json`

## Evidence / validation

- Local correctness check (no external internet dependency):
	- `node labs/distributed-crawl/checks/worker-api.check.js`

## Notes about current remote worker

- `http://144.21.42.149:8081` currently returns `{"error":"Not found"}` on `/meta` (old worker).
- After deploying the updated worker-server, `/meta` should include `apiVersion`.
