# Working Notes — 2025-11-20 js-scan Continuation Loop

## Command Log
- `node tools/dev/js-scan.js --dir tools/dev --search scanWorkspace --limit 1 --ai-mode --json`
	- Captured new `jsEditHint` + continuation payload to verify token snapshots before handler work.
- `npm run test:by-path tests/tools/ai-native-cli.smoke.test.js`
	- Full AI-native smoke suite (21 tests) covering analyze/trace/ripple continuations and compact token decoding.
- `npm run test:by-path tests/tools/ai-native-cli.smoke.test.js`
	- Re-ran after digest warning implementation (22 tests now) to exercise new mismatch scenario.

## Findings / Decisions
- Token payloads now carry `match`, `search_terms`, and replay context; handlers can skip rescans if metadata still fresh.
- Analyze/trace/ripple handlers return concrete JSON responses; js-edit hints flow through `analysis.jsEditHint` for downstream automation.
- Compact token expectations in smoke tests updated (signature is null, `_is_compact` true).
- Digest mismatch detection warns agents when cached tokens no longer match replayed search results, preventing stale selectors from leaking into edits.

## Next Actions
- Implement token payload snapshot
- Add handler execution per action (analyze/trace/ripple)
- Update smoke tests + docs
