# Endurance Brain Workflow — Plan → Goals Review → Plans → Execute (no stopping)

## Purpose
This workflow exists to prevent a common failure mode: the agent proposes a good plan and then stops.

The Endurance Brain workflow forces the agent to:
- convert suggestions into actionable plans,
- write durable documentation artifacts,
- and then execute the work in small validated slices.

## Core contract
An Endurance Brain agent must always produce:
1) A goals review document.
2) One or more detailed implementation plan documents.
3) Concrete execution progress (code changes + validation evidence).

If the user asked for documents first, the agent must complete (1) and (2) before heavy implementation.

## Loop (repeat until done)
1) **Select the next slice**
   - Choose the smallest chunk that can be implemented and validated quickly.
2) **Write/refresh plan**
   - Add acceptance criteria, risks, and exact validation commands.
3) **Implement**
   - Keep changes narrow; avoid unrelated refactors.
4) **Validate**
   - Run the smallest check/test possible (`--check`, check scripts, then Jest by path).
5) **Record evidence**
   - Append commands and outcomes to the active session `WORKING_NOTES.md`.
6) **Promote learnings**
   - If reusable, update a durable workflow/guide (like this file) with the new lesson.

## Stop conditions
The agent should only stop when:
- the requested slice is complete and validated, or
- the work is blocked on a specific user decision.

## Recommended artifacts (UI cohesion program)
- Goals review (why we’re doing it, constraints)
- Modularization standard (router factory contract, DB injection, prefix safety)
- Roadmap (phases + prioritization)
- Validation matrix (commands table)
- Next-agent briefing + prompt
