# Lab 046 — VirtualMatrixControl Smoothness

Status: **active**

## Goal
Validate and improve the **production** `VirtualMatrixControl` behavior (the server-rendered control with an embedded init script):
- Smooth scrolling without unnecessary DOM churn
- Bounded DOM size under large logical matrices
- Correct re-windowing on scroll
- Correct re-windowing on resize (viewport size change)

## Why this exists (vs Lab 045)
- Lab 045 proves the *concept* using a dedicated client-side control.
- Lab 046 tests the *actual promoted implementation* (`src/ui/server/shared/isomorphic/controls/ui/VirtualMatrixControl.js`).

## Run
- `node src/ui/lab/experiments/046-virtual-matrix-control-smoothness/check.js`

## What it asserts
- `data-vm-ready=1` after init
- `data-cell-count` stays within a budget
- A small scroll that does not cross a row/col boundary does **not** increment `data-render-seq`
- A scroll that crosses a boundary **does** increment `data-render-seq`
- Resizing the viewport triggers a re-windowing render
