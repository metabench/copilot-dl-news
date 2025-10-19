---
title: Test-Driven Development Guidelines
intent: Ensures reliable code changes through comprehensive testing patterns and workflows
audience: agents
owner: AI Agents
last_review: 2025-10-19
tags: [testing, tdd, development]
supersedes: []
related: [testing-guidelines]
---

## Summary
Comprehensive test-driven development patterns for reliable code changes. Every code change requires tests written alongside implementation, not after. Includes test types (unit, integration, API), TDD workflow, and common pitfalls. Critical rules include checking logs before running tests, using single DB connections in WAL mode, verifying exit codes, and fixing schema bugs first.

## When to use
- When writing new code or modifying existing code
- When implementing new features that require tests
- When refactoring code that affects existing behavior
- When debugging test failures or hangs

## Procedure
1. Check test logs first: Read recent test-timing-*.log files to see failures (saves 30-60 min)
2. Search for existing tests covering code you'll modify
3. Write new test stubs before implementation
4. Implement incrementally: code → test → next feature
5. Fix test failures immediately before proceeding
6. Only mark complete when all tests pass

## Gotchas
- New file → new test file, modified endpoint → updated tests
- Failing tests = incomplete work
- Check schema before logic: 100% failure rate often indicates schema bug
- One app per test: Multiple connections in WAL mode = isolation
- Fix in layers: Structure → logic → data → assertions
- Use targeted runs: `npm run test:file "pattern"` (5s) vs full suite (hangs)