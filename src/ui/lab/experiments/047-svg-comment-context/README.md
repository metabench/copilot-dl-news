# Experiment 047: SVG Comment Context

**Status**: Active

## Hypothesis
We can isolate the `CommentBubble` and `ContextLink` logic from the main `docs-viewer` application into standalone, reusable `jsgui3` controls.
This separation allows for:
1.  Easier testing of geometry and linking logic.
2.  Reuse across different applications (e.g., the future `agent-lab`).
3.  Simpler maintenance of the SVG interactions.

## Components
-   `CommentBubble.js`: The visual comment marker and popup.
-   `ContextLink.js`: The connector line between comment and target element.
-   `SvgOverlayLayer.js`: A manager control to handle these overlays on top of an SVG.

## Goals
1.  Extract logic from `docsViewer/client.js`.
2.  Run valid `check.js` showing interactive comments on a dummy SVG.
3.  Verify "Magnet" linking logic works in isolation.
