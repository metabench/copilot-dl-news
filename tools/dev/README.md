# Developer Tooling Playground

This directory hosts experimental-but-safe developer CLIs that follow the shared `CliArgumentParser`/`CliFormatter` conventions and default to dry-run behavior. Each tool should:

- Parse arguments with `CliArgumentParser` and support `--help`/`--json`/`--quiet` patterns when relevant.
- Emit consistent output via `CliFormatter` (headers, sections, tables, stats).
- Guard writes behind explicit flags such as `--fix`, surface diff previews before mutating files, and re-parse updated source to block syntax errors before they ever hit disk.
- Include focused tests/fixtures when behavior grows beyond simple inspection utilities.

Tools promoted out of prototype stage can move into `tools/` once they stabilize.
