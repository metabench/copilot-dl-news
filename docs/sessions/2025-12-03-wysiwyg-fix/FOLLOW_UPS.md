# Follow Ups – Fix WYSIWYG demo e2e

- Hydration is still noisy and `__ctrl` bindings may be missing; tighten jsgui activation for Canvas/Draggable so fallback drag handlers can be removed and console spam reduced.
- Add lightweight client-side check script for the WYSIWYG demo that asserts activation + draggable movement without needing Puppeteer.
- Coordinate with `docs/sessions/2025-12-03-jsgui3-deep-research-singularity/` once ConnectorControl/ResizableControl work proceeds to remove temporary fallbacks.
