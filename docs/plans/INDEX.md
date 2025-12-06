# Project Plans Index

_Last Updated: 2025-12-01_

> **Purpose**: AI-generated long-term project plans for human review and commentary.
> All plans link to `docs/sessions/` for execution tracking.

## Active Plans

| Plan | Status | Progress | Next Session | Priority |
|------|--------|----------|--------------|----------|
| — | — | — | — | — |

## Completed Plans

| Plan | Completed | Sessions | Summary |
|------|-----------|----------|---------|
| — | — | — | — |

## Archived Plans

| Plan | Archived | Reason |
|------|----------|--------|
| — | — | — |

---

## How to Use This System

### Creating a New Plan

1. **Agent-Generated**: AI agents create plans based on project context
2. **Human-Initiated**: Use the planner UI or manually create:

```bash
# Create plan directory
mkdir -p docs/plans/YYYY-MM-<slug>

# Create required files
touch docs/plans/YYYY-MM-<slug>/PLAN.md
touch docs/plans/YYYY-MM-<slug>/SESSIONS.md
touch docs/plans/YYYY-MM-<slug>/COMMENTS.md
touch docs/plans/YYYY-MM-<slug>/AI_SUGGESTIONS.md
```

### Linking Sessions to Plans

When creating a session, link it to a plan:

```bash
node tools/dev/session-init.js \
  --slug "<session-slug>" \
  --type "<category>" \
  --title "<Title>" \
  --plan "<plan-directory-name>"
```

This automatically:
- Creates the session in `docs/sessions/`
- Updates `docs/plans/<plan>/SESSIONS.md`
- Updates this index

### Plan Status Lifecycle

```
draft → active → completed
           ↓
       archived
```

- **draft**: Plan created, under review
- **active**: Approved, sessions in progress
- **completed**: All sessions done, objectives met
- **archived**: Superseded or abandoned

### File Structure

```
docs/plans/<plan-slug>/
├── PLAN.md              # Main plan document
├── SESSIONS.md          # Session timeline and links
├── COMMENTS.md          # Human commentary
├── AI_SUGGESTIONS.md    # Agent recommendations
└── artifacts/           # Supporting files
    ├── benchmarks.json
    ├── diagrams/
    └── ...
```

---

## Quick Links

- [Sessions Hub](../sessions/SESSIONS_HUB.md) — All session tracking
- [AGENTS.md](../../AGENTS.md) — Agent workflow guidance
- [Planner UI Design](../designs/AI_PROJECT_PLANNER_UI_DESIGN.svg) — Visual design
