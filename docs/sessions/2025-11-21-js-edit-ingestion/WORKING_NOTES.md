# Working Notes – js-edit Ingestion

## Timeline
- **Sense**: Re-read js-edit CLI entry + mutation operations, TokenCodec helper, and BatchDryRunner guard plumbing to confirm where to ingest snapshots. Cross-checked js-scan `_ai_native_cli` payload schema to make sure js-edit expects `{ file, digest, span, selector, jsEditHint }`.
- **Plan alignment**: Confirmed PLAN.md goals (match snapshot hydration, stdin token path, smoke coverage, docs). Noted doc backlog (journal updates + tooling catalog refresh) for end of session.

## Implementation Notes
- Added stdin helpers (`readAllStdin`, snapshot/token readers) so `--match-snapshot -` and `--from-token -` can hydrate without temp files.
- Wired TokenCodec hydrate flow: tokens now resolve to cached `_ai_native_cli` envelopes; js-edit validates repo root alignment before emitting guards.
- Introduced `hydrateMatchSnapshotContext` to normalize CLI args into BatchDryRunner inputs (file path verification, digest/span guard, js-edit hint extraction).
- Mutation op gained `ingestMatchSnapshot` pathway that emits plans + warnings if local hashes drift; reuses guard summary output for consistency with `--locate`.
- CLI now surfaces `--match-snapshot <path|->` and `--from-token <path|->` options ahead of standard operations; ingestion fires before other actions to keep workflows linear.

## Verification
- `npm run test:by-path tests/tools/ai-native-cli.smoke.test.js`
  - Added two new smoke scenarios: (1) snapshot file ingestion emits a guarded plan; (2) piping a continuation token via stdin hydrates the same plan.
  - Suite passes locally; results stored in session history.

## Follow-ups / Open Questions
- Consider recipes that chain js-scan relationship continuations directly into js-edit replacements once `js-edit --from-plan` accepts stdin tokens.
- Document guard mismatch remediation (rerun js-scan to refresh token) inside AGI lessons / tooling quick references.
- Evaluate caching strategy for match snapshots so ingestion can warn if cache entry expired before js-edit runs.
