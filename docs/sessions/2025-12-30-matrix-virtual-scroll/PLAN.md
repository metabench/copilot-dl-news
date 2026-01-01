# Plan – Virtual scrolling matrix lab

## Objective
Prototype and validate a **virtual-scrolling matrix** pattern suitable for very large matrices (thousands of rows/cols) with deterministic checks.

Target outcome: a lab experiment that proves we can scroll/flip without DOM blow-up.

## Done When
- [ ] Lab experiment exists (045) demonstrating a large virtualized matrix.
- [ ] DOM stays bounded while scrolling (asserted in Puppeteer check).
- [ ] Axis flip works (rows↔cols) without reloading.
- [ ] Evidence captured: screenshots + printed metrics.
- [ ] Session docs include: what we built, why, and how to promote into production.

## Change Set
- `src/ui/lab/experiments/045-virtual-matrix-scroll/README.md`
- `src/ui/lab/experiments/045-virtual-matrix-scroll/client.js`
- `src/ui/lab/experiments/045-virtual-matrix-scroll/check.js`
- `src/ui/lab/manifest.json` (add experiment entry)
- `src/ui/lab/README.md` (index row)
- Session docs:
	- `docs/sessions/2025-12-30-matrix-virtual-scroll/GOALS_REVIEW.md`
	- `docs/sessions/2025-12-30-matrix-virtual-scroll/MATRIX_VIRTUAL_SCROLL_IMPLEMENTATION_PLAN.md`
	- `docs/sessions/2025-12-30-matrix-virtual-scroll/VALIDATION_MATRIX.md`
	- `docs/sessions/2025-12-30-matrix-virtual-scroll/NEXT_AGENT_BRIEFING.md`
	- `docs/sessions/2025-12-30-matrix-virtual-scroll/NEXT_AGENT_PROMPT.md`

## Approach (high-level)
- Build a `VirtualMatrixControl` (lab-local) that:
	- Renders a lightweight SSR skeleton (viewport + overlays)
	- On activation: renders only the visible cell window (viewport + buffer)
	- Uses a single scroll container and absolute-positioned cells inside a spacer
	- Renders row/col headers as overlays driven by scroll offsets
	- Throttles updates via `requestAnimationFrame`
	- Exposes deterministic attributes for tests:
		- `data-first-row`, `data-first-col`, `data-last-row`, `data-last-col`
		- bounded DOM markers via `data-testid="vm-cell"`

## Risks & Mitigations
- **JS-heavy updates too slow** → keep cell window small; use RAF throttle; avoid per-scroll synchronous loops.
- **Huge scroll sizes** → keep dimensions in a safe band (e.g. 4k×1.5k) while still representing 6M+ logical cells.
- **Check flakiness** → use stable render counters (`data-render-seq`) + waitForFunction instead of sleeps.
- **jsgui3 runtime mismatch in Node** → mirror Lab 044 pattern (minimal `window/document` globals).

## Tests / Validation (commands)
- Run lab check (SSR + Puppeteer):
	- `node src/ui/lab/experiments/045-virtual-matrix-scroll/check.js`
- Optional: run lab console check:
	- `node src/ui/lab/checks/labConsole.check.js`
