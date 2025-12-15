# Experiment 026: Activation Contract Lab

Status: active

## Purpose

Make client-side activation failures *obvious and testable* by enforcing a simple contract:

- Every element with `data-jsgui-id` must also have `data-jsgui-type`
- Every `data-jsgui-type` used in SSR must have a client constructor registered (so activation doesn’t fall back to a generic `Control`)
- Every custom control’s `activate()` must actually run (verified via attributes)

## What this experiment demonstrates

- A page with a small tree of custom controls (`activation_contract_panel` + repeated `activation_contract_leaf`)
- Persisted fields + ctrl_fields in the leaf control
- A client-side contract report exposed as `window.__activation_contract_report`
- A Puppeteer check that fails on missing type/constructor and common activation warning strings

## Files

- `client.js` — demo page + controls
- `check.js` — deterministic SSR + Puppeteer activation/click assertions

## Run

- `node src/ui/lab/experiments/026-activation-contract-lab/check.js`
