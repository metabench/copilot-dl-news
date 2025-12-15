# Experiment 021 — Data_Model server→client bridge (MVC)

**Status**: active

## Goal

Demonstrate that **Data_Model-encoded state** can cross **SSR → client activation** and rehydrate into a working `Data_Object` model that sits “behind” a view.

This experiment uses an **MVC style**:
- **Model**: `this.data.model` (`Data_Object`)
- **View**: DOM nodes (status label)
- **Controller**: click handler mutating the model

## Hypothesis

1) We can encode a `Data_Object` on the server using `toJSON()` (which yields a string like `Data_Object({...})`).
2) We can ship that encoded string via the SSR bridge (`data-jsgui-fields`).
3) On the client, activation hydrates `data-jsgui-fields` into `_persisted_fields`, allowing us to decode and populate a live `Data_Object`.

## What to look for (low-level)

- `Data_Model_View_Model_Control` writes `data-jsgui-data-model=<id>` attributes, but `Data_Object` ids are **not** registered in `context.map_controls`, so reconnect-by-id is likely broken/noisy. This is a candidate upstream fix.

## Run

- `node src/ui/lab/experiments/021-data-model-mvc/check.js`

## Files

- `client.js` — controls + SSR bridge + MVC wiring
- `check.js` — deterministic SSR + Puppeteer validation
