# Plan – Agent memory badge continuation phrasing

## Objective
Update agent files to use a continuation-friendly memory retrieval badge and include 'Back to the task: '

## Done When
- [x] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [x] Tests and validations are captured in `WORKING_NOTES.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `AGENTS.md`
- `.github/agents/*.agent.md` (memory badge propagation + cleanup of outer ```chatagent fences)
- `docs/sessions/2025-12-14-memory-badge-continuation/*`

## Risks & Mitigations
- Risk: inconsistent wording across agents → mitigate by using the same 2-line snippet everywhere.
- Risk: agent files fail validation due to frontmatter formatting → mitigate by running `node tools/dev/agent-files.js --validate --check-handoffs`.

## Tests / Validation
- `node tools/dev/mcp-check.js --quick --json`
- `node tools/dev/agent-files.js --validate --check-handoffs`
