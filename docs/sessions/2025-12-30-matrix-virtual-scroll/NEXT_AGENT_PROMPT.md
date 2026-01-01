You are continuing the session: docs/sessions/2025-12-30-matrix-virtual-scroll/

Goal:
- Promote the Lab 045 virtual scrolling pattern into a production-ready, reusable control (or mode) suitable for Place Hub Guessing.

Current state:
- Lab 045 exists at src/ui/lab/experiments/045-virtual-matrix-scroll/ and passes its check.
- It exposes deterministic attributes: data-first-row/col, data-last-row/col, data-cell-count, data-render-seq.

Tasks:
1) Strengthen Lab 045 correctness assertions:
   - After scrolling to two different offsets, assert at least 3 sampled cells have exact expected r/c indices and text.
   - Track the maximum observed data-cell-count over multiple scrolls and assert it stays <= 2500.
2) Decide the promotion path:
   - Either add virtualization as an optional rendering mode to MatrixTableControl,
     OR extract a new reusable VirtualMatrixControl under src/ui/server/shared/isomorphic/controls/ui/.
   - Keep the existing non-virtual table renderer intact.
3) Add a production check:
   - If promoting into Place Hub Guessing, add a new SSR + Puppeteer check that asserts bounded DOM when rendering a large matrix.

Validation:
- node src/ui/lab/experiments/045-virtual-matrix-scroll/check.js
- (if you add tests) run the smallest focused checks first, then npm run test:by-path <targeted test file>

Constraints:
- Windows + Node only.
- Keep selectors stable via dom.attributes[...].
- Do not retire existing servers/scripts.
