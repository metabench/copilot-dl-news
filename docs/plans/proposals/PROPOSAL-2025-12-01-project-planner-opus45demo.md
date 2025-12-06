# Plan Proposal: AI Project Planner Implementation

## Contribution Metadata
- **Agent**: 🤖 Robot Planner 🤖
- **Agent File**: `.github/agents/🤖 Robot Planner 🤖.agent.md`
- **AI Model**: Claude Opus 4.5 (acting as Robot Planner for demonstration)
- **Timestamp**: 2025-12-01T15:30:00Z
- **Confidence**: 70%
- **Documents Consulted**: 
  - `docs/designs/AI_PROJECT_PLANNER_ARCHITECTURE.md`
  - `docs/designs/AI_PROJECT_PLANNER_UI_DESIGN.svg`
  - `docs/guides/PLANNING_PLANNING_STRATEGIES.md`
  - `AGENTS.md`
  - `docs/sessions/SESSIONS_HUB.md`

## Status
- [x] Pending Review
- [ ] Approved
- [ ] Approved with Changes
- [ ] Needs Revision
- [ ] Rejected

---

## Executive Summary

Build the AI Project Planner UI application: a file-based planning system where AI agents generate long-term project plans displayed for human review and commentary. No database storage—all data lives in structured markdown files within `docs/plans/`.

## Problem Statement

Currently, long-term planning happens ad-hoc in sessions without:
- Visibility into plan status across agents
- Structured way for agents to propose and iterate on plans
- Human commentary mechanism on AI-generated plans
- Connection between plans and executing sessions

The AI Project Planner solves this by providing a UI that surfaces `docs/plans/` content with session integration.

## Proposed Approach

### Phase 1: File Structure & Templates (2 sessions)
- **Duration**: 3-4 hours
- **Objective**: Establish the `docs/plans/` directory structure and file templates
- **Sessions**: 
  - Session 1: Create directory structure, templates, and validation scripts
  - Session 2: Extend `session-init.js` to support `--plan` flag for linking
- **Deliverables**: 
  - Complete template files (PLAN.md, SESSIONS.md, COMMENTS.md, AI_SUGGESTIONS.md)
  - Updated session-init.js with plan linking
  - Validation script for plan structure

### Phase 2: Server Skeleton (2 sessions)
- **Duration**: 4-5 hours
- **Objective**: Create Express server with file-based API
- **Sessions**:
  - Session 1: Server setup, routing, plan reading/listing endpoints
  - Session 2: Comment append, session linking endpoints
- **Deliverables**:
  - `src/ui/server/projectPlanner/server.js`
  - File-based CRUD operations
  - API test coverage

### Phase 3: jsgui3 UI Controls (3 sessions)
- **Duration**: 6-8 hours
- **Objective**: Build the Industrial Luxury Obsidian themed UI
- **Sessions**:
  - Session 1: PlanListControl (sidebar)
  - Session 2: PlanDetailControl with timeline
  - Session 3: CommentControl and AI suggestion panel
- **Deliverables**:
  - Complete control hierarchy
  - CSS styling matching z-server theme
  - Client bundle

### Phase 4: Integration & Polish (2 sessions)
- **Duration**: 4-5 hours
- **Objective**: End-to-end functionality and refinement
- **Sessions**:
  - Session 1: Wire up all controls to API, test flows
  - Session 2: Polish, error handling, documentation
- **Deliverables**:
  - Working application
  - Usage documentation
  - Screenshot for docs

## Alternatives Considered

### Alternative A: Database Storage
- **Description**: Store plans in SQLite like other app data
- **Pros**: Queries, indexes, consistent with other data
- **Cons**: Harder to version control, less visible to agents, adds complexity
- **Rejection Reason**: File-based approach is more aligned with agent workflows and session system

### Alternative B: Single-File Plans
- **Description**: Keep each plan as a single large markdown file
- **Pros**: Simpler structure
- **Cons**: Harder to parse programmatically, comments mixed with plan, no separation of concerns
- **Rejection Reason**: Multi-file structure enables cleaner parsing and atomic operations

### Alternative C: Existing Tools Integration
- **Description**: Use GitHub Issues or external project management
- **Pros**: No development needed
- **Cons**: Doesn't integrate with session system, not file-based, external dependency
- **Rejection Reason**: Need tight integration with docs/sessions/ workflow

## Dependencies
- **Depends on**: 
  - z-server CSS theme (can copy styles)
  - jsgui3-html controls (existing)
  - session-init.js tool (existing, will extend)
- **Blocks**: 
  - Future multi-agent coordination features
  - Automated plan tracking

## Risks and Uncertainties

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| File parsing complexity | Medium | Medium | Use simple, consistent templates |
| Performance with many plans | Low | Low | Plans are few, no pagination needed initially |
| Comment format evolution | Medium | Low | Keep format simple, extensible |
| Session linking edge cases | Medium | Medium | Validate links, handle missing sessions gracefully |

## Uncertainties (things I don't know)
1. Should comments support threading/replies, or just flat append?
2. How should AI suggestions be generated—on-demand or scheduled?
3. What's the desired retention policy for old/archived plans?
4. Should there be plan-level permissions or is everything visible?

## Questions for Central Planner
1. Is the 4-phase, 9-session structure appropriately scoped, or should it be condensed?
2. Should we prioritize the file structure (Phase 1) as a standalone deliverable before committing to the UI?
3. Are there existing jsgui3 controls that could be reused for timeline visualization?

## Estimated Effort

| Phase | Planning | Implementation | Review |
|-------|----------|----------------|--------|
| Phase 1 | 1 hour | 3 hours | 0.5 hours |
| Phase 2 | 1 hour | 4 hours | 1 hour |
| Phase 3 | 1 hour | 7 hours | 1 hour |
| Phase 4 | 0.5 hours | 4 hours | 1 hour |
| **Total** | 3.5 hours | 18 hours | 3.5 hours |

## Success Criteria
- [ ] `docs/plans/` directory structure established with templates
- [ ] `session-init.js` supports `--plan` flag
- [ ] Server reads/lists plans from filesystem
- [ ] UI displays plan list and detail view
- [ ] Comments can be added through UI
- [ ] Session links are clickable and navigable
- [ ] Matches z-server visual theme

## Session Links
- **Related past sessions**: 
  - `docs/sessions/2025-12-01-zserver-green-svg/` — z-server styling reference
- **Proposed new sessions**:
  - `2025-12-XX-planner-file-structure/`
  - `2025-12-XX-planner-session-linking/`
  - `2025-12-XX-planner-server/`
  - `2025-12-XX-planner-api/`
  - `2025-12-XX-planner-ui-list/`
  - `2025-12-XX-planner-ui-detail/`
  - `2025-12-XX-planner-ui-comments/`
  - `2025-12-XX-planner-integration/`
  - `2025-12-XX-planner-polish/`

---

## Central Planner Review Section
_To be filled by Central Planner (Claude Opus 4.5)_

### Review Metadata
- **Reviewer**: [Pending]
- **Review Date**: [Pending]

### Decision: PENDING

### Feedback
[To be added]

### Required Changes
[To be added]

### Answers to Questions
[To be added]
