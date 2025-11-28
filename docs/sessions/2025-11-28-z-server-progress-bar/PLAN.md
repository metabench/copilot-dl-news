# Plan – Z-Server Scan Progress Bar

## Objective
Add real progress bar to z-server scan with debounced IPC updates (max 17ms frequency)

## Done When
- [x] Session created and PLAN.md updated
- [x] Pre-scan file counting implemented in js-server-scan.js
- [x] Progress events emitted during scan (debounced at 17ms)
- [x] IPC handler in main.js forwards progress events to renderer
- [x] preload.js exposes onScanProgress callback
- [x] ScanningProgressControl created with actual progress bar UI
- [x] ContentAreaControl updated to show progress during scan
- [x] Build and test in z-server app
- [ ] SESSION_SUMMARY.md completed

## Change Set
1. `tools/dev/js-server-scan.js` - Add --progress mode with pre-counting and progress events ✅
2. `z-server/main.js` - Spawn with progress, forward IPC events (debounced) ✅
3. `z-server/preload.js` - Add onScanProgress listener ✅
4. `z-server/ui/controls/zServerControlsFactory.js` - New ScanProgressControl, update ContentAreaControl ✅
5. Progress bar CSS styling embedded in styles ✅

## Architecture

### Data Flow
```
js-server-scan.js (Node process)
    │
    │ stdout: JSON progress lines (debounced at source)
    │   { "type": "count", "total": 47 }
    │   { "type": "progress", "current": 12, "total": 47, "file": "src/..." }
    │   { "type": "result", "servers": [...] }
    │
    ▼
main.js (Electron main process)
    │
    │ IPC: 'scan-progress' events
    │
    ▼
preload.js (context bridge)
    │
    │ onScanProgress(callback)
    │
    ▼
ZServerAppControl → ContentAreaControl → ScanProgressControl
```

### Debouncing Strategy
- **Source-level debouncing**: js-server-scan.js tracks last emit time
- **17ms = ~60fps** max update rate
- First message ("count") always sent immediately
- Final message ("result") always sent immediately
- Progress messages debounced

## Risks & Mitigations
- **Risk**: Scanner architecture is synchronous, hard to emit progress
  - **Mitigation**: Modify scanner to emit callbacks, or create wrapper that counts first
- **Risk**: Flooding IPC with too many events
  - **Mitigation**: Debounce at 17ms in scan tool before emitting

## Tests / Validation
1. Run z-server app, observe progress bar during scan ✅
2. Check that progress updates smoothly (not jerky or flooded) ✅
3. Verify final server list still appears correctly ✅
