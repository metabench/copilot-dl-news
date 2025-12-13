# Plan – HTTP Record/Replay Harness + Decision Trace Milestones

## Objective
Add opt-in HTTP fixture record/replay for deterministic crawler tests, and standardize decision traces persisted as milestones (opt-in).

## Done When
- [x] HTTP Record/Replay works for at least one targeted crawler-facing workflow (integration or e2e style test) without network access.
- [x] Recording is opt-in (explicit flag/config) and replay is deterministic (no silent network fallthrough).
- [ ] Decision trace “shape” is standardized (kind/message/details) and persistence remains opt-in + mode-gated.
- [x] The `HttpRequestResponseFacade` API mismatch (static vs instance usage) is resolved or explicitly quarantined with tests proving whichever path is active.
- [x] Focused validations are run and logged in `WORKING_NOTES.md`.
- [x] Key decisions + resulting behavior are summarized in `SESSION_SUMMARY.md`, and follow-ups are captured in `FOLLOW_UPS.md`.

## Context (what we know)
- There is an existing response-body cache substrate in `http_responses` + `content_storage` via `HttpRequestResponseFacade`.
- There is an existing fetch telemetry recorder (`createFetchRecorder`) that records metadata but does not store response bodies.
- Milestone persistence already exists (via `insertMilestone` / `emitMilestone`) and is the preferred durable store for explainability traces.
- Some gazetteer ingestors appear to call `HttpRequestResponseFacade` as an instance with a different signature than the current static API.

## Approach (phased)

### Phase 0 — Unblock: resolve facade API mismatch (priority)
Primary agent: `agi-refactor` (careful)

Goal: make `HttpRequestResponseFacade` usable consistently so record/replay can plug in without guessing.

Options (choose one, document decision):
- **Option A (adapter wrapper):** add a thin instance wrapper class that accepts `{ db }` and exposes instance methods that delegate to the static methods.
- **Option B (update callers):** update call sites (e.g., ingestors/tools) to call static `cacheHttpResponse(db, ...)` / `getCachedHttpResponse(db, url, options)` correctly.

Success criteria:
- One consistent API is used in at least the codepaths covered by tests.
- No accidental network requests are introduced.

### Phase A — HTTP Record/Replay harness (fixtures)
Primary agent: `agi-refactor` (careful)

Goal: provide a small test-oriented harness that can:
- **record**: capture HTTP requests + responses (including body) into deterministic fixtures,
- **replay**: serve responses from fixtures without network access.

Design constraints:
- Default is safe: no recording unless explicitly enabled.
- Replay mode should fail fast on missing fixture (so tests don’t silently hit network).
- Keep fixtures compact and inspectable; do not store secrets.

Proposed shape:
- A wrapper around fetch (or the central fetch/caching layer if one exists) that supports a mode:
	- `mode: 'live' | 'record' | 'replay'`
	- fixture dir path (likely under `tests/fixtures/http/`)
	- per-test namespace (so parallel tests don’t collide)
- Use `HttpRequestResponseFacade.generateCacheKey(url, request, metadata)` (or equivalent) as the stable fixture key.
- Fixture format: JSON metadata + separate body file or inline base64 blob depending on size/content-type.

Minimum viable target:
- Pick one “high-value” workflow where network determinism matters (candidate: Wikidata ingestors or a small server/e2e path).
- Add one regression test proving replay works with network disabled.

### Phase B — Decision explainability pipeline (standardize + persist)
Primary agent: `agi-refactor` (careful)

Goal: standardize a small “decision trace” schema and provide helpers to emit/persist as milestones.

Constraints (must keep):
- Persistence remains opt-in, mode-gated, and explicit (`persist: true`).
- Avoid DB bloat by default; do not write per-request traces unless enabled.

Proposed trace schema (example, final may vary):
- `kind`: stable identifier (e.g., `hub-freshness-decision`, `fetch-policy-decision`)
- `message`: short human summary
- `details`: JSON payload with inputs/outputs (policy, cache age, fallback decision, etc.)
- `scope`: optional (crawler id/run id/url)

Implementation idea:
- Add a helper in crawler events (or a small utility) that:
	- normalizes trace shape,
	- enforces size/field constraints,
	- stamps timestamps and source,
	- emits as a milestone with `persist: true` only when config enables it.

## Change Set (expected)
- `src/utils/HttpRequestResponseFacade.js` (API normalization or wrapper)
- One or more call sites that currently use the facade with the wrong signature (gazetteer ingestors/tools)
- New record/replay utility (likely under `src/utils/fetch/` or `src/testing/` depending on patterns)
- Tests under `tests/` that prove replay without network
- Session docs: `WORKING_NOTES.md`, `SESSION_SUMMARY.md`, `FOLLOW_UPS.md`

## Risks & Mitigations
- **Facade mismatch hides dead codepaths:** add a focused test that exercises the chosen entrypoint so drift can’t persist silently.
- **Fixture brittleness / nondeterministic keys:** reuse the facade cache key generator; include method + canonical headers if needed.
- **Fixtures accidentally include secrets:** whitelist headers to record; redact `authorization`, cookies, tokens.
- **Binary responses:** store as base64 with `content-type` and `encoding` metadata.
- **DB bloat from traces:** keep persistence gated (`hubFreshness.persistDecisionTraces` + `persist: true`) and consider size caps.

## Tests / Validation (focused)
- Run the smallest target test(s) that cover replay behavior using `npm run test:by-path <path>`.
- Add at least one test that fails if network is used during replay.
- If touching UI server paths, prefer `node <server> --check` or the local `checks/*.check.js` scripts (no long-running server without `--check`).

## Delegation
- Implementation should be executed by a careful refactor agent with narrowly-scoped diffs and targeted Jest runs.

## Risks & Mitigations
- _Note potential risks and how to mitigate them._

## Tests / Validation
- _Describe tests to run or evidence required before completion._
