# Working Notes – Anthropic skill systems vs Copilot

## Known facts (from Anthropic/Claude docs)

### Agent Skills (Claude Code)
- Skills are “packaged expertise into discoverable capabilities”: a directory with `SKILL.md` + optional scripts/templates.
- Skills are *model-invoked* (Claude decides when to load/use them based on the skill `description`).
- Skill format: YAML frontmatter with `name` + `description` followed by Markdown instructions.
- Skills can include `allowed-tools` frontmatter to restrict tool access while the Skill is active.
- Skill directories live at `.claude/skills/<skill>/` (project) or `~/.claude/skills/<skill>/` (user).
- Claude reads supporting files “only when needed” (progressive disclosure).

Source: https://code.claude.com/docs/en/skills

### Subagents (Claude Code)
- Subagents are pre-configured personas with a dedicated context window and allowed tool list.
- They’re stored as Markdown files with YAML frontmatter in `.claude/agents/` (project) or `~/.claude/agents/` (user).
- Subagents can list `skills` to auto-load when the subagent starts.

Source: https://code.claude.com/docs/en/sub-agents

### Slash commands (Claude Code)
- Slash commands are “user-invoked prompts” (`.claude/commands/*.md`) and can include:
	- frontmatter for `allowed-tools` and metadata
	- argument placeholders and bash pre-execution
	- MCP-exposed prompts as `/mcp__server__prompt` commands
- Claude docs explicitly contrast “Skills vs slash commands”: commands for small, explicit prompts; skills for multi-step structured capability packs with scripts/resources and more automatic discovery.

Source: https://code.claude.com/docs/en/slash-commands

### Strict schema conformance for tools (Claude API)
- Structured outputs describe “strict tool use” as guaranteeing tool name + parameter schema conformance; intended to reduce schema violations for agent workflows.

Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

## Mapping to this repo (Copilot in VS Code)

### What we already cover (skills-adjacent)
- “Subagents” analogue: this repo already has a rich agent catalog (see `.github/agents/` and the built-in “runSubagent” surface we can invoke in this environment).
- “Skill content” analogue:
	- `docs/agi/WORKFLOWS.md` + `docs/agi/PATTERNS.md` + `docs/agi/LESSONS.md` (playbooks + patterns)
	- session folders under `docs/sessions/` (durable working memory + evidence)
- “Progressive disclosure” analogue:
	- docs-memory MCP tools already support filtering (`sinceDate`, `maxLines`, `onlyStats`) to avoid flooding context.

### What we *don’t* have (the key gap vs Skills)
- No first-class “capability pack” abstraction that bundles:
	- trigger phrases
	- a step-by-step SOP
	- related scripts/checks/tests
	- required context (“inputs/outputs”) and success criteria
	- a single discovery surface (“list all skills”) that models can query.

### Implication
We can’t “use Anthropic Skills” directly inside VS Code Copilot, but we *can emulate the pattern*:
- define skill packs in-repo (docs + scripts + tests)
- expose them via MCP in a structured, searchable way
- optionally build a UI for discovery/activation

## Candidate “skills” for this repo (examples)
- `telemetry-contracts`: enforce event naming + endpoint shapes; run check/tests.
- `svg-collisions`: create/repair SVGs with collision validation loops.
- `jsgui3-activation-debug`: activation flow checklist + check scripts + common failure signatures.
- `agent-session-discipline`: session-init + evidence logging + follow-up recording.

## Notes
- If we build this, it should look more like “skill registry + discovery + validation hooks” than “more prompt snippets”.
