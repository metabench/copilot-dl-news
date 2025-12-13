# Working Notes – z-server analysis

- 2025-12-13 — Session created via CLI.

## Scope surveyed

- Entry points: z-server/main.js, z-server/preload.js, z-server/renderer.src.js
- Process detection + logging: z-server/lib/serverDetector.js, z-server/lib/serverLogger.js
- Tests: z-server/tests/unit/serverDetector.test.js, z-server/tests/smoke.test.js, z-server/tests/e2e/app.e2e.test.js
- Cross-repo contract-ish utility: z-server/ui/lib/telemetryJsonl.js (+ tests/z-server/telemetryJsonl.test.js)

## Key findings (high signal)

### 1) No main-process shutdown cleanup for child servers (P0)

Evidence:
- z-server/main.js tracks spawned servers in `runningProcesses` but does not register any `app.on('before-quit'|'will-quit')` hook to stop them.

Impact:
- If the Electron app closes/crashes, spawned Node servers can remain running (port conflicts, “already in use” errors, surprise background CPU/memory).

Mitigation options:
- Add a shutdown handler (`app.on('before-quit')`) that iterates `runningProcesses` and attempts a graceful stop first, then escalates:
	- Phase 1: send `SIGTERM` (or Windows-friendly terminate via tree-kill)
	- Phase 2: after a timeout (e.g., 1500ms), send `SIGKILL`
- Log each stop attempt with a runId so post-mortems can correlate “quit → cleanup”.

### 2) IPC surface is overly powerful (P0 security/abuse surface)

Evidence:
- z-server/main.js IPC handlers accept raw `filePath` (start/stop) and `detectedPid` (stop), then:
	- `spawn('node', [filePath])`
	- `treeKill(detectedPid, 'SIGKILL')`

Impact:
- If the renderer is compromised (XSS, supply chain in the UI bundle, malicious content), IPC becomes a remote code execution / arbitrary process termination primitive.

Mitigation options:
- Tighten IPC contracts:
	- Only allow starting servers that were returned by the most recent scan result (treat scan output as an allowlist).
	- Require `filePath` to be within `BASE_PATH` and to end with `.js`.
	- For “external stop”, require that `detectedPid` is verified as a Node process whose command line references a file within `BASE_PATH`.
- Add focused unit tests (or a check script) that proves invalid inputs are rejected with a stable error shape.

### 3) Windows-specific process inspection depends on `wmic` (P1 portability / brittleness)

Evidence:
- z-server/lib/serverDetector.js uses `wmic` for:
	- `getProcessCommandLine(pid)`
	- `getNodeProcesses()`
- z-server/tests/unit/serverDetector.test.js mocks `wmic` output.
- z-server/tests/e2e/app.e2e.test.js also uses `wmic` during orphan cleanup.

Impact:
- `wmic` is deprecated/removed on newer Windows builds; when missing, detection degrades (can’t match PIDs to command lines; “stop external” verification becomes weaker).

Mitigation options:
- Implement a Windows fallback:
	- Prefer `ps-list` for process enumeration (already in dependencies).
	- For command line retrieval on Windows, fall back to PowerShell CIM:
		- `Get-CimInstance Win32_Process -Filter "ProcessId=<pid>" | Select-Object -ExpandProperty CommandLine`
- Keep current `wmic` path as “best effort” but handle “command not found” as a normal case.
- Update the unit tests to cover both branches (wmic present vs CIM fallback).

### 4) Stop semantics are “SIGKILL only” (P1 correctness / UX)

Evidence:
- z-server/main.js uses `treeKill(pid, 'SIGKILL')` for both tracked and externally detected processes.

Impact:
- Skips graceful shutdown: logs may not flush, DB connections may not close cleanly, and servers don’t get a chance to run `finally`/cleanup code.

Mitigation options:
- Two-stage stop:
	- Default to `SIGTERM` (or a platform-specific friendly termination).
	- Escalate to `SIGKILL` after a timeout.
- Optional: expose a “Force stop” UI action that uses SIGKILL explicitly.

### 5) Main-process logging is synchronous (P2 responsiveness)

Evidence:
- z-server/lib/serverLogger.js uses `fs.appendFileSync` for activity + error logs.

Impact:
- Under bursty output (server logs, repeated scans), synchronous file I/O in Electron main can cause UI stalls.

Mitigation options:
- Switch to async append (appendFile) or a single write stream with a small in-memory queue.
- Ensure stream is closed on quit.

### 6) Scan JSON-lines parsing is tolerant but potentially fragile (P2)

Evidence:
- z-server/main.js parses each stdout line with `JSON.parse(line)` and ignores non-JSON lines.

Impact:
- If the scan tool ever emits whitespace, CRLF variants, or extra console logging, parsing can silently drop events.

Mitigation options:
- Parse `JSON.parse(line.trim())`.
- Consider using the tool’s `--json` output for the final result (keep `--progress` for streaming), and treat the “result schema” as a documented contract.

## Quick ROI ranking (what to fix first)

1) Add quit-time cleanup for tracked child servers (P0).
2) Tighten IPC allowlist/validation (P0).
3) Replace/augment `wmic` with cross-platform `ps-list` + PowerShell CIM fallback (P1).
4) Two-stage stop semantics (P1).
5) Make main-process logging async (P2).
