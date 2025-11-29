# Working Notes – JSGUI3 patterns diagram

- 2025-11-29 — Session created via CLI. Add incremental notes here.
- Diagram focus: compose on server + SSR markers, client activation/hydration via data-jsgui-control, body control for global events (close on Escape/outside), and patterns (context menus, compose vs activate, checks). SVG updated with gradient background, legend, clearer grouping, and arrows in `docs/diagrams/jsgui3-patterns.svg`.
- Validation: XML parse failed due to unescaped `&` in "layout & props"; escaped to `&amp;` and revalidated (ElementTree) → OK.
