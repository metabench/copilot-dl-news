# Next Agent Briefing — Virtual Matrix Scroll

## What changed
- Added Lab 045: `src/ui/lab/experiments/045-virtual-matrix-scroll/`
  - Virtual scrolling prototype: renders only viewport+buffer cells as absolutely positioned divs.
  - Deterministic test contract: `data-first-row/col`, `data-last-row/col`, `data-cell-count`, `data-render-seq`.
  - Axis flip swaps logical dims 4000×1500 ↔ 1500×4000.
- Registered experiment in:
  - `src/ui/lab/manifest.json`
  - `src/ui/lab/README.md`

## Evidence
- Lab check passes: `node src/ui/lab/experiments/045-virtual-matrix-scroll/check.js`
- Screenshots produced:
  - `screenshots/lab-045-virtual-matrix-default.png`
  - `screenshots/lab-045-virtual-matrix-scrolled.png`
  - `screenshots/lab-045-virtual-matrix-flipped.png`

## Why this matters
This proves a bounded-DOM approach works within the jsgui3 lab harness and gives us a test contract we can reuse when we promote virtualization into production UI.

## Next steps (suggested)
- Extend correctness checking: sample specific expected cells at known scroll offsets (beyond the first 12).
- Add “DOM budget” telemetry over multiple scrolls (max cellCount seen).
- Decide promotion target:
  - add a virtual mode to `MatrixTableControl`, OR
  - create a sibling `VirtualMatrixControl` under `src/ui/server/shared/isomorphic/controls/ui/`.
