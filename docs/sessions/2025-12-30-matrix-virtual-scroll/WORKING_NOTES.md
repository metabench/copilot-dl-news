# Working Notes – Virtual scrolling matrix lab

- 2025-12-30 — Session created via CLI.

## Recon
- Lab manifest currently ended at 044; new experiment becomes 045.
- Prior art reviewed: `src/ui/lab/experiments/015-streaming-virtual-harness/*` (synthetic + fractal validation harness).

## Implementation
- Added Lab 045: `src/ui/lab/experiments/045-virtual-matrix-scroll/`
	- `client.js`: `VirtualMatrixControl` (viewport-windowed cells) + `VirtualMatrixLabPage`
	- `check.js`: SSR assertions + Puppeteer scroll/flip assertions + screenshots
- Registered in lab catalog:
	- `src/ui/lab/manifest.json`
	- `src/ui/lab/README.md`

## Bug + fix
- Bug: model used `{...dims, ...labels}` so `rows/cols` counts were overwritten by label arrays.
- Fix: model now uses `rowCount/colCount` + `rowLabels/colLabels`.

## Validation (evidence)
Command:
- `node src/ui/lab/experiments/045-virtual-matrix-scroll/check.js`

Key results (all ✅):
- SSR includes `virtual_matrix_lab_page` and `virtual_matrix_control`.
- Client activation sets `data-activated=1`.
- Logical matrix sizes: 4000×1500; after flip 1500×4000.
- DOM cells bounded:
	- initial: 728
	- scrolled: 960
	- flipped: 728

Artifacts:
- `screenshots/lab-045-virtual-matrix-default.png`
- `screenshots/lab-045-virtual-matrix-scrolled.png`
- `screenshots/lab-045-virtual-matrix-flipped.png`
