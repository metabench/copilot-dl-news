# Existing Agent Landscape (2025-11-16, updated 2026-02)

This summary captures currently documented agent roles/policies outside `/docs/agi`. Review these before drafting new AGI personas.

## Canonical Policies
- `docs/agents/agent_policy.md` – Research-first preflight; mandates consulting `docs/INDEX.md`, limiting doc reads to relevant items, and keeping `AGENTS.md` lean.
- `docs/agents/command-rules.md` – Command execution expectations, including PowerShell safety notes and encoding requirements.
- `docs/agents/core-workflow-rules.md` – Baseline Plan → Implement → Verify loops shared across agents.

## Data Pipeline Diagnostics & Repair
- `.github/agents/🔬🛠️ Diagnostic & Repair Singularity 🛠️🔬.agent.md` – Evidence-driven system investigator/fixer. Orchestrates specialist agents for crawl pipeline repairs. Owns `docs/designs/CRAWL_SYSTEM_PROBLEMS_AND_RESEARCH.md` (8 diagnosed problems).
- `.github/agents/🕷️🔍 Crawl Health Monitor 🔍🕷️.agent.md` – Monitors crawl health using 6 CLI tools in `tools/crawl/`. Feeds findings to Diagnostic & Repair Singularity.
- `docs/designs/CRAWL_SYSTEM_PROBLEMS_AND_RESEARCH.md` – Problem catalogue with root causes, research agenda, and phased fix plan.
- `docs/designs/REMOTE_CRAWLER_DATA_TRANSFER_SYSTEM.md` – Architecture for remote→local data transfer.
- `tools/crawl/` – 6 diagnostic CLI tools (crawl-health, crawl-verify, crawl-pipeline, crawl-run-report, crawl-errors, crawl-fix).

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
