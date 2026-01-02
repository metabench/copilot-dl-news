# Working Notes – Z-server Scan Filters

- 2026-01-02 — Session created via CLI. Add incremental notes here.

- 2026-01-02 12:33 — 
## 2026-01-02

### Goal
Tighten z-server server scan results: hide noisy candidates by default (labs/tests/tools/api), add user-configurable toggles.

### Evidence / recon
- Ran js-server-scan (repo root, `--html-only`) and found 56 candidates; many were noise:
  - `src/ui/lab/experiments/**`, `tests/**`, `checks/**`, `tools/**`, plus `src/api/server.js`.

### Implementation
- Added categorical filtering in z-server main process, driven by `visibility` options passed from renderer.
- Added sidebar checkboxes to control visibility, persisted in `localStorage` (`zserver:scanVisibility`).

### Commands
- `node tools/dev/js-server-scan.js --progress --dir <repo> --html-only`
- `npm run test:unit` (z-server)
- `npm run build` (z-server)

### Follow-up polish
- Exposed the existing `other` visibility bucket in the sidebar UI (so users can opt into uncategorized results without editing localStorage).

### Re-validation
- `npm --prefix z-server run test:unit`
- `npm --prefix z-server run build`
