# Plan – Crawl Remote Bounded Reliability

## Objective
Make bounded remote crawls reliable and low-friction by fixing multi-domain follow-on scheduling, preserving completion visibility, and adding a one-command remote run-and-wait CLI path.

## Done When
- [ ] Multi-domain orchestration starts second-wave idle domains correctly and respects max concurrency.
- [ ] Remote status remains useful after workers stop so completed bounded runs can be inspected without racing stale status files.
- [ ] `tools/crawl/crawl-remote.js` exposes a bounded run command that starts, waits, and exits with success/failure.
- [ ] Targeted regression coverage captures the scheduling and bounded-run completion rules.
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.

## Change Set (initial sketch)
- `deploy/remote-crawler-v2/multi-domain-server.js`
- `deploy/remote-crawler-v2/lib/orchestrator-utils.js`
- `tools/crawl/crawl-remote.js`
- `tools/crawl/lib/crawl-remote-bounded.js`
- `tests/tools/crawl-remote-bounded.test.js`
- `tools/crawl/AGENT.md`
- `docs/sessions/2026-03-08-crawl-remote-bounded-reliability/*`

## Risks & Mitigations
- Risk: fixing the idle-domain scheduler could accidentally start too many domains at once. Mitigation: compute open slots from current running count and test the concurrency edge case explicitly.
- Risk: preserving last known status could misreport a fresh run with stale completion data. Mitigation: clear cached domain status at each new start.
- Risk: a new bounded CLI path could mask partial completion. Mitigation: track requested domains explicitly and fail on timeout when any remain not-started or still running.

## Tests / Validation
- `npm run test:by-path -- tests/tools/crawl-remote-bounded.test.js`
- Live remote bounded crawl smoke after patch via `node tools/crawl/crawl-remote.js bounded ...`
