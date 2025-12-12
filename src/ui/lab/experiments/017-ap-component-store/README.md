# Experiment 017 — Art Playground: Pure Component Store

Status: **proposed**

## Goal
Extract a pure (DOM-free) component store that can back the Canvas.

Why this matters for Art Playground:
- Enables undo/redo without coupling to SVG DOM.
- Makes selection + layers logic testable in Node.
- Clarifies the public API between UI controls (Canvas, Properties, Status).

## Hypothesis
A small `ComponentStore` can provide:
- add/select/update/delete
- selection data projection
- layers projection (topmost-first)

## Deliverables
- `check.js` validates core operations and type-specific rules.

## Promotion candidate
If validated, promote into `src/ui/server/artPlayground/isomorphic/` (or a shared UI model folder) and have `CanvasControl` delegate state to it.
