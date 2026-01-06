# Plan – Multi-modal crawl review and parallelization

## Objective
Audit latest session work, fix testing/console noise, improve hub guessing + multi-site crawling, and make multi-modal crawl the default

## Done When
- [ ] Latest session work reviewed; SQL usage verified to live in db adapters or moved there with docs updated (scan found non-adapter SQL; needs follow-up).
- [x] Test runner + tests fixed, executed, and evidence logged in `WORKING_NOTES.md` (one suite skipped due to `better-sqlite3` ELF mismatch on /mnt/c).
- [x] Console output minimized (tests + CLI noise), with defaults documented.
- [x] Hub guessing/hub exploration improved (Guardian + general).
- [x] Multi-modal crawl set as default method with initial batch size ~1000.
- [ ] Documentation gaps closed (inline JSDoc + referenced book chapters updated; JSDoc expansion still pending).
- [ ] Multi-site crawl concurrency improved with rationale documented.
- [x] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `src/crawler/**` (multi-modal orchestration, hub discovery, concurrency)
- `src/cli/**` or `tools/**` (default runner + CLI noise/progress)
- `src/config/**` and `config.json` (default crawl method)
- `src/services/**` (hub guessing integration as needed)
- `src/db/**` (adapter layer SQL placement + query helpers)
- `tests/**` or `checks/**` (targeted coverage + runner fixes)
- `docs/sessions/2026-01-06-multi-modal-intelligent-crawl-review/*`
- Referenced books under `docs/sessions/**/book/**` (as needed)

## Risks & Mitigations
- Risk: moving SQL impacts runtime behavior → mitigate with targeted tests + focused checks.
- Risk: concurrency changes alter crawl ordering/throughput → add metrics + small load test.

## Tests / Validation
- Run smallest relevant checks/scripts per subsystem touched.
- Add/execute targeted tests via `npm run test:by-path` or `npm run test:file`.
