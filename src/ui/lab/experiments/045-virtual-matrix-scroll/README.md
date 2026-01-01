# Lab 045 — Virtual Matrix Scroll

Status: **active**

## Goal
Prove a **large matrix** (thousands of rows/cols) can be rendered with **bounded DOM** using virtual scrolling.

This is a lab-only prototype to validate:
- viewport+buffer windowing
- deterministic scroll correctness checks
- axis flip (rows↔cols)

## What it demonstrates
- A single scroll container with a huge logical spacer.
- Only the visible cells (plus buffer) are rendered as absolutely positioned divs.
- Header overlays (row/col) are updated from the same window calculation.
- Deterministic attributes for tests:
  - `data-first-row`, `data-first-col`, `data-last-row`, `data-last-col`
  - `data-render-seq`

## Files
- `client.js` — `VirtualMatrixControl` + `VirtualMatrixLabPage`
- `check.js` — SSR assertions + Puppeteer scroll/flip + screenshots

## Run
- `node src/ui/lab/experiments/045-virtual-matrix-scroll/check.js`

## Notes
- This is intentionally not a `<table>`; it’s a scrollable grid of divs.
- If we later promote this, it likely becomes an alternate rendering mode in `MatrixTableControl` (or a sibling control) rather than replacing the current table renderer.
