# Plan – Crawl Observer live breakpoints

## Objective
Add live polling and UI-configurable stop conditions to Crawl Observer task pages

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `src/ui/server/crawlObserver/server.js`
- (Optional) `checks/` or `src/ui/server/crawlObserver/checks/` for a lightweight SSR sanity script

## Risks & Mitigations
- jsgui3 SSR markup changes break existing UI assumptions → keep changes additive and ID-scoped.
- Polling endpoint too heavy → use incremental `sinceSeq` + sensible `limit` and client interval.
- “Stop on decision” remains heuristic until crawler emits structured decision events → define an event schema and align producers later.

## Tests / Validation
- Node load check: `node -e "require('./src/ui/server/crawlObserver/server.js')"`
- Manual smoke:
	- Start Crawl Observer: `node src/ui/server/crawlObserver/server.js`
	- Visit a task detail page and confirm:
		- New events append without refresh
		- Stop rules pause polling and highlight the matching event
