# Working Notes – Industrial Luxury Obsidian Glyphs

- 2025-11-29 11:05 — Session created via CLI (`node tools/dev/session-init.js --slug "industrial-obsidian-glyphs"`).
- 2025-11-29 11:15 — Palette sampling:
	- `docs/diagrams/page-classification-decision-tree-architecture.svg` defines `obsidianBg` (#0a0f1a → #1a1f2e), `goldAccent` (#d4af37 → #b8931f), `decisionNode` (#334155 → #1e293b), `leafYes` (#166534 → #14532d), `leafNo` (#7f1d1d → #450a0a).
	- `docs/diagrams/decision-tree-engine-roadmap.svg` expands the theme with `steelGradient` (#4a5159 → #1a2028), `goldShine` (#5a4a0e → #f7e08a), `copperGlow` (#e69050 → #8b5a2b), and industrial patterns (`industrialGrid`, `diagonalHatch`).
	- Common strokes use #c9a227 at 1–2 px with 40–60% opacity for overlays; glows rely on `feGaussianBlur` + `feFlood` (#c9a227, 0.5 opacity).
	- Typography: Georgia/serif for headers, Inter for labels, JetBrains Mono for data callouts. Glyphs will omit text but keep consistent radii and stroke weight cues.
