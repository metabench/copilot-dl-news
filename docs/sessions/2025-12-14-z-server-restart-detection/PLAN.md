# Plan – z-server restart detection

## Objective
Investigate why z-server fails to notice a stopped+restarted server and improve telemetry/handshake so restarts are detected reliably.

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- z-server/main.js
	- Add periodic polling via `serverDetector.detectRunningServers()` so external stop/restart updates UI.
	- Emit richer `server-status-change` payloads (`running`, `pid`, `port`, `url`).
	- Harden `stop-server` handling for stale PIDs (restart case) by re-resolving PID by port/file.
- z-server/ui/controls/zServerAppControl.js
	- Accept richer status-change payloads and update PID/URL accordingly.
- z-server/tests/unit/zServerAppControl.scanProgress.test.js
	- Add regression coverage for status-change mapping.

## Risks & Mitigations
- Risk: Poll loop could spam UI updates.
	- Mitigation: only emit when `(running,pid,port,url)` changes.
- Risk: External stop with stale PID could kill the wrong process.
	- Mitigation: confirm PID via `ipcGuards.isPidLikelyRunningServer()` using command-line match.

## Tests / Validation
- `z-server/tests/unit/zServerAppControl.scanProgress.test.js` (covers scan progress + status change mapping)
