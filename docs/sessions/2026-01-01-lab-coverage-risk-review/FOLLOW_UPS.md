# Follow Ups – Lab Coverage Risk Review

- Add a minimal proof harness for `templateTeacher`.
	- Candidate: a root-level check script mirroring `checks/crawler-monitor.check.js` and `checks/visual-diff-tool.check.js` (create app, hit `/`, assert 200 + key markers).
	- Alternate: a Jest server test under `tests/ui/server/templateTeacher.test.js`.
- Add a minimal proof harness for `controlHarness` (currently no obvious tests/checks discovered).
	- Candidate: smoke check that verifies the control catalog page loads and contains expected control IDs.
- Background tasks API: extend contract coverage specifically around `RateLimitError` → 429 payload shape.
	- Confirm the API test covers `retryAfter`, `proposedActions`, and `context` fields in the 429 response.
- “Discoverability” improvement: add a short `README.md` under `src/ui/server/<module>/` pointing to the canonical test/check entry point when coverage exists elsewhere.
