---
title: Intelligent Crawl Startup Analysis
intent: Enables rapid iteration on dense, informative startup output for intelligent crawls
audience: agents
owner: AI Agents
last_review: 2025-10-19
tags: [crawls, startup, analysis]
supersedes: []
related: [database-schema-tools]
---

> **Research-First Preflight**  
> 1) Open `docs/INDEX.md`. 2) Navigate to relevant topics. 3) Read the linked docs.  
> Do **not** rely on prompt snippets. If it’s not in the prompt but is in the docs, the docs win.

## Requirements
- Reference [../INDEX.md](../INDEX.md) for crawl-related documents before iterating on startup output.
- Align logging changes with crawl architecture guidance in `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`.

## Summary
Rapid iteration workflow for testing startup reporting improvements in intelligent crawls. Use --limit N to display only first N lines, enabling quick testing of changes in seconds rather than minutes. Target output shows database status, gazetteer coverage, missing hubs, DSPL loading, feature flags, and plan preview in first 100 lines.

## When to use
- When improving information density in startup output
- For rapid testing of initialization changes (<30 seconds per iteration)
- To verify database status, coverage, and missing hubs without full crawl
- When debugging initialization issues

## Procedure
1. Run `node tools/intelligent-crawl.js --limit 100` for recommended analysis
2. Verify key information appears in first 100 lines: DB size, article/place/country counts, hub coverage, DSPL status, feature flags, plan preview
3. Iterate on logging: single-line summaries, inline lists, batch operations
4. Test changes quickly without waiting for full crawl completion
5. Apply logging discipline: log once at initialization, no per-item verbose messages

## Gotchas
- Log once at initialization with summary statistics
- Batch operations: "Generated 50 URLs for 50 countries" not 50 separate lines
- Single-line summaries with counts, not per-item messages
- Never repeat identical log messages in loops
- No verbose per-country/per-URL logging during planning