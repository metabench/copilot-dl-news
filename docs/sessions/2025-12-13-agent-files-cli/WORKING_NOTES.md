# Working Notes – Agent Files CLI Tooling

## Commands (evidence)

- List agents: `node tools/dev/agent-files.js --list`
- Validate frontmatter + handoffs: `node tools/dev/agent-files.js --validate --check-handoffs`
- Validate + link targets (warnings by default): `node tools/dev/agent-files.js --validate --check-links`
- Search: `node tools/dev/agent-files.js --search Evidence Contract --limit 25`

## Batch edit wrapper (md-edit)

- Dry-run replace a section across `.agent.md` files:
	- `node tools/dev/agent-files.js --replace-section "Evidence Contract" --with-file <snippet.md>`
- Apply the replace:
	- `node tools/dev/agent-files.js --replace-section "Evidence Contract" --with-file <snippet.md> --fix`

- 2025-12-13 — Session created via CLI. Add incremental notes here.
