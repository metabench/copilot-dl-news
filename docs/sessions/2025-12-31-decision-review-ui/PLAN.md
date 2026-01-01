# Plan – Decision Review UI (Pause-on-decision crawl)

## Objective
Design an integrated UI to pause on each crawl decision and inspect the decision plus premises; map current decision-tree/crawl UIs and propose implementation steps

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- Likely UI entrypoint: `src/ui/server/crawlObserver/` (add decision detail pane + controls).
- Likely crawler instrumentation: whichever modules perform the targeted decisions (to be discovered).
- Likely DB/control plane: either `task_events` payload conventions or a new small control table.
- Docs: this session + optionally `docs/designs/FACT_BASED_CLASSIFICATION_SYSTEM.md` cross-links.

## Risks & Mitigations
- Risk: too many “decision events” (DB bloat) → mitigation: levels (summary vs verbose) + filter toggles + sampling.
- Risk: crawler hang if UI never resumes → mitigation: watchdog timeout, “continue after N seconds”, and/or safe stop.
- Risk: unclear definition of “premises” across subsystems → mitigation: start with decisionTree-style paths; add richer premises incrementally.

## Tests / Validation
- Add one focused `checks/*.check.js` once the first decision trace is wired (render a page + assert decision events visible).
- Exercise with `tools/dev/task-events.js --timeline <taskId>` to confirm events persist and ordering is stable.

