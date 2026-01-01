# Working Notes – Electron packaging for Unified App

- 2025-12-30 — Session created via CLI. Add incremental notes here.

## Evidence (packaged run)

- Repacked after updating [electron-builder.unified.json](electron-builder.unified.json) to include `src/**` and ship `data/bootstrap/` as `extraResources`.
- Launched packaged EXE from `dist/win-unpacked` by discovering the filename (avoids Unicode em-dash quoting issues):
	- `Get-ChildItem dist/win-unpacked -Filter '*.exe' | Select-Object -First 1 -ExpandProperty FullName`
	- `Start-Process -FilePath <exeFullPath> -ArgumentList @('--port','3171') -WorkingDirectory dist/win-unpacked`

Observed stdout (high-signal):
- `Doc tree built: 2269 files`
- `[RateLimitTracker] Initialized`

Notes:
- Fixed bootstrap lookup: `src/db/sqlite/v1/newsSourcesSeeder.js` now prefers `process.cwd()/data/bootstrap/news-sources.json` (packaged mode: Electron main `chdir`s into `resources` so `extraResources` works).
- electron-builder Windows quirk: extracting the `winCodeSign` helper can fail when symlink privileges are missing. For our `--dir` build we avoid it by setting `win.signAndEditExecutable=false` in `electron-builder.unified.json`.
