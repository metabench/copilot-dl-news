# Session 2025-11-14 – Session Bootstrap CLI & Micro Task Policy

**Objective**: Build a CLI helper that bootstraps session folders/templates and update agent guidance so micro tasks can proceed without heavy documentation overhead.

## Quick Links
- [Plan](./PLAN.md)
- [Working Notes](./WORKING_NOTES.md)

## Status
- 🔄 Active — implementation in progress

## Scope Highlights
- Design and implement a CLI (`tools/dev/session-init.js`) that generates session directories + markdown stubs and updates `SESSIONS_HUB.md`.
- Update Singularity Engineer + AGENTS docs with a session decision tree (full vs. lightweight vs. micro-task) and logging expectations.
- Add a shared micro-task log doc so tiny changes still leave a trace without full session overhead.
