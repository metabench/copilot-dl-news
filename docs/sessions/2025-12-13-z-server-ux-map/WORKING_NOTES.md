# Working Notes – Z-Server UX  IPC Map

- 2025-12-13 — Session created via CLI. Add incremental notes here.

- 2025-12-13 — Made `z-server-ux-ipc-map.svg` pass `svg-collisions --strict` by removing a redundant guard-arrow label that overlapped other handler text.
- 2025-12-13 — Updated `tools/dev/svg-collisions.js` to ignore full-canvas background rects and stroke-only path/path overlaps (connectors), eliminating strict-mode false positives.
