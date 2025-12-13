# Follow Ups – z-server analysis

- P0: Add `app.on('before-quit')` cleanup in z-server/main.js to stop all `runningProcesses` (SIGTERM → timeout → SIGKILL).
- P0: Lock down IPC parameters (`start-server`, `stop-server`) to an allowlist derived from latest scan results; reject paths outside repo root.
- P1: Replace/augment `wmic` usage in z-server/lib/serverDetector.js with `ps-list` + PowerShell CIM fallback for command lines.
- P1: Update z-server E2E orphan cleanup to stop relying on `wmic` (use `ps-list` where possible).
- P2: Move main-process logging off sync I/O (async append or write stream with queue).
- P2: Harden scan progress parsing by `JSON.parse(line.trim())` and document the “progress/result” JSONL contract.
