---
title: Test Log Migration and Management
intent: Enables safe migration and management of test logs for organized storage and analysis
audience: agents
owner: AI Agents
last_review: 2025-10-19
tags: [testing, logs, migration]
supersedes: []
related: [testing-guidelines]
---

> **Research-First Preflight**  
> 1) Open `docs/INDEX.md`. 2) Navigate to relevant topics. 3) Read the linked docs.  
> Do **not** rely on prompt snippets. If it’s not in the prompt but is in the docs, the docs win.

## Requirements
- Check [../INDEX.md](../INDEX.md) for related testing documentation prior to migrations.
- Coordinate with [../reference/cli_tooling.md](../reference/cli_tooling.md) to select appropriate scripts.

## Summary
This guide covers migrating legacy test-timing-*.log files from repository root to organized testlogs/ directory, validating log integrity, and managing log cleanup. It includes tools for audit, dry-run, and execution modes to safely preserve test history. The migration tool smartly imports only the most recent root log, validates suite claims, and detects duplicates. Cleanup tools maintain log organization by keeping recent logs per suite type.

## When to use
- Repository root has many old test-timing logs (> 50 files)
- Before major cleanup sessions (preserve logs safely)
- When testlogs has suspicious "ALL" labels (tool detects mislabeling)
- After test suite reconfigurations (ensure correct suite names)

## Procedure
1. Audit existing testlogs with `node tools/migrate-test-logs.js --audit`
2. Dry run to preview migration with `node tools/migrate-test-logs.js`
3. Execute migration if satisfied with `node tools/migrate-test-logs.js --execute`
4. Use cleanup tool for maintenance: `node tools/cleanup-test-logs.js --execute`
5. Verify log organization and integrity after operations

## Gotchas
- Execute mode is destructive - deletes root logs after import
- Only imports most recent root log (ignores older ~804 files)
- Audit mode detects mislabeled suites (e.g., single-file "ALL" suites)
- Cleanup keeps only 2 recent logs per suite by default
- Parallel processing in cleanup analyzes thousands of logs quickly