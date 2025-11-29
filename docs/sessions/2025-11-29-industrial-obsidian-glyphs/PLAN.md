# Plan – Industrial Luxury Obsidian Glyphs

## Objective
Create reusable SVG primitives in theme

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- docs/diagrams/* (read-only) for palette + layout references
- design/decision-diamond.svg (new asset)
- design/arrow-chevrons.svg (new asset)
- design/status-box.svg (new asset)
- docs/sessions/2025-11-29-industrial-obsidian-glyphs/WORKING_NOTES.md (palette + commands)

## Risks & Mitigations
- Theme drift: pull gradient + stroke tokens directly from flagship Industrial Luxury Obsidian diagrams before drawing.
- Visual imbalance at tiny sizes: design using 64×64 or 96×96 viewboxes and verify legibility down to 24px.
- Missing documentation: capture palette + usage notes in WORKING_NOTES and summarize in SESSION_SUMMARY before closing.

## Tests / Validation
- Open each SVG in the browser to verify gradients, filters, and stroke widths render correctly on dark backdrops.
- Ensure `<title>` / `<desc>` metadata exists for accessibility in every new asset.
- Paste glyphs into data explorer dashboard mock to confirm colors match existing theme tokens.
