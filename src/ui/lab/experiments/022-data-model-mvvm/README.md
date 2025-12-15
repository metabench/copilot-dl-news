# Experiment 022 — Data_Model server→client bridge (MVVM)

**Status**: active

## Goal

Demonstrate that **Data_Model-encoded state** can cross **SSR → client activation** and rehydrate into a working model that powers a view via **two-way bindings** using the jsgui3 `ModelBinder` / `bind()` API.

This experiment uses an **MVVM style**:
- **Model**: `this.data.model` (Data_Object)
- **View Model**: `this.view.data.model` (Data_Object)  
- **View**: DOM nodes bound via `ModelBinder`
- Controller logic is minimized; the binding layer propagates changes.

## Hypothesis

1) `Data_Model_View_Model_Control` creates a separate view model (`this.view.data.model`) from the data model via `ensure_control_models`.
2) We can bind properties between data model and view model using `ModelBinder` (or the control's `.bind()` helper).
3) When the data model changes, the view model reflects the change, and vice versa.
4) The DOM reflects view model state automatically.

## What to look for (low-level)

- `ModelBinder` listens for `change` events on source/target models and propagates mapped properties.
- `bind()` accepts a binding spec like `{ source: 'data.model', target: 'view.data.model', map: { count: 'displayCount' } }`.
- View model→DOM binding still requires manual wiring (no automatic DOM sync yet).

## Run

- `node src/ui/lab/experiments/022-data-model-mvvm/check.js`

## Files

- `client.js` — controls + SSR bridge + MVVM wiring
- `check.js` — deterministic SSR + Puppeteer validation
