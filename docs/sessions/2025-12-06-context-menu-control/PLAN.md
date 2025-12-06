# Plan – Shared Context Menu Control

## Objective
Add isomorphic context menu control usable in Electron + SSR

## Done When
- [ ] ContextMenuControl is implemented in shared isomorphic UI controls and exported via category indexes.
- [ ] Keyboard/mouse interactions work (open at coordinates, click/escape to close, arrow navigation, item select event).
- [ ] Usage doc stub added to plan notes or WORKING_NOTES.

## Change Set (initial sketch)
- src/ui/server/shared/isomorphic/controls/ui/ContextMenuControl.js
- src/ui/server/shared/isomorphic/controls/ui/index.js
- src/ui/server/shared/isomorphic/controls/index.js
- docs/sessions/2025-12-06-context-menu-control/WORKING_NOTES.md (notes)

## Risks & Mitigations
- Event leak from global listeners — ensure attach/detach lifecycle cleanup.
- Position overflow on small viewports — clamp coordinates when window available.
- Agent discoverability — export from both ui index and top-level shared controls index.

## Tests / Validation
- Manual: instantiate control in a small harness (WORKING_NOTES snippet) and verify arrow/escape/click behavior in browser.
- JSON-free check: ensure module loads server-side without window (guarded reposition logic).
