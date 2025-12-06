# Working Notes – Consolidate agent instructions

- 2025-12-06 — Session created via CLI. Add incremental notes here.
- 2025-12-06 — Brainstorm: Next tasks snapshot.
	- Known facts: Current session aims to consolidate agent instructions into AGENTS.md and slim the Copilot file; Self-model highlights tool-first workflows (js-scan/js-edit) and no Python; multiple active sessions remain open (agent backups CLI, npm scripts map, MCP reduce-undefined investigation, crawler refactors).
	- Options sketched (ranked high → lower impact):
		1) Finish instruction consolidation (fold Copilot-specific rules into AGENTS.md, keep pointers minimal) and close this session.
		2) Ship agent backups CLI (zip backup/list/restore) with a short README and tests, then document in AGENTS.md index.
		3) Complete npm scripts catalog + SVG overview so agents can pick scripts quickly; add to docs/INDEX.md.
		4) Chase MCP reduce undefined error reproduction and fix; capture findings in session summary and docs.
		5) Resume crawler refactors (wiring extraction + safeCall expansion) with regression tests.
	- Suggested next immediate step: Option 1 to unblock other agents, then Option 2 for resilience. Document outcomes in SESSION_SUMMARY.md and FOLLOW_UPS.md.
- 2025-12-06 — Executed consolidation pass: added UI/SVG/tooling quick anchors to AGENTS.md and reduced Copilot instructions to a minimal pointer back to AGENTS plus tooling link.
