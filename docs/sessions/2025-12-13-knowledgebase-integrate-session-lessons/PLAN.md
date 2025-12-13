# Plan – Integrate session lessons into knowledgebase

## Objective
Consolidate repeated session learnings (especially jsgui3 client-side activation) into canonical docs and add short routing pointers.

## Done When
- [ ] Canonical “activation” guidance is accurate and centralized (no duplicate mini-guides).
- [ ] `AGENTS.md` and `docs/INDEX.md` point to the canonical activation section.
- [ ] Key historical sessions link to the canonical section (so readers land in the right place first).
- [ ] Work is summarized in `SESSION_SUMMARY.md` with links to edited docs.

## Change Set (initial sketch)
- docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md (canonical activation + registries + readiness signals)
- AGENTS.md (routing pointer)
- docs/INDEX.md (terminology alignment)
- docs/sessions/2025-11-15-control-map-registration/CONTROL_MAP.md (pointer)
- docs/sessions/2025-11-20-client-activation/WORKING_NOTES.md (pointer)

## Risks & Mitigations
- Risk: mis-stating jsgui3 internals (`map_controls` vs `map_Controls`).
	- Mitigation: tie guidance to observed repo code and historical sessions; keep claims scoped.
- Risk: documentation sprawl.
	- Mitigation: update the existing canonical UI guide; add pointers instead of duplicating content.

## Tests / Validation
- Spot-check that the activation guide changes match the real implementation expectations (`context.map_controls` instances vs `context.map_Controls` constructors).
- Verify that links from `AGENTS.md`, `docs/INDEX.md`, and the referenced sessions resolve to the activation section.
