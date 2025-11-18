# Working Notes — Diagram Atlas Async Loading

**Lifecycle**: Thicken (implementing async shell + controls with Tier 1 tooling)

## Context Imports
- Reviewed `AGENTS.md`, `.github/instructions/GitHub Copilot.instructions.md`, and the 💡Singularity Engineer💡 mode contract before starting.
- Read `docs/sessions/2025-11-16-diagram-atlas-e2e/*` previously to understand server/test history; will reference specifics as needed.

## Command Log
| Timestamp | Phase | Command | Notes |
| --- | --- | --- | --- |
| 2025-11-16T00:00 | Spec City | `node tools/dev/md-scan.js --dir docs/sessions --search "diagram atlas" --json` | Located prior Diagram Atlas session docs for reuse. |
| 2025-11-16T00:00 | Spec City | `node tools/dev/js-scan.js --what-imports src/ui/controls/DiagramAtlasControls.js --json` | Importer risk = LOW (single server entry point). |
| 2025-11-16T15:20 | Thicken | `node tools/dev/js-edit.js --file src/ui/controls/DiagramAtlasControls.js --dry-run --changes tmp/js-edit/diagram-atlas-controls-1.json --json` | Previewed new `DiagramProgressControl` batch insert; captured diff evidence. |
| 2025-11-16T15:23 | Thicken | `node tools/dev/js-edit.js --file src/ui/controls/DiagramAtlasControls.js --dry-run --changes tmp/js-edit/diagram-atlas-controls-1.json --fix --json` | CLI currently requires `--dry-run` flag even when applying; kept output for documentation. |
| 2025-11-16T15:25 | Thicken | `node -e "const BatchDryRunner=require('./tools/dev/js-edit/BatchDryRunner'); ..."` | Manual invocation of `BatchDryRunner` to apply change set + write file (until `--from-plan` path lands). |
| 2025-11-16T15:40 | Thicken | `node tools/dev/js-scan.js --what-imports src/ui/server/diagramAtlasServer.js --json` | Verified importer list (check script + jest suites) before restructuring server route. |
| 2025-11-16T16:05 | Thicken | `npm run test:by-path tests/server/diagram-atlas.e2e.test.js` | Ensured async shell + ?ssr=1 snapshot path behaves as expected. |

## Findings & TODO Capture
- Need to introduce a loading/progress control that can render server-side (initial static state) and animate client-side once JS boots.
- `DiagramProgressControl` now exists inside `src/ui/controls/DiagramAtlasControls.js`; exports updated for client/server reuse. Need to wire into server shell next.
- `DiagramProgressControl` now exists inside `src/ui/controls/DiagramAtlasControls.js`; exports updated for client/server reuse. Shell now renders this control plus inline config (`window.__DIAGRAM_ATLAS__`).
- Diagram Atlas server now serves a lightweight shell by default (`/diagram-atlas` defers data fetch to `/api/diagram-data`), with `?ssr=1` opt-in for full SSR snapshots.
- Client bundle bootstrap includes a new hydration pipeline (DOM builders for code/db/feature sections, diagnostics updater, error handling) keyed off `data-role` + `data-metric` attributes.
- Existing `DiagramAtlasControls` likely handles full render; plan is to split into shell + client hydration.
- Async fetch should reuse `/api/diagram-data`; might add streaming/progress updates later but start with coarse state.
- Shell idea: keep diagnostics + sections containers but send blank placeholders plus new `DiagramProgressControl` instance rendered via jsgui so SSR output stays consistent.
- Client bundle will handle fetch → render by constructing DOM nodes (no jsgui dependency) from the JSON payload, leaving `renderDiagramAtlasHtml` in place for CLI checks.
- Add `/diagram-atlas` static assets hook + script tag to load `/assets/ui-client.js`; rely on existing esbuild output.

## Open Questions
- Should data fetch be chunked or single shot? (Likely single for now.)
- Do we keep SSR fallback for bots? Maybe render basic snapshot after fetch completes server-side when `?ssr=1`? (Defer unless requirement emerges.)

## Next Steps
1. Map current diagram atlas server rendering path (control tree, data injection) — confirm where to hook shell.
2. Design the new loading control API (props for state text, percent, failure, and animation hooks).
3. Update client bundle entry to hydrate shell + fetch data.
4. Extend e2e test to assert new behavior.

(Notes will be updated as phases progress.)