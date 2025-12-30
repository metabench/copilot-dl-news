# Plan – Live Geo Import Explorer (Incremental Graph UI)

## Objective
Design the features and integration needed to explore geo data live while it imports, with progressive graph/tree rendering and high-performance summarization.

## Done When
- [ ] A concrete event model is specified (node/edge/stage + required fields).
- [ ] Streaming + pull APIs are sketched (SSE + detail queries).
- [ ] Rendering strategy is scoped for “limited data” (DOM+SVG) and future WebGL.
- [ ] Performance constraints/heuristics are defined (caps, LOD rules, summarisation).
- [ ] Deliverables are summarised in `SESSION_SUMMARY.md` and follow-ups captured.

## Change Set (initial sketch)
- docs/sessions/2025-12-21-geo-import-live-explorer/DESIGN.md
- docs/sessions/2025-12-21-geo-import-live-explorer/ARCHITECTURE.svg
- docs/sessions/2025-12-21-geo-import-live-explorer/SESSION_SUMMARY.md
- docs/sessions/2025-12-21-geo-import-live-explorer/FOLLOW_UPS.md

## Risks & Mitigations
- Risk: streaming too many events overwhelms the browser → Mitigation: server-side batch+dedupe + hard caps in GraphStore.
- Risk: UI shows misleading “loading” state → Mitigation: tie overlays to existing stage/progress-tree ids.
- Risk: graph layout thrashes → Mitigation: incremental layout only for visible set + requestAnimationFrame scheduling.

## Tests / Validation
- Run `node tools/dev/svg-collisions.js docs/sessions/2025-12-21-geo-import-live-explorer/ARCHITECTURE.svg --strict`
- Ensure docs are readable and reference real module boundaries.
