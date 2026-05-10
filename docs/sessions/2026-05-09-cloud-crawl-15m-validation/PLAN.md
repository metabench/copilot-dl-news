# Plan – Cloud Crawl 15m Validation

## Objective
Make the 10x1000 cloud crawl path run under a strict 15-minute cap, validate useful crawl output, and emit actionable diagnostics.

## Done When
- [x] A one-command cloud crawl validation path exists with a default 15-minute hard deadline.
- [x] The validation path starts useful 10-site crawling when the remote node is healthy, stops it at deadline, drains/syncs locally, and records diagnostics.
- [x] Post-run validation checks local DB growth, host spread, HTTP/content health, ledger state, remote health, and perf/throughput stats.
- [x] Regression tests cover the validation math/diagnostics without doing live network or long waits.
- [x] Operator docs and crawl profile help identify the command, thresholds, artifacts, and live-run evidence.

## Change Set (initial sketch)
- `tools/crawl/cloud-crawl-e2e.js` or equivalent validation command.
- `tools/crawl/lib/*` helper(s) for bounded validation math and diagnostics.
- `tools/crawl/profiles/*` 15-minute e2e profile.
- `tools/crawl/index.js`, `tools/crawl/AGENT.md`, and session docs.
- Focused tests under `tests/tools/crawl/`.

## Risks & Mitigations
- Remote node may be unavailable or stale; preflight must fail fast with actionable diagnostics.
- Long-running crawls can hang; the validator must enforce a hard process deadline and cleanup remote crawling.
- Production DB is large; validation queries must use bounded indexed predicates and close DB handles.
- Existing worktree is dirty; keep edits scoped and do not revert unrelated changes.

## Tests / Validation
- Unit tests for validation thresholds, benchmark stats, diagnostics classification, and deadline command planning.
- Syntax checks for edited JS files.
- `npm run test:by-path` for focused crawl tests.
- Dry-run validation command proving the 15-minute run plan and artifact path.
- Live final report: `docs/sessions/2026-05-09-cloud-crawl-15m-validation/artifacts/cloud-crawl-e2e-2026-05-09T23-58-42-010Z.json` passed under the strict 15-minute cap.

## Workflow Path
- Intended workflow: V4 cloud-crawl healthy measurement branch.
- Required registry docs named by instructions are absent; available crawl workflow source is `tools/crawl/AGENT.md`.
