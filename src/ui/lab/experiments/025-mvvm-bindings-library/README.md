# Experiment 025: MVVM Bindings Library

Status: active

## Purpose

Create a tiny, reusable “bindings helper” layer for jsgui3 MVVM demos in this repo, so experiments (and later UI features) don’t repeat manual `model.on('change', ...)` glue for:

- model → view model propagation
- view model → DOM updates (text + attributes)
- predictable cleanup patterns

## What this experiment demonstrates

- A small helper module in `src/ui/lab/utilities/mvvmBindings.js`
- SSR → client activation with persisted fields (encoded `Data_Object(...)`)
- MVVM propagation using `bindModelToModel(...)`
- DOM binding using `bindText(...)` + `bindAttribute(...)`

## Files

- `client.js` — demo page + control
- `check.js` — deterministic SSR + Puppeteer activation/click assertions
- `../../utilities/mvvmBindings.js` — binding helpers (shared)

## Run

- `node src/ui/lab/experiments/025-mvvm-bindings-library/check.js`
