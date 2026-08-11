# Project Plans Index

_Last Updated: 2026-08-11_

> **Purpose**: AI-generated long-term project plans for human review and commentary.
> All plans link to `docs/sessions/` for execution tracking.

> **This index is hand-maintained, and it rotted.** Until 2026-08-07 its header
> read *Last Updated: 2026-03-08* while the table below described July plans;
> "Completed" and "Archived" were both empty rows; and `2026-07-db-driven-crawling`
> was listed as active with "P5 next" while `RESEARCH_BACKLOG.md` recorded RB-012
> as **Delivered — P1-P6 all shipped + live-verified**. Two records, one fact,
> opposite answers — the failure mode `docs/agi/BOOT.md`'s "derived by default"
> rule exists to catch.
>
> Plan status is not mechanically derivable, so this stays typed. That makes
> keeping it current a real obligation: when a plan's work lands, move its row
> the same day, and cite the authoritative record (a backlog row, a ledger
> cycle) rather than restating progress from memory.

## Active Plans

| Plan | Status | Progress | Next Session | Priority |
|------|--------|----------|--------------|----------|
| [2026-07-22-module-ecosystem](./2026-07-22-module-ecosystem.md) | **ACTIVE OWNER DIRECTIVE** | working model defined; news-crawler-itself bootstrapped (README+AGENTS); **engine extraction underway and instrumented** — engine-debt 365 → 164 (2026-08-04 … 2026-08-11, banked every slice), 191 delegating requires across 50 subpaths. Endpoint measured 2026-08-11: 105 movable, 59 blocked. Authority: `tools/dev/checks/engine-debt.check.js` ceiling + `tools/dev/extraction-endpoint.js` | resume slices; the 59 blocked need `DEC-ENGINE-BOUNDARY` answered | **critical** |
| [2026-07-distributed-crawl-unification](./2026-07-distributed-crawl-unification.md) | active | D1–D3 + D2a deployed/verified; D4 slices 1+2a shipped; implementation home moving to news-crawler-itself | D4 slice 2b after extraction | high |
| [2026-03-v5-remote-crawler-application](./2026-03-v5-remote-crawler-application/PLAN.md) | superseded in substance by the Gen2 unification + module-ecosystem plans | planning complete, implementation not started | — | low |

## Completed Plans

| Plan | Completed | Authority | Summary |
|------|-----------|-----------|---------|
| [2026-07-db-driven-crawling](./2026-07-db-driven-crawling.md) | 2026-07-20 | `RESEARCH_BACKLOG.md` RB-012 = **done** | P1–P6 all shipped and live-verified: frontier reads, recency knob, hydration, DB-seeded fetching, place-hub redownload, concurrent multi-host runs. Plus the quality layer the live runs demanded (news-host policy, dead-hub suppression, low-value URL gate, redirect-aware reconciliation). Optional edge-graph/provenance deliberately skipped — no consumer. Moved here 2026-08-07; the row above had said "P5 next" for eighteen days after RB-012 was marked delivered. |

## Archived Plans

| Plan | Archived | Reason |
|------|----------|--------|
| [IMPROVEMENT_RECOMMENDATIONS_2026-01-06](./IMPROVEMENT_RECOMMENDATIONS_2026-01-06.md) | 2026-08-07 | Last touched 2026-02-08; **zero references** anywhere in the tree. Kept as a point-in-time record of what was recommended then — not a live plan. |
| [PLAN-zserver-green-svg-fix](./PLAN-zserver-green-svg-fix.md) | 2026-08-07 | Last touched 2025-12-06; **zero references**. A narrow fix plan, long since overtaken. |
| [crawler-electron-app-improvements](./crawler-electron-app-improvements.md) | 2026-08-07 | Last touched 2026-01-06; **zero references**. The electron surface has changed substantially since (see `docs/decisions/` and the ui-debt audit). |

Archived here means *no longer a live plan* — the files stay. A dated plan is a
record of what was believed at the time, and cycle 208 settled that destroying
such a record to tidy the present is a bad trade.

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
