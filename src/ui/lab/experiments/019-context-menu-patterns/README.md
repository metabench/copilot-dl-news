# Experiment 019: Context Menu Patterns

This experiment validates the standard pattern for implementing context menus in jsgui3/DOM.

## Objectives
- Verify event delegation for `contextmenu` events.
- Verify positioning logic (viewport clamping).
- Verify dismissal logic (click outside, Escape key).
- Verify cleanup (removing global listeners).

## Pattern
1. Listen for `contextmenu` on the target element (or delegated container).
2. `preventDefault()` to stop native menu.
3. Create/show menu element at `clientX`/`clientY`.
4. Add temporary global listeners for `click` and `keydown` (Escape).
5. Remove menu and listeners on dismissal.
