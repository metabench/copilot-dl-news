# Plan – JSGUI3 patterns diagram

## Objective
Add SVG diagram summarizing optimal jsgui3 patterns

## Done When
- [ ] SVG diagram added under `docs/diagrams/` outlining optimal jsgui3 patterns.
- [ ] Diagram highlights compose vs activate lifecycle, data-jsgui-control markers, body control event wiring, and SSR/client split.
- [ ] Notes captured in `WORKING_NOTES.md`; summary/follow-ups filed.

## Change Set (initial sketch)
- `docs/diagrams/jsgui3-patterns.svg` (new)
- Session docs in this folder

## Risks & Mitigations
- Overly busy diagram → keep 1-page, labeled clusters with concise text.
- Pattern drift vs repo practices → align with existing controls (compose + activate, data attributes, body control events).

## Tests / Validation
- Visual sanity check: SVG opens and renders correctly; labels readable.
