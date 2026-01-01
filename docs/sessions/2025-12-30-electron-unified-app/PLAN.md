# Plan – Electron packaging for Unified App

## Objective
Package the jsgui3 Unified App in Electron (dev run + build) without retiring any existing servers.

## Done When
- [ ] `npm run electron:unified` opens a desktop window that loads the unified shell.
- [ ] `npm run electron:unified:pack` produces an unpacked Windows build under `dist/`.
- [ ] Closing the Electron window cleanly stops the embedded server.
- [ ] Evidence is captured in `WORKING_NOTES.md`.

## Change Set (initial sketch)
- `src/ui/electron/unifiedApp/main.js`
- `electron-builder.unified.json`
- `package.json` (scripts + devDependencies)

## Risks & Mitigations
- Electron install/build can be slow on first run; keep validation steps focused.
- Packaged app needs `docs/`, `design/`, and optionally `data/news.db` available via `extraResources`.

## Tests / Validation
- `npm run electron:unified` (manual smoke: window opens, unified shell renders)
- `npm run electron:unified:pack` (creates `dist/win-unpacked/*`)
