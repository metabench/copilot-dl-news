---
status: canonical
source: AGENTS.md
last_migrated: 2025-11-04
owner: tooling-team
---

# CLI Tooling Reference

This reference consolidates safe CLI usage patterns and points to canonical, up-to-date command catalogs.

## Canonical Entry Point

- [../cli/INDEX.md](../cli/INDEX.md) — master CLI index (crawl, dev, DB/schema, data transfer, maintenance).
- [../cli/crawl.md](../cli/crawl.md) — crawl/fleet command quick reference.
- [../../tools/crawl/AGENT.md](../../tools/crawl/AGENT.md) — operational crawl diagnostic and sync workflows.
- [../../tools/dev/README.md](../../tools/dev/README.md) — developer tooling command reference.

## Core Tools

- `npm run fleet:running` / `npm run fleet:overview` / `npm run fleet:health` – fleet status triage.
- `npm run fleet:crawl-sync` / `npm run fleet:sync` – sync-first crawl operations.
- `npm run fleet:smoke:fast` – tiny crawl+sync smoke with metadata assertions.
- `npm run schema:sync` / `npm run schema:check` / `npm run schema:stats` – schema sync and drift.
- `node tools/dev/js-scan.js` / `node tools/dev/js-edit.js` – discovery and guarded refactors.
- `node tools/dev/md-scan.js` / `node tools/dev/md-edit.js` – markdown discovery/editing.

Many correction and migration tools run in dry-run mode by default; pass `--fix` or tool-specific apply flags only after reviewing output.

## Agentic Workflows

### Crawl Operations Workflow

1. `npm run fleet:overview` (fast snapshot triage)
2. `npm run fleet:health` (authoritative live state)
3. `npm run fleet:crawl-sync` (start/recover + sync)
4. `npm run fleet:smoke:fast -- --count=1 --max-pages=1 ...` (tiny verification)

### JS Refactor Workflow (Tier 1)

1. `node tools/dev/js-scan.js --what-imports <module> --json`
2. `node tools/dev/js-edit.js --dry-run --changes <file.json> --json`
3. `node tools/dev/js-edit.js --changes <file.json> --fix --emit-plan --json`
4. `node tools/dev/js-scan.js --search <symbol> --json`

### Schema Workflow

1. `npm run schema:sync`
2. `npm run schema:check`
3. `npm run schema:stats` (when DB statistics docs need refresh)

## Safety Principles

- Prefer Node-based tooling over shell command chains to avoid approval dialogs.
- Treat background-process terminals as dedicated; do not run additional commands in them.
- Capture output in the workspace log files instead of piping PowerShell commands.

## Coverage Policy

- New user-facing CLI commands must be discoverable via [../cli/INDEX.md](../cli/INDEX.md).
- Detailed usage belongs in local tool docs (`tools/<area>/README.md` or `tools/<area>/AGENT.md`).
- `package.json` script additions should include enough naming context (`fleet:*`, `schema:*`, `data:*`, etc.) to be self-discoverable.

Refer to [../agents/command-rules.md](../agents/command-rules.md) for detailed terminal safety guidance.
