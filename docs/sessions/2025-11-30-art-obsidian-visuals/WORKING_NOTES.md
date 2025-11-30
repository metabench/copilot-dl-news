# Working Notes – Art Playground Obsidian UI

- 2025-11-30 — Session created via CLI. Add incremental notes here.
- 2025-11-30 — Audited current Art Playground stack (`ArtPlaygroundAppControl`, `ToolbarControl`, `CanvasControl`, `SelectionHandlesControl`, `art-playground.css`).
	- Canvas currently stores component metadata in-memory and lacks outward events → plan to raise `selection-change` + `component-updated` payloads so other controls (property panel) can subscribe.
	- Visual system already defines “Luxury White Leather / Obsidian” palette variables; will extend with gradients, glass blur tokens, and property panel specific tokens.
	- Property scope for MVP: curated fill palette, accent gradient toggles, stroke thickness preset, opacity slider, glow toggle. Each action will call new `updateSelectedProperties` on `CanvasControl`.
	- Layout target: toolbar stays on top, below it a flex row with canvas (grow) and 320px property column. Need to ensure DOM order aligns with server + client wiring.
