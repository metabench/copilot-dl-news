# CLI Tools Reference

This directory contains a large CLI surface area. The canonical command documentation now lives in `docs/cli/`.

## Start Here

- CLI index (all command families): `docs/cli/INDEX.md`
- Crawl/fleet quick reference: `docs/cli/crawl.md`
- Full crawl operations guide: `tools/crawl/AGENT.md`
- Developer tooling reference (js-scan/js-edit/md-*): `tools/dev/README.md`
- Developer tooling workflow: `tools/dev/AGENT.md`
- CLI testing guide: `docs/CLI_TOOL_TESTING_GUIDE.md`

## Directory-Level Coverage

- `tools/crawl/` — crawl fleet management, diagnostics, sync, smoke, v4 helpers.
- `tools/dev/` — development/editing/analysis CLIs and maintenance utilities.
- `tools/data-transfer/` — export/import/sync/bootstrap utilities.
- `tools/corrections/` — repair/fix scripts (usually dry-run first).
- `tools/debug/` — diagnostics and one-off debugging helpers.
- `tools/compression/` — compression diagnostics and benchmarks.
- `tools/schema/` — schema sync/check/stats automation.
- `tools/mcp/` — MCP servers for docs-memory and svg-editor.

## Safety Expectations

- Prefer npm scripts for common operations (`fleet:*`, `schema:*`, `data:*`, `db:*`, `sessions:*`).
- Use dry-run/default-safe modes before `--fix` or destructive flags.
- Prefer `--json` for automation workflows.

When adding a new user-facing CLI, update `docs/cli/INDEX.md` and the nearest local tool guide in the same change.