# 020 — jsgui3-server activation + ctrl_fields

Status: **active**

## Goal
Prove (or falsify) that `jsgui3-server` can:

- Server-side render a page containing a custom control
- Serve a client bundle that auto-activates
- Hydrate:
  - persisted fields via `data-jsgui-fields`
  - control fields via `data-jsgui-ctrl-fields`

## What this experiment does
- Uses `jsgui3-server` to serve a minimal `Active_HTML_Document` (SSR).
- The document contains a custom control `ctrl_fields_demo`.
- The control renders:
  - `data-jsgui-fields` (persisted `{count}`)
  - `data-jsgui-ctrl-fields` mapping `{ status, btn }` to subcontrol ids
- On client activation, the control:
  - sets `data-activated="1"`
  - increments `data-count` when the button is clicked

## Files
- `client.js` — control definitions + registration into `jsgui.controls` (client bundle entry)
- `check.js` — starts a real server, fetches HTML, drives Puppeteer click verification

## Run
- `node src/ui/lab/experiments/020-jsgui3-server-activation/check.js`
