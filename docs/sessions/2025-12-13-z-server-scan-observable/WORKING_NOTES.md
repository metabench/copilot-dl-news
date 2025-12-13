# Working Notes – z-server scan as observable

## Findings (current state)
- `z-server/main.js` currently discovers servers by spawning `node tools/dev/js-server-scan.js --progress` and forwarding JSONL progress events to the renderer over IPC (`scan-progress`).
- `tools/dev/js-server-scan.js --progress` emits JSONL messages during counting + scanning, then a final `{ type: "result", servers }` message.
- The `fnl` module (available under `z-server/node_modules/fnl`) provides an `observable(fn)` that emits `next/complete/error` via an internal `setTimeout(0)` startup tick.

## Decision
- Implement an **fnl-style observable wrapper** around the existing child-process scan, rather than rewriting the scan to run in-process (keeps UI responsive and reduces refactor risk).

## Implementation notes
- Added `createScanServersObservable()` in `z-server/lib/scanServersObservable.js`.
	- Emits normalized scan progress messages (`count-start`, `count-progress`, `count`, `progress`).
	- Emits a final `{ type: "result", servers }` payload for in-process consumers.
	- Raises `error` if the child exits without a result.
	- Provides `stop()` (best-effort kill) via fnl’s `[stop]` return convention.
- Wired `ipcMain.handle('scan-servers')` in `z-server/main.js` to consume the observable and forward only progress events to the renderer.

## Proof / validation
- Jest: `z-server/tests/unit/scanServersObservable.test.js` (passes)

## Notes on testing
- `fnl.observable()` executes the inner function on a future tick (`setTimeout(0)`), so unit tests use Jest fake timers to deterministically advance startup.

- 2025-12-13 — Session created via CLI. Add incremental notes here.
