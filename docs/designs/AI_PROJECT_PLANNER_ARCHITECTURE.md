# AI Project Planner - Architecture Design

_Last Updated: 2025-12-01_

## Overview

A file-based planning system where AI agents generate long-term project plans, displayed in a UI for human review and commentary. **No database storage** - all data lives in structured markdown files within the `docs/` directory.

## Design Principles

1. **File-Based Storage** - Plans and comments stored as markdown files, easily version-controlled
2. **Session Integration** - Plans link to existing `docs/sessions/` directory structure
3. **Agent-Generated** - AI agents create and update plans based on project context
4. **Human-Reviewed** - UI enables commenting, approval, and modification of AI suggestions

## Directory Structure

```
docs/
├── plans/                              # All project plans
│   ├── INDEX.md                        # Master index of all plans
│   │
│   ├── 2025-12-db-performance/         # Example plan directory
│   │   ├── PLAN.md                     # Main plan document
│   │   ├── SESSIONS.md                 # Session linkages and timeline
│   │   ├── COMMENTS.md                 # Human comments on the plan
│   │   ├── AI_SUGGESTIONS.md           # Agent-generated suggestions
│   │   └── artifacts/                  # Supporting files
│   │       ├── benchmarks.json
│   │       └── diagrams/
│   │
│   └── 2025-12-ui-components/          # Another plan
│       ├── PLAN.md
│       └── ...
│
└── sessions/                           # Existing session system (unchanged)
    ├── SESSIONS_HUB.md
    ├── 2025-11-28-db-profiling/
    └── ...
```

## File Formats

### PLAN.md

```markdown
# Plan: [Title]

_Created: YYYY-MM-DD_
_Status: draft | active | completed | archived_
_Priority: high | medium | low_

## Objective
[One paragraph describing the goal]

## Success Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Timeline
| Phase | Sessions | Target Date | Status |
|-------|----------|-------------|--------|
| Analysis | 1-2 | 2025-12-01 | ✓ |
| Implementation | 3-5 | 2025-12-10 | ⏳ |

## Dependencies
- Depends on: [other plan]
- Blocks: [other plan]

## Agent Notes
_AI-generated context and recommendations_
```

### SESSIONS.md

```markdown
# Sessions for: [Plan Title]

## Completed Sessions
| Session | Date | Directory | Summary |
|---------|------|-----------|---------|
| 1 | 2025-11-28 | [Link](../../sessions/2025-11-28-db-profiling/) | Query analysis |

## Planned Sessions
| Session | Target Date | Objective | Prerequisites |
|---------|-------------|-----------|---------------|
| 3 | 2025-12-02 | Index optimization | Session 2 complete |

## Session Creation Command
```bash
node tools/dev/session-init.js --slug "index-optimization" --type "implementation" --title "Index Optimization" --plan "2025-12-db-performance"
```
```

### COMMENTS.md

```markdown
# Comments: [Plan Title]

## 2025-12-01 14:30 - James
Consider adding EXPLAIN ANALYZE output to session notes.

## 2025-11-30 09:15 - AI Agent
Detected pattern: Similar optimization was done in Gap 2 implementation.
Recommend reviewing `docs/sessions/2025-11-22-gap2-semantic-queries/`.

---
_To add a comment: Append to this file with timestamp and author_
```

### AI_SUGGESTIONS.md

```markdown
# AI Suggestions: [Plan Title]

_Generated: 2025-12-01_
_Status: pending | accepted | rejected_

## Suggestion 1: Add Query Pattern Catalog
**Confidence**: High
**Rationale**: Session history shows repeated query analysis. A catalog would reduce future work.
**Action**: Create `docs/patterns/query-patterns.md`
**Human Response**: [pending]

## Suggestion 2: Schedule Follow-up
**Confidence**: Medium
**Rationale**: Performance gains should be verified after 2 weeks of production use.
**Action**: Add session "Performance Verification" on 2025-12-15
**Human Response**: [pending]
```

## UI Components

### Left Sidebar: Plan Navigator
- List all plans with status indicators
- Filter by: Active, Completed, Archived
- Quick link to Sessions Hub

### Main Content: Plan Detail View
- Timeline visualization of sessions
- Status badges and progress indicators
- Comment thread
- AI suggestion panel

### Right Panel: File Structure
- Show actual file paths
- Quick actions (create session, edit plan, link session)
- Session linkage overview

## Integration Points

### With Session System
```javascript
// When creating a session linked to a plan
node tools/dev/session-init.js \
  --slug "index-optimization" \
  --type "implementation" \
  --title "Index Optimization" \
  --plan "2025-12-db-performance"

// This adds to docs/plans/2025-12-db-performance/SESSIONS.md
```

### Agent Plan Generation
```javascript
// Agent creates a new plan
const plan = {
  title: "Database Performance Sprint",
  objective: "Optimize query patterns...",
  sessions: [
    { title: "Query Analysis", type: "analysis" },
    { title: "Batch Operations", type: "implementation" },
    { title: "Index Optimization", type: "implementation" }
  ]
};

// Writes to docs/plans/2025-12-db-performance/PLAN.md
```

## Server Architecture

```
src/ui/server/projectPlanner/
├── server.js                    # Express server
├── build-client.js              # esbuild bundler
├── routes/
│   ├── plans.js                 # CRUD for plans (file-based)
│   ├── sessions.js              # Link/unlink sessions
│   └── comments.js              # Add/view comments
├── services/
│   ├── planService.js           # Read/write plan files
│   ├── sessionLinker.js         # Session integration
│   └── aiSuggestionService.js   # Generate suggestions
└── controls/
    ├── PlanListControl.js
    ├── PlanDetailControl.js
    ├── TimelineControl.js
    └── CommentControl.js
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/plans` | List all plans |
| GET | `/api/plans/:id` | Get plan details |
| POST | `/api/plans` | Create new plan |
| PUT | `/api/plans/:id` | Update plan |
| POST | `/api/plans/:id/comments` | Add comment |
| GET | `/api/plans/:id/suggestions` | Get AI suggestions |
| POST | `/api/plans/:id/suggestions/:sid/accept` | Accept suggestion |
| POST | `/api/plans/:id/sessions` | Link session to plan |

## Design Theme

**Industrial Luxury Obsidian** (consistent with z-server):
- Dark obsidian base (`#050508`, `#0a0d14`, `#141824`)
- Gold accents for headers and active states (`#c9a227`)
- Emerald for completed items (`#10b981`)
- Amethyst for AI elements (`#9966cc`)
- Sapphire for secondary elements (`#6fa8dc`)

## Next Steps

1. [ ] Create `docs/plans/` directory structure
2. [ ] Create INDEX.md template
3. [ ] Extend `session-init.js` to support `--plan` flag
4. [ ] Build server skeleton
5. [ ] Implement jsgui3 controls
6. [ ] Create AI suggestion generation service
