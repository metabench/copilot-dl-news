# Working Notes

## Inputs Reviewed
- `.github/instructions/GitHub Copilot.instructions.md`
- `AGENTS.md`
- `docs/AGENT_TOOLING_ENHANCEMENT_STRATEGY.md`
- Repository root listing (focus on `.md` files)

## CLI / Tooling Commands
- `Move-Item` (PowerShell) to relocate each root-level doc into `docs/` (see command history via session summary)

## Findings / Decisions
- Need to ensure all documentation artifacts move under `docs/` unless explicitly required at root (e.g., `README.md`).
- Prioritize files with `AGENT_*.md`, `ANALYSIS_*.md`, `SESSION_*`, `TOOLING_*`, etc.
- Current root-level `.md` candidates for relocation (excluding canonical `README.md` and `AGENTS.md` hub):
	- `AGENTS copy.md`
	- `AGENTS_NEW.md`
	- `AGENTS_OLD.md`
	- `AGENT_TOOLING_ENHANCEMENTS_PROPOSAL.md`
	- `ANALYSIS_COMPLETE_SUMMARY.md`
	- `CHANGE_PLAN.md`
	- `CHANGE_PLAN_JSEDIT_WITH_CODE.md`
	- `CLI_REFACTORING_TASKS.md`
	- `RESTRUCTURING_PROPOSAL.md`
	- `SESSION_SUMMARY_2025-11-13.md`
	- `TEST_RUNNER_UPDATE_COMPLETE.md`
	- `TEST_RUNNER_UPDATE_SUMMARY.md`
	- `TOOLING_ENHANCEMENTS_SUMMARY.md`
	- `TOOLS_DEPENDENCY_REPORT.md`
	- `WORKFLOW_REVIEW_COMPLETE.md`

## Open Questions / Follow-ups
- Confirm whether any automation expects docs at root (scan references before moving).
- Established two target directories:
	- `docs/archives/agents/` for historical AGENTS variants
	- `docs/root-migration/` for other formerly-root documents until they can be fully categorized
- `AGENT_TOOLING_ENHANCEMENTS_PROPOSAL.md` promoted to `docs/` root to match other agent tooling guides.
