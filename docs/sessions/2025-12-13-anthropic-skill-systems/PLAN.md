# Plan – Anthropic skill systems vs Copilot

## Objective
Research Anthropic skill systems and map learnings to Copilot agents + MCP memory improvements

## Done When
- [ ] Research memo captured in `WORKING_NOTES.md` (what Skills/Subagents are; how they map here).
- [ ] Concrete, ranked proposals captured in `SESSION_SUMMARY.md`.
- [ ] Follow-ups with named owners captured in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `docs/sessions/2025-12-13-anthropic-skill-systems/*`
- `docs/agi/journal/2025-12-13.md`
- (Optional) `docs/agi/LESSONS.md` — append 1–2 durable lessons

## Risks & Mitigations
- Risk: Over-rotating on a Claude Code feature that is not available in VS Code Copilot.
	- Mitigation: Treat “Skills” as a *design pattern* (packaged capability + triggers + scripts + progressive disclosure) and implement as docs + MCP affordances.
- Risk: “Automatic” skill invocation is hard to replicate.
	- Mitigation: Provide explicit discovery surfaces (MCP tools + optional UI), plus “hint” fields in MCP responses.
- Risk: Capability sprawl (too many pseudo-skills with overlapping scopes).
	- Mitigation: Use a single registry/index and enforce focused scopes + trigger phrases.

## Tests / Validation
- Evidence: Links to the relevant Claude docs pages in `WORKING_NOTES.md`.
- Validation: N/A (docs-only session).
