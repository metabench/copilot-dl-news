# Plan Proposals

This directory contains plan proposals awaiting Central Planner review.

## Naming Convention

```
PROPOSAL-<date>-<slug>-<model>.md
```

Examples:
- `PROPOSAL-2025-12-01-db-optimization-gpt4mini.md`
- `PROPOSAL-2025-12-02-ui-refactor-claude35.md`

## Proposal Lifecycle

```
Created → Pending Review → [Decision]
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
     APPROVED            NEEDS REVISION        REJECTED
         │                    │                    │
         ▼                    ▼                    ▼
    Move to              Create v2,             Archive to
    docs/plans/          resubmit               rejected/
```

## Current Proposals

| Proposal | Model | Status | Submitted |
|----------|-------|--------|-----------|
| — | — | — | — |

## Review Authority

- **Central Planner**: GitHub Copilot (Claude Opus 4.5)
- **Human Authority**: James (final strategic decisions)

## How to Submit

1. Use the template from `🤖 Robot Planner 🤖.agent.md`
2. Include full attribution metadata
3. Score against CLEAR criteria (minimum 15/25)
4. Place file in this directory
5. Wait for Central Planner review

---

_See `docs/guides/PLANNING_PLANNING_STRATEGIES.md` for the full meta-planning guide._
