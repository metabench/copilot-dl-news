# Discoveries – JSGUI3 Lab Tooling

- `tools/dev/jsgui3-event-lab.js` can hydrate lab controls entirely inside jsdom as long as `JSGUI3_USE_CLIENT=1` and `rec_desc_ensure_ctrl_el_refs` is invoked before `activate()`.
- Activation-specific controls should hydrate DOM references when instantiated with `spec.el`; `_hydrateReferences` keeps the same code working for compose + activation paths.
- Puppeteer’s `page.setContent` plus `scripts/ui/capture-control.js` gives sub-second screenshots without needing Express; it’s ideal for CI snapshots of lab controls.
