# Roadmap — Session 2025-11-13: Gap 5 Scouting & Feasibility

## Objectives
- Confirm outstanding js-scan/js-edit roadmap items (Gap 5 & Gap 6).
- Assess implementation scope, dependencies, and risks.
- Decide next executable steps.

## Task Board

### 1. Discovery (Complete)
- [x] Create session workspace & update Session Hub
- [x] Inventory backlog docs for Gap 5 & Gap 6 requirements
- [x] Evaluate current CLI capabilities versus desired features (existing `--deps-of` provides transitive graph via `runDependencySummary`)

### 2. Feasibility Analysis (In Progress)
- [x] Determine technical approach for `--depends-on` / `--impacts` (existing `runDependencySummary` needs path enrichment + CLI mapping)
- [x] Identify data structures needed for transitive analysis (graph path metadata captured)
- [x] Outline test coverage strategy (16-case suite implemented)
- [ ] Design call graph data extraction for Gap 6

### 3. Recommendations (In Progress)
- [x] Summarize findings in `SESSION_SUMMARY.md`
- [x] Record decisions in `DECISIONS.md`
- [x] Capture outstanding work in `FOLLOW_UPS.md`

## Risks & Assumptions
- Gap 5/6 effort estimates may exceed single-agent bandwidth.
- Graph computations must align with existing js-scan architecture.
- Additional tooling or refactors might be prerequisites.

## Dependencies
- Existing js-scan codebase & index building logic.
- Current tests covering Gap 2/GAP 3 features.
