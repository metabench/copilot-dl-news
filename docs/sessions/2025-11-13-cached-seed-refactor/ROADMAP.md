# Roadmap — Cached Seed Refactor

## Objectives
1. Pipeline honors `processCacheResult` metadata and treats cached entries as full seeds.
2. CLI/config surfaces a flag to enqueue cached seeds intentionally.
3. Regression tests + docs ensure cache-based seeding stays reliable.

## Task Board
- [x] Analyze FetchPipeline/PageExecutionService requirements for cached seeds.
- [x] Implement cache-hydrated execution path + context propagation.
- [x] Add CLI/config hooks for cached seed toggles.
- [x] Update/extend tests covering queue + execution changes.
- [x] Document behavior in session notes + relevant guides.
