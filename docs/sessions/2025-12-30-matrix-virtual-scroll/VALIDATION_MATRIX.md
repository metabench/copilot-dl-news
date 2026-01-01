# Validation Matrix — Virtual Matrix Scrolling

## Fast checks
- `node src/ui/lab/experiments/045-virtual-matrix-scroll/check.js`
  - SSR assertions
  - Puppeteer scroll + flip
  - Screenshots written

## Evidence artifacts (expected)
- `screenshots/lab-045-virtual-matrix-default.png`
- `screenshots/lab-045-virtual-matrix-scrolled.png`
- `screenshots/lab-045-virtual-matrix-flipped.png`

## Runtime expectations
- Puppeteer test should finish and exit cleanly.
- DOM cell count should stay bounded (asserted).
