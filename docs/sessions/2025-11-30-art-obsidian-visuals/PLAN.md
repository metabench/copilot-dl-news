# Plan – Art Playground Obsidian UI

## Objective
Improve visual property options with an Obsidian-inspired luxury panel and property controls.

## Done When
- [ ] A dedicated Properties Panel control exists with curated palette + sliders and is wired to canvas selections.
- [ ] Canvas emits selection/property events and applies inbound property updates from the panel.
- [ ] Toolbar + canvas layout incorporates the panel with updated CSS that matches the “obsidian industrial luxury” motif.
- [ ] Session docs (NOTES + SUMMARY + FOLLOW_UPS) capture outcomes/tests.

## Change Set (initial sketch)
- `src/ui/server/artPlayground/isomorphic/controls/ArtPlaygroundAppControl.js` – add split layout + panel wiring.
- `src/ui/server/artPlayground/isomorphic/controls/CanvasControl.js` – expose selection data + property mutation API.
- `src/ui/server/artPlayground/isomorphic/controls/ToolbarControl.js` – ensure tool state flows with new layout (minor styling hooks).
- `src/ui/server/artPlayground/isomorphic/controls/PropertiesPanelControl.js` (new) – UI for color / stroke / glow controls.
- `src/ui/server/artPlayground/client.js` – register/activate new control on the client.
- `src/ui/server/artPlayground/public/art-playground.css` – luxury palette, layout grid, control styling.
- `docs/sessions/2025-11-30-art-obsidian-visuals/WORKING_NOTES.md` + `SESSION_SUMMARY.md` + `FOLLOW_UPS.md` – capture work + next steps.

## Risks & Mitigations
- **Event sync bugs between panel and canvas** → keep updates centralized via `CanvasControl.updateSelectedProperties()` and add logging in dev console.
- **Theme regressions** → leverage CSS variables and test across dark/light surfaces before shipping.
- **Bundled assets drift** → rebuild via `node scripts/build-art-playground-client.js` once source changes land.

## Tests / Validation
- Manual: run `node scripts/build-art-playground-client.js`, start server, interact with palette sliders (verify immediate SVG updates).
- Visual capture: reuse existing Playwright/Invoke-WebRequest snapshot pipeline if time allows.
- Document verified steps + screenshots in `WORKING_NOTES.md`.
