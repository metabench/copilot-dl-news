# Plan – Memory + SVG Researcher Agent

## Objective
Create a new specialist researcher agent focused on docs-memory curation and SVG-editor-backed diagram documentation.

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

- [ ] New agent file exists under `.github/agents/` with correct frontmatter + workflows.
- [ ] Agent is registered in `.github/agents/index.json`.
- [ ] Agent validation tooling passes (frontmatter/links/handoffs).

## Change Set (initial sketch)
- `.github/agents/🧠📐 Memory + SVG Researcher 📐🧠.agent.md` (new)
- `.github/agents/index.json` (add entry)
- `docs/sessions/2025-12-14-memory-svg-researcher-agent/*` (plan/notes/summary)

## Risks & Mitigations
- _Note potential risks and how to mitigate them._

## Tests / Validation
- `node tools/dev/agent-files.js --validate --check-handoffs`
