# Plan – SVG/HTML theming workflows

Mode: 📐 SVG Spatial Reasoning Specialist 📐 (GPT-5.1-Codex-Max (Preview) via GitHub Copilot)

## Objective
Add MCP + docs for theme storage, retrieval, and generation across SVG/HTML/jsgui3

## Done When
- [ ] Theme schema + storage workflow exists for SVG/HTML/jsgui3 (file + memory MCP) with examples.
- [ ] Tooling hooks or scripts allow retrieving/applying themes in svg-mcp and memory MCP.
- [ ] Docs include quickstart + workflow for generating themed UIs/diagrams.
- [ ] Tests/validations captured in WORKING_NOTES.md; follow-ups captured in FOLLOW_UPS.md.

## Change Set (initial sketch)
- docs/sessions/2025-12-10-svg-theme-workflows/ (plan, notes, summary, follow-ups)
- tools/dev/ (potential theme registry/storage utilities for MCP)
- docs/workflows/ or docs/guides/ (theming workflow + memory integration)

## Risks & Mitigations
- Theme scope creep across UI stacks → keep schema minimal and extensible; document constraints.
- Collisions with existing SVG tooling → reuse svg-mcp interfaces and validate with checks.
- Memory MCP persistence unclear → document storage strategy and provide fallbacks to file-based themes.

## Tests / Validation
- Run `node tools/dev/svg-mcp-tools.check.js` after changes touching svg-mcp.
- Spot-check theme retrieval/apply flows via sample commands or scripts noted in WORKING_NOTES.md.
