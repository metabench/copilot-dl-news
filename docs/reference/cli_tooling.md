---
status: canonical
source: AGENTS.md
last_migrated: 2025-11-04
owner: tooling-team
---

# CLI Tooling Reference

This reference consolidates safe CLI usage patterns, common tools, and agentic workflows.

## Core Tools

- `node tools/db-schema.js` – table listings, structure, and foreign keys.
- `node tools/db-table-sizes.js` – table size metrics.
- `node tools/intelligent-crawl.js` – crawl diagnostics with optional `--limit`.
- `node tools/corrections/*` – data cleanup with dry-run defaults.
- `node tools/vacuum-db.js` – maintenance tasks.
- `node tools/dev/js-edit.js` – guarded JavaScript refactor tooling.

Each correction or migration tool runs in dry-run mode by default; pass `--fix` or documented flags to apply changes.

## Agentic Workflows

### Database Migration Workflow

1. `node tools/db-schema.js backup`
2. `node tools/corrections/validate-data.js`
3. `node tools/migrations/run-migration.js`
4. `node tools/db-schema.js verify`

### Crawl Analysis Workflow

1. `node tools/intelligent-crawl.js --limit 50`
2. `node tools/analyze-country-hub-patterns.js`
3. `node tools/crawl-place-hubs.js`
4. `node tools/export-gazetteer.js`

### Data Quality Workflow

1. `node tools/corrections/detect-issues.js`
2. `node tools/corrections/fix-foreign-keys.js --dry-run`
3. `node tools/corrections/fix-foreign-keys.js --fix`
4. `node tools/db-schema.js verify`

## Safety Principles

- Prefer Node-based tooling over shell command chains to avoid approval dialogs.
- Treat background-process terminals as dedicated; do not run additional commands in them.
- Capture output in the workspace log files instead of piping PowerShell commands.

Refer to [../agents/command-rules.md](../agents/command-rules.md) for detailed terminal safety guidance.
