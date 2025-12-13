# Working Notes – Fix AGI-Orchestrator agent frontmatter

- 2025-12-12 — Session created via `node tools/dev/session-init.js --slug "fix-agi-orchestrator-agent" --type "agents" ...`.

## Findings
- The leading ```chatagent marker seen in tool output is a display fence, not literal file content.
- PowerShell redirection (`> tmp\\agent-validate.json`) writes UTF-16LE with BOM by default; this is why JSON parsing looked “corrupt” (NUL bytes every other byte).

## Commands / Evidence
- Validator run (redirected to file):
	- `node tools/dev/agent-validate.js --dir .github/agents --json > tmp\\agent-validate.json`
	- Evidence: file starts with UTF-16LE BOM bytes `ff fe` and contains NUL bytes.
- Decode + inspect result:
	- `node -e "const fs=require('fs');const buf=fs.readFileSync('tmp/agent-validate.json');const text=buf.toString('utf16le').replace(/^\\uFEFF/,''); const data=JSON.parse(text); ..."`
	- `AGI-Orchestrator`: `errors: 0`, `warnings: 0`.

## Change Made
- Updated `.github/agents/AGI-Orchestrator.agent.md` frontmatter `tools:` list to use the repo’s established tool-id conventions (e.g. `fetch`, `todos`, `runCommands`, `runSubagent`) while keeping `docs-memory/*` available.
