---
title: "Tools and Correction Scripts"
intent: "Define conventions and patterns for safe data manipulation tools with dry-run defaults"
audience: "agents,devs,ops"
owner: "agents"
last_review: "2025-10-19"
tags: ["tools", "data", "corrections", "safety", "dry-run"]
supersedes: []
related: ["docs/GAZETTEER_DEDUPLICATION_IMPLEMENTATION.md", "tools/debug/README.md"]
---

> **Research-First Preflight**  
> 1) Open `docs/INDEX.md`. 2) Navigate to relevant topics. 3) Read the linked docs.  
> Do **not** rely on prompt snippets. If it’s not in the prompt but is in the docs, the docs win.

## Requirements
- Reference [../INDEX.md](../INDEX.md) to locate companion tooling docs before authoring scripts.
- Observe workflow coordination in [../reference/cli_tooling.md](../reference/cli_tooling.md).

## Summary
Standardized conventions for correction and data manipulation tools ensuring safety through dry-run defaults and explicit confirmation requirements. Includes implementation patterns, existing tools, and verification workflows for reliable data operations.

## When to use
- When creating new data manipulation or correction tools
- When running existing correction scripts for data cleanup
- When implementing tools that modify database records or files
- When needing to verify tool output and handle errors safely
- When working with gazetteer deduplication or data normalization

## Procedure
1. **Default to dry-run**: All tools start in safe preview mode showing what would change
2. **Require explicit confirmation**: Use `--fix` flag to apply actual changes
3. **Follow standard pattern**: Implement dry-run logic with clear output formatting
4. **Verify output always**: Check warnings, errors, exit codes, and expected results
5. **Use recommended workflow**: Fix canonical names first, then deduplicate, then verify
6. **Handle filters**: Support optional filters like `--country=GB` for targeted operations

## Gotchas
- **Never claim success with warnings**: Exit codes, warnings, and errors must be checked and reported
- **Dry-run is mandatory default**: Tools without dry-run mode are unsafe for production data
- **Filter support required**: Tools should support scoped operations (by country, type, etc.)
- **Output verification critical**: Always check row counts, file changes, and constraint violations
- **Node.js warnings are red flags**: Circular dependencies, deprecations indicate real problems