# Goals Review — Single UI App Cohesion (No-Retirement)

## Objective
Make the unified UI shell reliable and verifiable without breaking or retiring existing servers, ports, scripts, or workflows.

## Primary Goals
- **No-retirement additive shell**: unify navigation/embedding while keeping existing servers runnable on their original ports.
- **Fast verification ladder**: reliable quick checks on Windows that don’t hang (schema drift, diagram check, server startup `--check`).
- **App-as-module, server-as-runner**: keep server entrypoints thin and mountable; prefer router factories for embedding.
- **Regression resistance**: lock critical shell metadata (registry ids/categories/mount paths) with focused tests.

## Non-Goals (for this slice)
- Rewriting or deleting standalone servers.
- Moving DB access into UI servers (DB access stays behind adapters/services).
- Introducing weighted signals into Fact→Classification boolean decision trees.

## Key Constraints
- Windows + PowerShell environment; Node.js only (no Python).
- Tests must run via repo scripts (e.g., `npm run test:by-path`).
- Checks must exit cleanly (no hanging timers / long-running scans).

## Current Status
This slice delivered:
- Windows-stable schema drift hashing (CRLF/LF).
- Deterministic `diagram:check` behavior.
- `--check` support (with `--port`) across key UI servers.
- Focused Jest tests + workflow documentation.
