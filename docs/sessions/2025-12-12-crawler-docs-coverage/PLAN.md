# Plan – Crawler Documentation Coverage & Accuracy

## Objective
Audit crawler docs and improve coverage, accuracy, and long-term planning guidance

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- docs/INDEX.md
- docs/cli/crawl.md
- docs/goals/RELIABLE_CRAWLER_ROADMAP.md
- README.md
- docs/sessions/2025-12-12-crawler-docs-coverage/*

## Risks & Mitigations
- Risk: Adding yet another crawler doc entry point without clarifying authority.
	- Mitigation: Prefer linking existing canonical docs (architecture, CLI, roadmap) from the index.
- Risk: README drift (commands/scripts) causing broken “how to run” instructions.
	- Mitigation: Verify `package.json` scripts and point legacy UI to a direct `node` command.

## Tests / Validation
- Evidence: Links resolve and key commands match `package.json`.
- Optional: `npm run ui:data-explorer` starts on port 3001.
