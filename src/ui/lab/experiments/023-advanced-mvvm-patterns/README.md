# Experiment 023 — Advanced MVVM Patterns (staged edits, computed, safe two-way)

**Status**: active

## Goal
Explore more complex MVVM patterns on top of jsgui3 in a way that remains robust even when some platform pieces are incomplete.

This experiment demonstrates:
- **Staged edits** (draft view model that only commits to data model on Apply)
- **Computed properties** (`fullName`, `canApply`) driven by model change events
- **Watchers** to keep DOM in sync
- A **"safe" two-way binding helper** that uses `model.set()` (not raw property assignment) to ensure change events fire

## Why "safe" binding?

`ModelBinder` currently assigns via `targetModel[targetProp] = value`, which may not emit `change` events on `Data_Object` in all cases. This lab treats that as a "platform not guaranteed" area and builds a reliable binding primitive on top.

## Run

- `node src/ui/lab/experiments/023-advanced-mvvm-patterns/check.js`

## Files

- `client.js` — MVVM control + page
- `check.js` — deterministic SSR + Puppeteer validation
