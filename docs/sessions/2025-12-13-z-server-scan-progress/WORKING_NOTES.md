# Working Notes – z-server: file scan progress with counted calibration

- 2025-12-13 — Session created via CLI.

## Existing patterns found
- Main → renderer progress is IPC event-based (Electron): `webContents.send('scan-progress', msg)` and `ipcRenderer.on('scan-progress', ...)`.
- Scan itself runs in a child process: `node tools/dev/js-server-scan.js --progress`, emitting JSONL progress events on stdout.

## Standardized methodology (2-phase scan)
1) **Count phase** (calibration)
	- Emit: `count-start` → repeated `count-progress` → `count { total }`.
	- Renderer should switch from indeterminate progress to determinate as soon as `total` is known.
2) **Scan phase** (determinate)
	- Emit: repeated `progress { current, total, file }` → `complete`.

## Robustness rules (edge cases)
- Chunk boundaries: JSON may split across stdout chunks; must be buffered and parsed line-by-line.
- CRLF/LF: accept both newline styles.
- Tool chatter/noise: ignore non-JSON lines (don’t break the stream).
- Buffer growth: cap buffer size to avoid runaway memory if the child writes without newlines.

## Files changed
- z-server/lib/jsonlStreamParser.js
- z-server/lib/scanProgressProtocol.js
- z-server/main.js
- z-server/preload.js
- z-server/tests/unit/jsonlStreamParser.test.js
- z-server/tests/unit/scanProgressProtocol.test.js

## Validation
- Unit tests:
  - z-server/tests/unit/jsonlStreamParser.test.js
  - z-server/tests/unit/scanProgressProtocol.test.js
  - z-server/tests/unit/zServerAppControl.scanProgress.test.js
  - z-server/tests/unit/scanningIndicatorControl.test.js
