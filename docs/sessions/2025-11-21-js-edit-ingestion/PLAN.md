# Plan: js-edit-ingestion
Objective: Allow js-edit to consume js-scan match snapshots or continuation tokens so agents can replay guards without rerunning locate commands.

Done when:
- `js-edit --match-snapshot <path|->` validates the embedded file/hash/span and hydrates BatchDryRunner inputs without extra selectors.
- A stdin-friendly `--from-token -` path decodes js-scan continuation tokens, extracts the match snapshot/jsEditHint, and emits guard plans identical to `--from-plan`.
- AI-native smoke tests cover a js-scan search → continuation → js-edit preview workflow with digest mismatch warnings exercised.
- Docs (JS_EDIT_DEEP_DIVE, JS_SCAN_DEEP_DIVE, journal/session notes) describe the ingestion workflow and remaining guardrails.

Change set:
- `tools/dev/js-edit.js` (argument parser, snapshot ingestion, TokenCodec hook, BatchDryRunner wiring).
- `tools/dev/js-edit/shared/*` or new helper for snapshot validation (if needed) plus TokenCodec import reuse from js-scan.
- `tests/tools/ai-native-cli.smoke.test.js` to add search→ingest coverage.
- Session/docs updates under `docs/agi` and `docs/sessions/2025-11-21-js-edit-ingestion/`.

Risks/assumptions:
- Snapshot schema from js-scan is stable (fields: file, digest, span, selector, jsEditHint). Any drift should surface via digest mismatch warnings.
- BatchDryRunner currently assumes local file access; multi-file tokens must error clearly if files differ.
- Token decoding depends on `TokenCodec`; need to avoid cyclic deps and ensure TTL errors propagate gracefully.

Tests:
- `npm run test:by-path tests/tools/ai-native-cli.smoke.test.js` (covers new flow).

Docs to update:
- `docs/agi/tools/JS_EDIT_DEEP_DIVE.md`
- `docs/agi/tools/JS_SCAN_DEEP_DIVE.md`
- `docs/agi/TOOLS.md`
- `docs/agi/journal/2025-11-21.md` & session WORKING_NOTES.
