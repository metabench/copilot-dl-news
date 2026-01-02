# Working Notes – z-server detached launch

## Evidence
- Rebuilt renderer bundle: `cd z-server; npm run build` (success)
- Ran unit tests: `cd z-server; npm run test:unit` (pass)
- Rebuilt + re-ran after robustness hardening: `cd z-server; npm run build; npm run test:unit` (pass)

## Implementation Notes
- Added `keepRunningAfterExit` option to z-server IPC start path; uses `spawn(..., { detached: true, stdio: 'ignore' })` + `child.unref()` and skips kill-on-quit for detached processes.
- Added a UI checkbox “Keep running after z-server closes” (persisted via localStorage key `zserver:keepRunningAfterExit`).
- Added a “Unified UI” Featured App card with a one-click primary CTA “▶ Launch (detached)” that starts `src/ui/server/unifiedApp/server.js` detached and opens the expected URL.
- Added deep-link quick launch buttons on the Unified UI card (Scheduler / Crawl / Data) that start detached and open the specific route.
- Added a “↻ Restart” button for the selected server that performs stop → start with the current options.

### Robustness hardening (follow-up)
- Added a persisted detached server registry (Electron `userData` JSON) so detached processes remain controllable after restarting z-server.
- Start now avoids duplicate launches when a server is already running (confirmed via port PID + command-line guards or file-based process scan).
- Stop now uses the persisted detached PID when no tracked PID exists, enabling stop/restart of detached servers across z-server restarts.
- Deep-link launch waits briefly for the base URL to respond before opening the browser (timeouts fall back to “open anyway”).

- 2026-01-02 — Session created via CLI. Add incremental notes here.
