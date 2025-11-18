# Plan: relationship-tokens-phase-2
Objective: Extend js-scan continuation tokens to importer/export usage queries so AGI workflows can move from discovery to editing without manual re-runs.

Done when:
- `--what-imports` and `--export-usage` emit `_ai_native_cli` metadata plus continuation tokens in `--ai-mode --json` runs.
- Continuation tokens replay importer/usage entries, warn on digest drift, and surface js-edit hints for each match.
- Smoke tests exercise the new flows end-to-end.
- Docs/journal/sessions capture the behavior and forward-looking guardrails.

Change set:
- tools/dev/js-scan.js
- tests/tools/ai-native-cli.smoke.test.js
- docs/agi/{journal,LESSONS.md,TOOLS.md,tools/JS_SCAN_DEEP_DIVE.md,RESEARCH_BACKLOG.md}
- docs/sessions/2025-11-21-js-scan-relationship-tokens

Risks/assumptions:
- RelationshipAnalyzer outputs must remain stable enough for digest comparisons; warn instead of failing when drift detected.
- Importer lists may be large, so cap emitted actions to avoid token bloat.
- js-edit ingestion is deferred; make sure documentation calls out the remaining gap.

Tests:
- `npm run test:by-path tests/tools/ai-native-cli.smoke.test.js`

Docs to update:
- docs/agi/tools/JS_SCAN_DEEP_DIVE.md (usage instructions)
- docs/agi/TOOLS.md (capability matrix)
- docs/agi/LESSONS.md (new takeaways)
- docs/agi/journal/2025-11-21.md & session summary
- docs/agi/RESEARCH_BACKLOG.md (RB-006 status)
