# Working Notes – z-server status/progress truthfulness

- 2025-12-11 — Session created via CLI. Add incremental notes here.

- 2025-12-11 — Scan-progress truthfulness updates
	- Decision: handle `scan-progress: {type:'complete'}` in the renderer to force a final determinate 100% update (when total is known) so the progress bar is truthful even if the UI hides it immediately after the scan promise resolves.

## Truth Table (draft)

### Scan lifecycle (renderer)

| IPC event | Expected UI call(s) | Notes |
|---|---|---|
| `count-start` | `ContentArea.setScanning(true)` (already at scan start), then `ContentArea.setScanCounting()` | Indeterminate counting mode |
| `count-progress` | `ContentArea.setScanCountingProgress(current, file)` | Still indeterminate |
| `count` | `ContentArea.setScanTotal(total)` | Switch to determinate mode at 0/total |
| `progress` | `ContentArea.setScanProgress(current, total, file)` | Determinate progress |
| `complete` | `ContentArea.setScanProgress(total, total, lastFile)` (best-effort) | Forces 100% when possible |

### Server lifecycle (renderer)

| Source | Event / result | Expected UI updates | Notes |
|---|---|---|---|
| Initial scan result | server has `running: true` + `detectedPort` | `server.runningUrl = http://localhost:<port>` + system log lines + sidebar URL badge | Best-effort: inferred URL from detected port |
| User action | `startServer(file)` result: `{success:true, pid}` | Set server `running=true`, set PID, update sidebar/content running indicators, add system log | Main process does not emit `running:true` status-change |
| User action | `startServer(file)` result: `{success:false, message:'Already running'}` | Set `running=true`, update indicators, add warning log, infer URL from `defaultPort` if available | Truthfulness is best-effort (may be wrong port) |
| User action | `startServer(file)` result: `{success:false, message:<err>}` | Add stderr log, leave running=false | |
| Main process | `server-status-change {running:false}` | Update server `running=false`, clear PID, update sidebar/content; content clears URL | Fired on process exit/crash/kill; may arrive after UI already set running=false |
| User action | `stopServer(file, pid)` result: `{success:true}` | Set `running=false`, clear PID, update indicators, add system log | Main process may also send `server-status-change {running:false}` shortly after |
| User action | `stopServer(file, detectedPid)` result: `{success:true, wasExternal:true}` | Set `running=false`, clear PID, update indicators, log “External server stopped” | Only works for externally detected PIDs |

## Evidence

- 2025-12-11 — Ran: `cd z-server; npm test`
	- PASS: tests/unit/zServerAppControl.scanProgress.test.js
	- PASS: tests/unit/scanningIndicatorControl.test.js
	- Overall: 6 suites passed, 45 tests passed

