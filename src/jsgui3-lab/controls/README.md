# jsgui3 Lab Controls

This folder hosts reusable, well-documented jsgui3 controls that are **ready to be dropped into other parts of this project** and, with minimal adjustments, into other jsgui3-based apps.

Each control here should:
- Be self-contained and follow the patterns from `docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md`.
- Have a small `checks/*.check.js` or scenario script that renders or exercises it in isolation.
- Document any assumptions (server-only, client-only, isomorphic).

Current controls:
- `SimplePanelControl` – Basic panel layout used as a drop-in wrapper for dashboard sections.
- `ActivationHarnessControl` – Test-focused control that exposes event wiring and lifecycle logging for use with `tools/dev/jsgui3-event-lab.js`.
- `ColorSelectorControl` – Palette + variant UI for experimenting with colour workflows before shipping to product surfaces.
