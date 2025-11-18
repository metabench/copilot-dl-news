# Plan: diagram-atlas-byte-polish
Objective: polish the diagram atlas presentation and scale code tiles by actual file byte sizes so SSR + hydration remain aligned.

Done when:
- diagram-data CLI emits per-file byte sizes and diagram data service returns them
- code section tiles map their area to byte size with reasonable scaling + tooltips show byte metrics
- shell/controls gain the requested presentation refinements (header, refresh affordance, diagnostics tweaks)
- diagram atlas check + server e2e still pass and hydration stays intact

Change set:
- tools/dev/diagram-data.js (byte stats, metadata)
- src/ui/server/services/diagramDataService.js (ensure new fields propagate if needed)
- src/ui/controls/diagramAtlasControlsFactory.js (tile sizing, UI polish)
- src/ui/client/index.js (refresh handling, diagnostics messaging)
- docs/sessions/2025-11-21-jsgui3-isomorphic-diagram-polish (journal/notes as needed)

Risks/assumptions:
- js-scan build-index output might omit files we need; fall back to fs.stat for bytes
- large byte ranges need log scaling to keep small files visible
- hydration uses shared controls; keep DOM/class additions deterministic

Tests:
- node deprecated-ui-root/diagram-atlas.check.js
- npm run test:by-path tests/server/diagram-atlas.e2e.test.js

Docs to update:
- docs/sessions/SESSIONS_HUB.md entry + session notes upon completion
