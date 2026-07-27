# Project Plans Index

_Last Updated: 2026-03-08_

> **Purpose**: AI-generated long-term project plans for human review and commentary.
> All plans link to `docs/sessions/` for execution tracking.

## Active Plans

| Plan | Status | Progress | Next Session | Priority |
|------|--------|----------|--------------|----------|
| [2026-07-22-module-ecosystem](./2026-07-22-module-ecosystem.md) | **ACTIVE OWNER DIRECTIVE** | working model defined; news-crawler-itself bootstrapped (README+AGENTS); first extraction (remote crawler engine + parallel compression) next | crawler engine → news-crawler-itself | **critical** |
| [2026-07-distributed-crawl-unification](./2026-07-distributed-crawl-unification.md) | active | D1–D3 + D2a deployed/verified; D4 slices 1+2a shipped; implementation home moving to news-crawler-itself | D4 slice 2b after extraction | high |
| [2026-03-v5-remote-crawler-application](./2026-03-v5-remote-crawler-application/PLAN.md) | superseded in substance by the Gen2 unification + module-ecosystem plans | planning complete, implementation not started | — | low |
| [2026-07-db-driven-crawling](./2026-07-db-driven-crawling.md) | active | P1+P2+P3+P4 shipped (frontier read, recency knob, queue hydration, real DB-seeded fetching live-verified) | P5: on-demand place-hub redownload | high |

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
