# Notes — 2025-12-14

## Hypothesis
z-server was not noticing stop+restart cycles because it only learns state changes from:
- processes it spawns (child `close`)
- the initial scan

External stop/restart (or PID churn) leaves the UI stale.

## Implementation
- Added a main-process polling loop (2s) that runs `serverDetector.detectRunningServers(lastScannedServers)` and emits `server-status-change` only when `(running,pid,port,url)` changes.
- Extended `server-status-change` payload to include `pid`, `port`, `url`, `source`, and `detectionMethod`.
- Hardened `stop-server` to handle stale `detectedPid`:
	- If taskkill reports PID missing, re-resolve the current PID via port/file and attempt again.
	- Always confirm candidate PID via `ipcGuards.isPidLikelyRunningServer()` before killing.
- Updated renderer-side `ZServerAppControl` to consume richer payloads and update stored PID/URL.

## Validation
- Jest:
	- Ran `z-server/tests/unit/zServerAppControl.scanProgress.test.js` (now includes a regression test for status-change mapping).

# Working Notes – z-server restart detection

- 2025-12-14 — Session created via CLI. Add incremental notes here.
