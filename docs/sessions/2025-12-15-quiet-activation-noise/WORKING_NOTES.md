# Working Notes – Silence jsgui activation noise

- 2025-12-15 — Session created via CLI.

## Goal
- Suppress noisy activation logs in browser console (notably `pre_activate`/`activate` traces and generic-fallback messages) without hiding real errors.

## Changes
- Added a browser-only console filter and installed it early in the main UI client bundle.
- Installed the same filter in lab client bundles used by the deterministic Puppeteer harness.
- Gated the one-time `[copilot] context.map_Controls keys` log behind `window.__COPILOT_UI_DEBUG__ === true`.

## Commands / Evidence
- Built main UI client bundle:
	- `npm run ui:client-build`
- Ran lab checks (defaults used by the lab runner / key repro harness):
	- `node src/ui/lab/run-lab-checks.js --ids 025,026,027,028`

## Observations
- Labs 025–028 all passed.
- Browser logs for labs 027/028 were reduced to a single expected line (`client.js window onload`), with no `jsgui html-core pre_activate` spam.
