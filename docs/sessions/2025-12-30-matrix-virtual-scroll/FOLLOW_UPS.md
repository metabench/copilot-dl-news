# Follow Ups – Virtual scrolling matrix lab

- Strengthen Lab 045 correctness checks by sampling exact expected cells after multiple scroll offsets.
- Add a looped scroll test that asserts the maximum `data-cell-count` stays within budget (e.g. ≤ 2500).
- Prototype sticky-ish UX for headers/first column in the virtual renderer (if needed for production parity).
- Decide promotion route:
	- Add `mode: "virtual"` to `MatrixTableControl`, OR
	- Extract a reusable `VirtualMatrixControl` under `src/ui/server/shared/isomorphic/controls/ui/`.
- If promoted into Place Hub Guessing, add a production SSR + Puppeteer check that asserts bounded DOM when rendering a large matrix.
