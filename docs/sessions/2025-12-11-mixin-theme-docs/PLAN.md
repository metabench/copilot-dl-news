# Plan – Document mixin storage pattern

## Objective
Document push/each _store pattern for lab mixins and capture lessons for custom mixin design.

## Done When
- [ ] Lab README documents mixin storage pattern and references the theme mixin check.
- [ ] Agent guidance includes custom mixin storage note (push/each + _store) and server-safe pattern reminder.
- [ ] Theme mixin check remains green; evidence captured in WORKING_NOTES.md.
- [ ] Key deliverables noted in `SESSION_SUMMARY.md`; follow-ups (if any) logged in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- docs/sessions/2025-12-11-mixin-theme-docs/WORKING_NOTES.md
- docs/sessions/2025-12-11-mixin-theme-docs/SESSION_SUMMARY.md
- docs/sessions/2025-12-11-mixin-theme-docs/FOLLOW_UPS.md
- src/ui/lab/README.md
- .github/agents/🧠 jsgui3 Research Singularity 🧠.agent.md

## Risks & Mitigations
- Risk: Over-duplicating guidance across docs and agent file. Mitigation: Keep agent note concise and point to lab README for detail.
- Risk: Forgetting to note validation evidence. Mitigation: Capture check run output in WORKING_NOTES.md.

## Tests / Validation
- node src/ui/lab/experiments/004-theme-mixin/check.js
