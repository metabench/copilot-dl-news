# Working Notes – Z-server scan counting

- 2025-12-07 — Session created via CLI. Add incremental notes here.
- Added counting phase UI support: ScanningIndicatorControl now handles count-start/count-progress with indeterminate animation and file subtitle fallback.
- ContentAreaControl exposes setScanCounting/setScanCountingProgress used by ZServerAppControl.
- ZServerAppControl handles new IPC progress types (count-start, count-progress) to drive counting visuals.
