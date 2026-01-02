# Session Summary – z-server detached launch

## Accomplishments
- Added a z-server launch mode that keeps started Node servers running after z-server exits (detached spawn + skip kill-on-quit).
- Made detached mode robust across z-server restarts via a persisted detached server registry (Electron userData JSON).
- Added a UI checkbox to toggle/persist this behavior per user preference.
- Added a “Unified UI” Featured App card with a one-click “Launch (detached)” action.
- Added Unified UI deep-link launch buttons (Scheduler / Crawl / Data) that launch detached, wait briefly for readiness, and open the chosen route.
- Added a “↻ Restart” button for the selected server (stop → start).

## Metrics / Evidence
- `cd z-server; npm run build`
- `cd z-server; npm run test:unit`
- `cd z-server; npm run build; npm run test:unit`

## Decisions
- Use detached child process (`detached: true` + `unref()`) to decouple lifecycle; accept that live stdout/stderr streaming is not available in that mode.

## Next Steps
- Consider showing a clearer “Detached (persisted)” badge in the UI when a server is running via the registry.
- Investigate the recurring Node warning about `--localstorage-file` being invalid (non-fatal but noisy).
