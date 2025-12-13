# Z-Server UX → IPC Map

This map documents the renderer UX controls, the preload bridge, and the main-process IPC handlers for **z-server**, plus the guardrails and invariants that keep the feature safe and predictable.

## Primary UI surfaces (controls)

- `ZServerAppControl` (orchestrator)
  - Owns state: `scanning`, `servers[]`, `selectedServer`, log buffers
  - Owns event wiring: subscribes to `scan-progress`, `server-log`, `server-status-change`
  - Owns actions: Start/Stop/Open URL

- `SidebarControl` → `ServerListControl` → `ServerItemControl`
  - Server selection
  - Inline URL click (open in browser)

- `ContentAreaControl`
  - Header: selected server name
  - `ControlPanelControl`: Start/Stop buttons
  - `ServerUrlControl`: prominent “SERVER RUNNING” URL panel
  - `ScanningIndicatorControl`: determinate vs counting progress UI
  - `LogViewerControl`: streaming logs

## IPC contract (preload bridge)

Preload exposes `window.electronAPI` with invoke-based methods and event subscriptions.

- Invoke methods:
  - `scanServers()` → `ipcMain.handle('scan-servers')`
  - `startServer(filePath)` → `ipcMain.handle('start-server')`
  - `stopServer(filePath, detectedPid)` → `ipcMain.handle('stop-server')`
  - `openInBrowser(url)` → `ipcMain.handle('open-in-browser')`
  - `getActivityLogs(count)` → `ipcMain.handle('get-activity-logs')`
  - `getPortStatus()` → `ipcMain.handle('get-port-status')`

- Event subscriptions:
  - `onScanProgress(cb)` listens to `scan-progress`
  - `onServerLog(cb)` listens to `server-log`
  - `onServerStatusChange(cb)` listens to `server-status-change`

## UX event/state model

The UX follows a small state machine:

- **Boot → Scanning**
  - `scan-progress: {type:'count-start'|'count-progress'}` puts UI into counting mode
  - `scan-progress: {type:'count', total}` sets determinate total
  - `scan-progress: {type:'progress', current, total, file}` updates determinate progress
  - `scan-progress: {type:'complete'}` exits scanning UI

- **Loaded (Servers list)**
  - Selecting a server updates ContentArea and enables Start/Stop controls

- **Running**
  - When server is running, URL may appear in list and in ContentArea URL panel
  - Logs stream in; URL detection may also come from stdout/system lines

- **Stopped / Exit**
  - On exit, server status flips to stopped and the URL panel hides

## Guardrails (main-process invariants)

These are enforced in the main process (not the renderer), because renderer inputs are untrusted.

1. **Server file allowlist**
   - `start-server` and `stop-server` only accept file paths that are:
     - inside the repo base path
     - present in the latest scan allowlist

2. **Safe URL policy for open-in-browser**
   - Only `http:` and `https:`
   - Only localhost-ish hosts (`localhost`, `127.0.0.1`, `0.0.0.0`, `::1`)

3. **Conservative external PID stopping**
   - If UX passes `detectedPid` for a server not started by z-server, main will only stop it if:
     - PID is confirmed to be a `node` process
     - command line is confirmably running the selected server file (best-effort; otherwise refuse)

4. **Quit-time cleanup**
   - On `before-quit`, best-effort kill of tracked child processes so the app doesn’t leak servers.

## Tests

- Unit: `z-server/tests/unit/ipcGuards.test.js`
  - Validates path allowlist logic
  - Validates safe URL policy
  - Validates conservative PID confirmation behavior
