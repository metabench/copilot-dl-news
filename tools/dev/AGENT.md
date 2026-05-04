# Agent Memory & Context for `tools/dev/`

**Scope:** Developer CLI tools, static analysis (`js-scan`, `js-edit`), SVG validation, and crawler diagnostic utilities.

## What this directory contains

This directory serves as the playground for experimental-but-safe developer CLI tools. The flagship applications here are our semantic AST manipulation tools (`js-scan.js`, `js-edit.js`) which are highly integrated with our custom ecosystem for structural, guarded code substitutions.

## Essential Reading Links

The monolithic README has been split to reduce context overload. If you need specifics, read these:
- [AST, Static Analysis & Refactoring Tooling](../../docs/tools/AST-TOOLING.md) — For `js-scan`, `js-edit`, `md-scan`, `md-edit`, and ripple analysis.
- [SVG Validation Tooling](../../docs/tools/SVG-TOOLING.md) — For `svg-scan`, `svg-collisions`, `svg-overflow`, etc.
- [Crawl & Telemetry Tooling](../../docs/tools/CRAWL-TOOLING.md) — For daemon controls, `mini-crawl`, `db-downloads`, and `task-events`.
- [Directory Index](./README.md) — For file management utilities (`agent-files.js`, `session-archive.js`, `mcp-check.js`, etc.).

## Key Workflows & Critical Knowledge

### 1. Using AST Tooling over standard RegExp/Replacers
As an AI Agent, you might natively support code edits via MCP endpoints like `multi_replace_file_content`. However, if you are doing massive automated refactoring or need to **dry-run** your edits against strict schema boundaries, you are expected to use `js-edit.js`:
- Always use the `--json` flag to receive structured payloads (like guard hashes and span boundaries).
- Before refactoring a widely used module, you **MUST** run `node tools/dev/js-scan.js --ripple-analysis <file>` to assert dependencies and check the risk score.
- Always use **hash guardrails** (`--expect-hash <hash>`) when stringing together locate-then-replace workflows to prevent mutating the wrong code span.

### 2. Multi-step Recipes
When you recognize a repetitive pattern (e.g. updating 20 UI components to a new signature), do not edit them one-by-one by hand. Instead:
- Write a JSON `.recipe` (see AST-TOOLING.md) defining the discovery and replace sequences.
- Let `js-edit.js --recipe` handle atomic rollback and execution.

### 3. Agent Tooling (`agent-files.js` / `agent-rename.js`)
- Do **NOT** use standard bash `mv` or `Rename-Item` in PowerShell to rename `.agent.md` files (it corrupts Unicode emojis in CP437 environments).
- Instead, always use `node tools/dev/agent-rename.js --from "Partial" --to "💡 New Name"`.

## Related Paths & Agent Specs
- `/src/ui/AGENT.md` — UI rendering context
- `/docs/sessions/AGENT.md` — Session tracking operations
- `docs/workflows/db-adapter-modularisation.md` — A workflow heavily dependent on AST mapping.
