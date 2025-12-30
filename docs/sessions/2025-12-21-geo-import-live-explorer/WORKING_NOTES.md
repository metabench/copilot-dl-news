# Working Notes – Live Geo Import Explorer (Incremental Graph UI)

## Repo anchors discovered
- `src/ui/server/decisionTreeViewer/isomorphic/controls/DecisionTreeControl.js`: DOM nodes + client activation, connection map.
- `src/ui/server/decisionTreeViewer/isomorphic/controls/ConnectionRenderer.js`: SVG overlay connection rendering with Bezier paths, arrows, labels; requestAnimationFrame usage.

This is a strong template for Phase B of the geo-import explorer (limited node count, high clarity).

## Commands run
- `node tools/dev/svg-collisions.js docs/sessions/2025-12-21-geo-import-live-explorer/ARCHITECTURE.svg --strict`

- 2025-12-21 — Session created via CLI. Add incremental notes here.
