# Plan – Distributed crawl packaging

## Objective
Design & prep distributed crawl nodes for place-hub checks

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- docs/sessions/2026-01-07-distributed-crawl/** (plan, notes, design doc)


## Risks & Mitigations
- Bandwidth/egress assumptions may not match remote host limits — document assumptions and keep design with configurable concurrency.
- Packaging drift (missing deps) — prescribe explicit install steps and minimal bundle checklist.
- Security of self-signed HTTPS node — keep crawl packaging non-HTTP; prefer SSH/SCP for artifact transfer.


## Tests / Validation
- Design review only: architecture doc produced plus checklist for pilot deployment.
