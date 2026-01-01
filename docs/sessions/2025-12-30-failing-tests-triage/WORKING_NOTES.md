# Working Notes – Failing Tests Triage

- 2025-12-30 — Session created via CLI. Add incremental notes here.

## 2025-12-30 — db.latest_fetch

- Repro (current failure)
	- `npm run test:by-path src/__tests__/db.latest_fetch.test.js`
	- Error: `SqliteError: no such table: latest_fetch`
- Root cause
	- `insertFetch()` now maps to normalized schema (`urls` + `http_responses`) via `upsertArticle()`. The legacy `latest_fetch` table is no longer created by schema init.
- Fix
	- Updated the test to assert on `http_responses` (latest row by `fetched_at`) instead of `latest_fetch`.
- Validate
	- `npm run test:by-path src/__tests__/db.latest_fetch.test.js` ✅ PASS

## 2025-12-30 — migration orchestrator

- `npm run test:by-path src/db/migration/__tests__/orchestrator.test.js` ✅ PASS (historically failing, no current repro)

## 2025-12-30 — migration validator

- `npm run test:by-path src/db/migration/__tests__/validator.test.js` ✅ PASS (historically failing, no current repro)

## 2025-12-30 — export-gazetteer CLI

- Repro (current failure)
	- `npm run test:by-path src/tools/__tests__/export-gazetteer.test.js`
	- Initially failed because the CLI rejected `--quiet=1` as an unknown option.
- Root cause
	- `CliArgumentParser` treated boolean flags as valueless, so `--quiet=1` didn’t parse.
	- After fixing parsing, the test still failed because it selected the first exported `{type:"place"}` record, which is the bootstrap planet row (`extra: null`).
- Fix
	- `src/utils/CliArgumentParser.js`: allow boolean flags to accept optional explicit values (`--quiet=1`, `--quiet=false`, etc.).
	- `src/tools/__tests__/export-gazetteer.test.js`: select the seeded Dublin place row (`country_code === 'IE'`) before asserting `extra` scrubbing.
- Validate
	- `npm run test:by-path src/tools/__tests__/export-gazetteer.test.js` ✅ PASS
	- Note: test run still emits `(node:...) Warning: --localstorage-file was provided without a valid path` (noise, not addressed here).

## 2025-12-30 — populate-gazetteer CLI

- Repro (current failure)
	- `npm run test:by-path src/tools/__tests__/populate-gazetteer.test.js`
	- Failure: `SyntaxError: Unexpected token 'ℹ'` while `JSON.parse(first.out)`.
- Root cause
	- The tool supports `--summary-format json|ascii` (default `json`), but `GazetteerTelemetry` always rendered an ASCII summary and wrote info logs to stdout.
	- Tests (and callers) expect stdout to be machine-readable JSON when summaryFormat is `json`.
- Fix
	- `src/tools/gazetteer/GazetteerTelemetry.js`: honor `summaryFormat === 'json'` by emitting a single JSON summary line on stdout and routing human-readable logs to stderr; also suppress table output in JSON summary mode.
	- `src/tools/populate-gazetteer.js`: pass `summaryFormat` into `GazetteerTelemetry`.
- Validate
	- `npm run test:by-path src/tools/__tests__/populate-gazetteer.test.js` ✅ PASS

## 2025-12-30 — bucketCache

- `npm run test:by-path src/utils/__tests__/bucketCache.test.js` ✅ PASS (historically failing, no current repro)
