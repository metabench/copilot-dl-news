# Follow Ups – UI + UI Dev Process Improvements

## High priority

- Owner: 💡UI Singularity💡 — Implement `/theme` route + Theme Editor UI (build `ThemeEditorControl`, list themes, update default, live preview).
- Owner: 💡UI Singularity💡 — Add persistent Data Explorer header (breadcrumbs + quick actions + route index).
- Owner: 🔧 CLI Tool Singularity 🔧 — Add `ui:watch` workflow (CSS build + client build + server restart) and document the fastest “edit→see” loop.

## Medium priority

- Owner: 🗺️ UX Cartographer 🗺️ — Define “table UX contract” (sticky header, sorting, column chooser, row expansion) and map which screens use which features.
- Owner: 🛰️ Telemetry & Drift Sentinel 🛰️ — Add a lightweight control-count + render-timing budget check for key views.
- Owner: 🧬 Deterministic Testwright 🧬 — Add a scenario suite for 1–2 core Data Explorer flows (filters toggle, paging, theme switch) with deterministic DB fixture.

## Notes / Evidence commands to use

- Browser console capture: `node tools/dev/ui-console-capture.js --server="src/ui/server/dataExplorerServer.js" --url="http://localhost:4600"`
- Small SSR checks: `node src/ui/server/checks/dataExplorer.check.js`

- _Add actionable follow-ups here._
