# Existing Agent Landscape (2025-11-16)

This summary captures currently documented agent roles/policies outside `/docs/agi`. Review these before drafting new AGI personas.

## Canonical Policies
- `docs/agents/agent_policy.md` – Research-first preflight; mandates consulting `docs/INDEX.md`, limiting doc reads to relevant items, and keeping `AGENTS.md` lean.
- `docs/agents/command-rules.md` – Command execution expectations, including PowerShell safety notes and encoding requirements.
- `docs/agents/core-workflow-rules.md` – Baseline Plan → Implement → Verify loops shared across agents.

## Specialized Roles
- `docs/agents/docs_indexer_and_agents_refactorer.md` – Maintains documentation topology, splits oversized files, and enforces index hygiene.
- `docs/agents/database-schema-evolution.md` & `database-schema-tools.md` – Define responsibilities for schema-focused agents (migrations, tooling upkeep).
- `docs/agents/js-tools/` – Houses guidance for JavaScript tooling specialists (js-scan/js-edit stewards).
- `docs/agents/testing-guidelines.md`, `tdd-guidelines.md`, `test-log-migration.md` – Testing-focused roles ensuring coverage and log hygiene.
- `docs/agents/intelligent-crawl-startup.md` – Agents orchestrating crawl bootstrap flows and hub initialization sequences.

## Implications for AGI Work
1. **Inheritance**: New AGI agents must inherit these constraints; avoid redefining policies already covered here.
2. **Ownership Awareness**: Many canonical docs list owners (e.g., `docs-indexer`). Coordinate proposals with those owners via documentation updates or backlog items.
3. **Gap Identification**: Use this landscape to spot missing coverage (e.g., no dedicated Static Analysis Scout yet) and justify additions inside `/docs/agi/agents/`.

Keep this file updated as canonical agent docs evolve so `/docs/agi` stays synchronized with the broader governance model.
