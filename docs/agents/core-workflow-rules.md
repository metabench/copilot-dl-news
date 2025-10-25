---
title: "Core Workflow Rules"
intent: "Define fundamental execution patterns and quality gates for autonomous agent work"
audience: "agents"
owner: "agents"
last_review: "2025-10-19"
tags: ["workflow", "execution", "quality", "testing"]
supersedes: []
related: ["docs/agents/testing-guidelines.md", "docs/agents/command-rules.md", "docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md"]
---

## Summary
Core execution principles for autonomous agent work including research limits, fast-path development, test discipline, and quality validation. Establishes patterns for efficient, reliable code changes with built-in quality gates.

## When to Read
- When starting any coding task or feature implementation
- When deciding how much research to do before coding
- When running or validating tests during development
- When checking tool outputs for warnings/errors
- When implementing pre-implementation checklists

## Procedure
1. **Execution**: Work autonomously, stop only if genuinely blocked
2. **Research Budget**: Read 5-10 files max before coding; for small changes (<50 lines): 1-3 files, 1-2 searches
3. **Fast Path**: Check attachments → ONE search for pattern → Read ONE example → START CODING (within 2-5 min)
4. **Test Discipline**: Add debugging code BEFORE running tests repeatedly; if same test run 3+ times without code changes, STOP and add more debugging
5. **Pre-Implementation Checklist**: Check AGENTS.md patterns, search similar files, match conventions, document discoveries, review test logs
6. **Quality Gates**: Never claim success with warnings/errors; investigate Node warnings, constraint violations, silent failures

## Gotchas
- **Research Paralysis**: If >3 docs read or >3 searches without starting code, force start with current knowledge
- **Test Abuse**: Running same test repeatedly without code changes indicates need for debugging code
- **Success Claims**: "Perfect"/"Success" invalid if warnings/errors present - must report and assess severity
- **Tool Output**: Always read ALL output including exit codes, warnings, stack traces - silent failures are common
- **Test Logs**: Check `test-timing-*.log` files BEFORE running tests to capture prior failures