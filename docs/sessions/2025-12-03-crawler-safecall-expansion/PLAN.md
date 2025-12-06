# Plan – Crawler SafeCall Expansion

## Objective
Extend safeCall utilities, add tests, and continue crawler cleanup

## Done When
- [ ] `safeCall`, `safeCallAsync`, and `safeHostFromUrl` have focused unit tests.
- [ ] `DomainThrottleManager` limiter/persist paths use `safeCall` helpers instead of ad-hoc try/catch.
- [ ] `CrawlerDb` (dbClient) accessor/mutation helpers are reduced to `safeCall` wrappers.
- [ ] Targeted Jest suites (utils + DomainThrottleManager + dbClient) pass and results are logged in `WORKING_NOTES.md`.
- [ ] Session docs (`SESSION_SUMMARY.md`, `FOLLOW_UPS.md`) capture outcomes and any open questions.

## Change Set (initial sketch)
- `src/crawler/utils.js` — no functional change, but new tests reference exports.
- `src/crawler/__tests__/utils.safeCall.test.js` — coverage for new utilities.
- `src/crawler/DomainThrottleManager.js` — import `safeCall`, wrap limiter/persist fallbacks.
- `src/crawler/dbClient.js` — replace repeated try/catch blocks with `safeCall` usage.
  
## Risks & Mitigations
- **Behavioral regressions in limiter/persistence** — keep fallbacks identical by ensuring `safeCall` returns previous defaults; add comments for any nuanced paths.
- **Async safeCall misuse** — stay mindful to keep async flows using the sync wrapper only where original code was sync.
- **Test brittleness** — new utility tests should avoid timing-based assertions; use fake timers where necessary.

## Tests / Validation
- `npm run test:by-path src/crawler/__tests__/utils.safeCall.test.js`
- `npm run test:by-path src/crawler/__tests__/DomainThrottleManager.test.js`
- `npm run test:by-path src/crawler/__tests__/dbClient.countrySlugs.test.js`
