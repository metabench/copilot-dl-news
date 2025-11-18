# Working Notes — 2025-11-21 Relationship Tokens

## Command Log
- `node tools/dev/js-scan.js --dir tools/dev --what-imports tools/dev/js-scan/operations/search.js --ai-mode --json` (manual sanity check before coding).
- `node tools/dev/js-scan.js --dir tools/dev --export-usage tools/dev/js-scan/operations/search.js --ai-mode --json` (confirmed importer/usage payload shapes).
- `npm run test:by-path tests/tools/ai-native-cli.smoke.test.js` (post-change verification, 24 tests passing).

## Notes
- Snapshot helpers now emit js-edit hints that target the first import/call line via `--snipe-position`; these serve as the data contract for the future js-edit ingestion work.
- Relationship token generation caps the action list at `MAX_RELATIONSHIP_ACTIONS` (10) to prevent runaway token counts on widely used modules.
- Digest mismatches trigger the same `RESULTS_DIGEST_MISMATCH` warning path as search tokens, since we recompute digests by replaying the relationship query.
- Continuation handler branches on `parameters.relationship` to keep search tokens untouched while unlocking importer/usage responses.

## Follow-ups
- Wire js-edit to accept `match` snapshots or continuation tokens directly.
- Consider exposing optional ripple actions (`importer-ripple`) once agents ask for them.
