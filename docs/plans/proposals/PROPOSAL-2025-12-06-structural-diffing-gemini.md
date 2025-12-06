# Plan Proposal: Structural Diffing (Template Masking)

## Contribution Metadata
- **Agent**: 🤖 Robot Planner 🤖
- **Agent File**: `.github/agents/🤖 Robot Planner 🤖.agent.md`
- **AI Model**: Gemini 3 Pro (Preview)
- **Timestamp**: 2025-12-06T10:15:00Z
- **Confidence**: 95%
- **Documents Consulted**: 
  - `docs/designs/STRUCTURAL_DIFFING_LOW_STORAGE.md`
  - `src/analysis/structure/SkeletonHash.js`
  - `tools/structure-miner.js`

## Status
- [ ] Pending Review
- [ ] Approved
- [ ] Approved with Changes
- [ ] Needs Revision
- [ ] Rejected

---

## Executive Summary
Implement "Template Masking" to identify boilerplate content (navigation, footers, ads) within shared layout templates. By comparing a small sample of pages sharing the same `SkeletonHash`, we can generate a "Mask" that identifies static vs. dynamic nodes. This enables high-precision content extraction and change detection with negligible storage overhead ($O(Templates)$ instead of $O(Pages)$).

## Problem Statement
Currently, we can group pages by layout (`SkeletonHash`), but we cannot distinguish between the "template" (boilerplate) and the "content" (unique data). Storing full diffs for every page is storage-prohibitive. We need a way to "learn" the template structure once and apply it to all matching pages to extract clean content.

## Proposed Approach

### Phase 1: Core Logic (`SkeletonDiff`)
- **Duration**: 2 hours
- **Objective**: Implement the parallel tree traversal algorithm to detect static vs. dynamic nodes.
- **Sessions**: 
  - Session 1: Implementation of `SkeletonDiff.js` and unit tests.
- **Deliverables**: 
  - `src/analysis/structure/SkeletonDiff.js`: Class with `generateMask(cheerioRoots)` method.
  - `src/analysis/structure/__tests__/SkeletonDiff.test.js`: Tests with synthetic HTML samples.

### Phase 2: Persistence & Schema
- **Duration**: 1 hour
- **Objective**: Create database storage for layout masks.
- **Sessions**: 
  - Session 1: Database migration and schema sync.
- **Deliverables**: 
  - `src/db/migrations/013-layout-masks.sql`: Table definition for `layout_masks`.
  - Updated `src/db/sqlite/v1/schema-definitions.js`.

### Phase 3: Tooling Integration (`structure-miner`)
- **Duration**: 2 hours
- **Objective**: Update the mining tool to generate masks for discovered templates.
- **Sessions**: 
  - Session 2: CLI updates to support `--mask` mode.
- **Deliverables**: 
  - Updated `tools/structure-miner.js`:
    - New flag `--mask`: Selects top N signatures, fetches K samples for each, computes mask, saves to DB.
    - Support for decompressing content blobs for sampling.

### Phase 4: Visualization & Verification
- **Duration**: 1.5 hours
- **Objective**: Visual verification tool to ensure masks are correct.
- **Sessions**: 
  - Session 2: Creation of visualization script.
- **Deliverables**: 
  - `tools/visualize-mask.js`: CLI that takes a URL/Hash, applies the mask, and outputs an HTML file highlighting dynamic regions (e.g., red borders) and graying out static regions.

## Alternatives Considered

### Alternative A: Per-Page Diffing
- **Description**: Store a diff of every page against a "base" template page.
- **Pros**: Extremely granular history.
- **Cons**: Massive storage cost ($O(N)$). High compute overhead to generate diffs for every crawl.
- **Rejection Reason**: Storage efficiency is a primary constraint.

### Alternative B: Heuristic Extraction (Readability.js)
- **Description**: Use generic heuristics to guess main content.
- **Pros**: No training/mining required.
- **Cons**: Often fails on complex/modern layouts. No "change detection" capability (just extraction).
- **Rejection Reason**: We need structural understanding for change detection, not just extraction.

## Dependencies
- Depends on: `SkeletonHash` (Implemented)
- Depends on: `layout_signatures` table (Implemented)
- Blocks: "Teacher" crawler smart-skipping logic (partially).

## Risks and Uncertainties

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Sample Noise** | Medium | High | If samples are too similar (e.g., same day), dynamic parts might look static. **Mitigation**: Ensure samples are diverse (random selection from different crawl times if possible). |
| **Traversal Mismatch** | Low | High | If `SkeletonHash` groups pages that actually differ slightly in structure (hash collision or Level 2 looseness), parallel traversal will desync. **Mitigation**: Strict validation during traversal; abort mask generation if structure diverges. |

## Uncertainties (things I don't know)
1.  **Optimal Sample Size**: Is $K=5$ enough? Or do we need $K=20$? (Plan: Start with 5, make it configurable).
2.  **Mask Format**: Is a list of path strings `["0.1.2"]` compact enough, or do we need a binary format? (Plan: Start with JSON strings, optimize later if needed).

## Questions for Central Planner
1.  Should we run the masking process as a background task (cron) or on-demand during crawling? (Assumption: Background task via `structure-miner` for now).

## Estimated Effort
| Phase | Planning | Implementation | Review |
|-------|----------|----------------|--------|
| Phase 1 | 0.5h | 2.0h | 0.5h |
| Phase 2 | 0.2h | 1.0h | 0.2h |
| Phase 3 | 0.5h | 2.0h | 0.5h |
| Phase 4 | 0.2h | 1.5h | 0.2h |
| **Total** | **1.4h** | **6.5h** | **1.4h** |

## Success Criteria
- [ ] `SkeletonDiff` correctly identifies dynamic nodes in synthetic tests.
- [ ] `layout_masks` table is populated with masks for top templates.
- [ ] Visualization shows clear separation of boilerplate (nav/footer) and content.
- [ ] Storage overhead remains low (<1KB per template).

## Session Links
- Related past sessions: `docs/sessions/2025-12-06-structure-mining-implementation`
- Proposed new sessions: `docs/sessions/YYYY-MM-DD-structural-diffing-implementation`
