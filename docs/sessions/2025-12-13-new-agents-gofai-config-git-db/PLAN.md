# Plan – Add four specialist agents

## Objective
Create four new agent files and register them in the agents index.

## Done When
- [x] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [x] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md` (if any).

## Change Set (initial sketch)
- `.github/agents/🧬 GOFAI Plugin Implementer 🧬.agent.md`
- `.github/agents/🧱 Config Schema Gatekeeper 🧱.agent.md`
- `.github/agents/🧹 Git Hygiene Janitor 🧹.agent.md`
- `.github/agents/🧩 DB Injection Wrangler 🧩.agent.md`
- `.github/agents/index.json`
- `docs/sessions/2025-12-13-new-agents-gofai-config-git-db/*`

## Risks & Mitigations
- _Note potential risks and how to mitigate them._

## Tests / Validation
- Validate `.github/agents/index.json` parses as JSON.
- Confirm expected repo changes via `git status -sb`.
