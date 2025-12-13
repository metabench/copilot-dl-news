# Plan – AGI + jsgui3 Research Behaviour Upgrades

## Objective
Improve research discipline, memory use, evidence capture, and jsgui3-specific debugging workflows across key agents.

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `.github/agents/🧠 jsgui3 Research Singularity 🧠.agent.md`
- `.github/agents/💡UI Singularity💡.agent.md`
- `.github/agents/jsgui3 Isomorphic.agent.md`
- `.github/agents/🌟📐 CLI Toolsmith 📐🌟.agent.md`
- `docs/sessions/2025-12-13-agi-jsgui3-agent-research-upgrades/*` (plan + notes + summary + follow-ups)

## Risks & Mitigations
- Risk: Agent files bloat and diverge.
	- Mitigation: Prefer linking to satellite docs (`docs/guides/*`) and shared workflows (`docs/workflows/*`) instead of copying full protocols.
- Risk: Non-replayable commands (PowerShell/Unix pipelines) reduce reproducibility.
	- Mitigation: Prefer repo-standard Node CLIs (`tools/dev/js-scan.js`, `tools/dev/js-edit.js`, `tools/dev/md-scan.js`).

## Tests / Validation
- Evidence: agent file edits are small and targeted, and replace pipeline examples with repo-standard Node tooling.
- Commands:
	- `grep_search` on `.github/agents/` for old pipeline snippets (captured in WORKING_NOTES).
	- Manual read check: ensure each edited agent explicitly references the relevant satellite docs/workflows.
