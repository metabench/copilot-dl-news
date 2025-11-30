# Plan – Art Playground Resize Investigation

## Objective
Understand why selection handles + jsgui3 resizable mixin fail

## Done When
- [ ] Root cause for non-working resize handles is identified (jsgui3 resizable mixin vs our SelectionHandles logic).
- [ ] Minimal reproduction or fix implemented (either enabling jsgui3 draggable/resizable mixins or patching our overlay math) and validated interactively.
- [ ] Findings captured in session docs with actionable follow-ups.

## Change Set (initial sketch)
- `src/ui/server/artPlayground/isomorphic/controls/SelectionHandlesControl.js` – inspect/patch event dispatch, pointer math.
- `src/ui/server/artPlayground/isomorphic/controls/CanvasControl.js` – evaluate resize event plumbing.
- `node_modules/jsgui3-html` (read-only) – research resizable mixin + Window control references.
- `docs/sessions/2025-11-30-art-resize/*` – notes + summary.

## Risks & Mitigations
- Mixing custom drag math with built-in jsgui3 mixins could cause conflicts → prototype within lab harness before merging.
- Touching shared controls might regress selection behavior → add manual verification and targeted logs.

- Manual MCP session to drag resize handles and confirm shape dims update.
- Optional: `tools/dev/jsgui3-event-lab.js` scenario to simulate resize events once behavior is wired.
