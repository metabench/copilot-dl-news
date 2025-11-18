# Plan: js-scan-token-loop
Objective: Upgrade js-scan continuation tokens so follow-up actions (analyze/trace/ripple) execute real work without manual reseeding, and capture guidance for downstream agents.

Done when:
- search tokens carry enough metadata to rehydrate the exact match (file, hash, selector).
- `node tools/dev/js-scan.js --continuation <token>` executes the encoded action (analyze/trace/ripple) and returns structured JSON.
- Trace/ripple follow-ups leverage RelationshipAnalyzer/analyzeRipple utilities with clear outputs.
- docs/tests describe and exercise the resumed workflow (ai-native CLI smoke suite updated).

Change set:
- tools/dev/js-scan.js (token payload, handler execution, output contract)
- tools/dev/js-scan/operations/search.js (if extra match metadata is needed)
- tests/tools/ai-native-cli.smoke.test.js (cover new behavior)
- docs/agi/tools/JS_SCAN_DEEP_DIVE.md, docs/agi/TOOLS.md, docs/agi/LESSONS.md (usage + lessons)
- docs/sessions/2025-11-20-js-scan-continuation/{WORKING_NOTES,SESSION_SUMMARY}.md

Risks/assumptions:
- Token cache TTL (1h) must be enough; add friendly errors when match snapshots stale.
- RelationshipAnalyzer heuristics rely on function names; may need fallback to file/hash selectors.
- CLI output must stay backward compatible for non-ai-mode runs.

Tests:
- `node tools/dev/js-scan.js --dir tools/dev --search scanWorkspace --limit 1 --ai-mode --json`
- `node tools/dev/js-scan.js --continuation <token> --json` (for analyze/trace/ripple)
- `npm run test:by-path tests/tools/ai-native-cli.smoke.test.js`

Docs to update:
- docs/agi/tools/JS_SCAN_DEEP_DIVE.md (continuation recipes)
- docs/agi/TOOLS.md (token workflow references)
- docs/agi/LESSONS.md + journal entry for outcomes
