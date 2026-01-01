# Matrix Virtual Scroll — Implementation Plan

## Acceptance criteria
- Lab experiment 045 renders a logical matrix ≥ 4,000 × 1,500.
- Visible DOM cell count remains bounded (e.g. ≤ 2,500) at all scroll positions.
- Puppeteer check scrolls to multiple positions and asserts:
  - `data-first-row/col` and `data-last-row/col` are consistent with scroll offsets.
  - A handful of sampled cells have the expected row/col indices.
- Flip button swaps axes and still meets the same constraints.
- Screenshots are written to `screenshots/` for default, scrolled, and flipped states.

## Design sketch
- One scroll container (`data-testid="vm-viewport"`) with a large spacer that defines scrollbars.
- Render only visible cells as absolutely positioned divs inside the spacer.
- Render row/col headers as overlays; compute visible header items from the same window as cells.
- Throttle updates using `requestAnimationFrame`.

## Key invariants to expose for tests
- `data-render-seq` increments after each render.
- `data-first-row`, `data-first-col`, `data-last-row`, `data-last-col` set on a stable root element.

## Implementation steps
1) Create experiment folder `src/ui/lab/experiments/045-virtual-matrix-scroll/` with `client.js`, `check.js`, `README.md`.
2) Register experiment in lab manifest + README.
3) Implement `VirtualMatrixControl` (client-side) + `VirtualMatrixLabPage` (SSR + activation).
4) Implement `check.js`: SSR structural assertions → Puppeteer scroll/flip assertions → screenshots.
5) Record evidence in session notes and summarize.

## Validation commands
- `node src/ui/lab/experiments/045-virtual-matrix-scroll/check.js`
