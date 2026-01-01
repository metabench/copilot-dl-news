# Working Notes – Virtual Matrix Smoothness

## 2025-12-31

### Goal
- Use lab experiments to validate “smooth scrolling” behavior for `VirtualMatrixControl`.
- Convert findings into repeatable checks so regressions are caught early.

### Baseline (Lab 045)
- Command: `node src/ui/lab/experiments/045-virtual-matrix-scroll/check.js`
- Result: PASS (bounded DOM, scroll window updates, flip works).
- Evidence captured during run (high-level):
	- Bounded DOM cell count stayed in the low-thousands (windowed render, not full matrix).
	- Scroll caused re-windowing (visible range changed as expected).
	- Flip axis mode rendered correctly.

### Production control smoothness check (Lab 046)
- Created: `src/ui/lab/experiments/046-virtual-matrix-control-smoothness/check.js`
- Initial failure: Puppeteer API mismatch: `page.waitForTimeout is not a function`
- Fix applied: replaced `page.waitForTimeout(150)` with local `delay(150)` Promise helper.

- Command: `node src/ui/lab/experiments/046-virtual-matrix-control-smoothness/check.js`
- Result: PASS
- Output highlights:
	- `data-vm-ready=1`
	- Initial: `renderSeq=1`, `cells=1056`
	- Small scroll: renderSeq unchanged (`before=1 after=1`) → verifies window-key caching / no unnecessary rerender
	- Big scroll: renderSeq increments (`before=1 after=2`) → verifies re-windowing
	- Resize: renderSeq increments (`before=2 after=3`) → verifies resize-triggered render
	- Still bounded after big scroll/resize (`cells=1296`, `cells=684`)

### Production validations (Place Hub Guessing)
- Command: `node src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.check.js`
	- Result: PASS (21/21)
- Command: `node src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.screenshot.check.js`
	- Result: PASS (table + virtual + scrolled + flipped screenshots)

### Ancillary
- Command: `npm run diagram:check`
	- Result: PASS; regenerated `diagram-atlas.check.html`
