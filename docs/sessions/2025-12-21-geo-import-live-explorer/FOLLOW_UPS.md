# Follow Ups – Live Geo Import Explorer (Incremental Graph UI)

- Implement a minimal in-process geo-import EventBus (node/edge/stage events) and integrate it into the current geo import execution path.
- Add `GET /api/geo-import/explorer/stream` (SSE) with batching/dedupe and reconnect support (`sinceSeq`).
- Add pull APIs: `/explorer/node`, `/explorer/neighbors`, `/explorer/search` for on-demand exploration.
- Build `GeoImportLiveExplorerControl` (jsgui3) with a split layout: canvas on right, details panel + filters.
- Renderer Phase B: DOM nodes + SVG overlay (copy patterns from decisionTreeViewer ConnectionRenderer); hard caps and importance scoring.
- Add a small check script under `src/ui/server/geoImport/checks/` to render the explorer UI in isolation.
- Add focused Jest tests for event batching/dedupe and GraphStore visibility rules (caps + scoring).
