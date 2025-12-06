# Plan – Deep jsgui3 Research for UI Singularity

## Objective
Deepen jsgui3 research to enable self-building UI capabilities (UI Singularity) via advanced shared controls and WYSIWYG foundations

## Done When
- [ ] **ConnectorControl**: Created and documented (SVG-based lines between controls).
- [ ] **ResizableControl**: Created and documented (Wrapper for resize handles).
- [ ] **WYSIWYG Demo App**: Created at `src/ui/server/wysiwyg-demo/` to validate "self-building" capabilities.
- [ ] **Isomorphic Verification**: Check scripts created and passing for all new controls.
- [ ] **Documentation**: `JSGUI3_UI_ARCHITECTURE_GUIDE.md` updated with new patterns.

## Change Set
- `src/ui/server/shared/isomorphic/controls/interactive/ConnectorControl.js` (New)
- `src/ui/server/shared/isomorphic/controls/interactive/ResizableControl.js` (New)
- `src/ui/server/wysiwyg-demo/` (New App)
- `docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md` (Update)

## Risks & Mitigations
- **Risk**: SVG connectors might be tricky to coordinate with HTML controls (z-index, positioning).
  - **Mitigation**: Use a dedicated SVG layer (CanvasControl) behind or on top of the HTML layer.
- **Risk**: `resizable` mixin might be client-side only.
  - **Mitigation**: Research mixin internals first; implement server-safe fallback if needed.

## Tests / Validation
- **Check Scripts**: `node src/ui/server/wysiwyg-demo/checks/connector.check.js`
- **E2E Tests**: Verify drag-and-drop and resizing in the demo app.
