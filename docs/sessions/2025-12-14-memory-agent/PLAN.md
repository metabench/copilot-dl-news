# Plan – Memory Agent (docs-memory-driven)

## Objective
Add an emoji-named Memory Agent focused on memory-driven workflows and docs-memory usage.

## Done When
- [ ] New emoji-named Memory Agent exists under `.github/agents/`.
- [ ] Agent is registered in `.github/agents/index.json`.
- [ ] JSON validity is verified (e.g., parse check).
- [ ] `SESSION_SUMMARY.md` records what changed.

## Change Set (initial sketch)
- `.github/agents/🧠 Memory Agent 🧠.agent.md` (new)
- `.github/agents/index.json` (register agent)
- `docs/sessions/2025-12-14-memory-agent/*` (plan/notes/summary)

## Risks & Mitigations
- **Risk**: Agent not discoverable by tooling.
	- **Mitigation**: Register in `.github/agents/index.json`.
- **Risk**: JSON corruption.
	- **Mitigation**: Parse check via Node.

## Tests / Validation
- `node -e "JSON.parse(fs.readFileSync('.github/agents/index.json','utf8'))"`
