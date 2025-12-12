# Plan – Fix AGI-Orchestrator agent frontmatter

## Objective
Verify and correct AGI-Orchestrator.agent.md parsing/tool metadata while preserving intent

## Done When
- [ ] `AGI-Orchestrator.agent.md` frontmatter uses the repo’s tool-id conventions and loads without host UI errors.
- [ ] Validation evidence + commands captured in `WORKING_NOTES.md`.
- [ ] `SESSION_SUMMARY.md` explains what was wrong, what changed, and why.

## Change Set (initial sketch)
- `.github/agents/AGI-Orchestrator.agent.md`
- `docs/sessions/2025-12-12-fix-agi-orchestrator-agent/{PLAN,WORKING_NOTES,SESSION_SUMMARY}.md`

## Risks & Mitigations
- Risk: confusion between the display fence ```chatagent (tool output) vs literal file content.
	- Mitigation: rely on `grep_search` / validator parse rather than visual fence markers.
- Risk: PowerShell output redirection writes UTF-16LE by default, confusing JSON parsing.
	- Mitigation: decode redirected files as UTF-16LE or avoid `>` redirection when machine-parsing JSON.

## Tests / Validation
- Run `node tools/dev/agent-validate.js --dir .github/agents --json` and confirm:
	- `AGI-Orchestrator` reports `errors: 0, warnings: 0`.
	- (Note) Redirected JSON will be UTF-16LE when using PowerShell `>`.
