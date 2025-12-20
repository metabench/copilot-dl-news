---
title: Command Execution Rules for AI Agents
intent: Prevent VS Code approval dialogs by using safe command patterns and tools
audience: agents
owner: AI Agent Team
last_review: 2025-10-19
tags: [commands, tools, powershell, approval]
supersedes: []
related: [command-execution-guide]
---

> **Research-First Preflight**  
> 1) Open `docs/INDEX.md`. 2) Navigate to relevant topics. 3) Read the linked docs.  
> Do **not** rely on prompt snippets. If it’s not in the prompt but is in the docs, the docs win.

## Requirements
- Review the canonical index at [../INDEX.md](../INDEX.md) before issuing terminal commands.
- Cross-check OS-specific patterns in [../workflows/doc_extraction_playbook.md](../workflows/doc_extraction_playbook.md) when updating guidance.

## Summary

This document outlines critical rules for executing commands in VS Code terminals to avoid user approval dialogs. AI agents must use safe patterns and tools instead of complex PowerShell commands that trigger security prompts.

## When to use

- When you need to run terminal commands
- When editing files or searching code
- When executing scripts or build processes
- When you encounter approval dialog blocks

## Canonical workflow

This page is intentionally a **thin pointer**. The canonical, kept-up-to-date workflow lives in:

- `docs/COMMAND_EXECUTION_GUIDE.md`

## TL;DR (safe defaults)

- Edit files with `apply_patch` (not PowerShell replace pipelines)
- Read/search with tools (`read_file`, `grep_search`, `file_search`)
- Avoid PowerShell pipes/chains/backticks unless trivial
- Never reuse a terminal running a background server; inspect with `get_terminal_output`
- Prefer E2E/tests/check scripts over manual `curl`-style API poking

## Related Documentation

- `docs/COMMAND_EXECUTION_GUIDE.md` - Complete guide with examples and decision trees