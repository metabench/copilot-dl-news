# Working Notes – JSGUI3 Lab Tooling

- 2025-11-30 — Session created via CLI. Add incremental notes here.
- 2025-11-30 — Added `src/jsgui3-lab/utils/getJsgui.js` to load jsgui3-html or jsgui3-client based on env; updated SimplePanelControl to use it.
- 2025-11-30 — Created `ActivationHarnessControl` plus scenario script; verifies event wiring/detach via `tools/dev/jsgui3-event-lab.js`.
- 2025-11-30 — Implemented `tools/dev/jsgui3-event-lab.js` (jsdom) and `scripts/ui/capture-control.js` (Puppeteer) with initial CLI flags; validated both on lab controls.
