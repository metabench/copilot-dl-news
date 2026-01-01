# Experiment 044 — MatrixTableControl (rotated headers + flip axes)

Status: active

## Goal
Create a reusable, isomorphic matrix/table control that can be embedded in server dashboards, while keeping a repeatable lab workflow for:
- rotated column headers (45°)
- truncation with `…` + tooltip
- flipping axes (rows ↔ cols)
- deterministic SSR + Puppeteer verification

This experiment follows patterns from:
- `020-jsgui3-server-activation` (real `jsgui3-server`, client bundle, activation assertions)
- `026-activation-contract-lab` (activation invariants + log noise filtering)

## Run
- `node src/ui/lab/experiments/044-matrix-table-control/check.js`

## Files
- `client.js`
  - Defines `matrix_table_lab_page` + `matrix_table_lab_control`
  - Uses `MatrixTableControl` from shared isomorphic controls
  - Client activation binds the “Flip axes” button
- `check.js`
  - Starts a real `jsgui3-server` instance
  - Verifies SSR markers (types + test ids)
  - Uses Puppeteer to click “Flip axes”
  - Takes screenshots before/after

## Notes
- The matrix/table markup comes from `src/ui/server/shared/isomorphic/controls/ui/MatrixTableControl.js`.
- Styling is currently page-provided (CSS in `client.js`). If we see repeated CSS across dashboards, that’s a signal to extract shared styling (or add `includeDefaultStyles`).
