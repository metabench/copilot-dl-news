# Working Notes: scan-edit-remnants

## Inputs & Commands
- 2025-11-16 10:10 — `node tools/dev/md-scan.js --dir docs/sessions --search "js-edit" --json` → highlighted high-signal docs for tooling backlog (2025-11-16 typescript-support-copy-functions, 2025-11-16 js-ts scan/edit brainstorm, 2025-11-13 gap5 scouting, 2025-11-20 ui-home-card-cli regression note).
- 2025-11-16 10:14 — `node tools/dev/js-scan.js --what-imports tools/dev/js-edit.js --json` → confirmed only `tools/dev/ts-edit.js` imports js-edit (no additional consumers), so backlog items center on CLI/tooling features rather than downstream modules.

## Findings
- 2025-11-16 TypeScript Support session (`docs/sessions/2025-11-16-typescript-support-copy-functions/WORKING_NOTES.md`): Phase 1–3 tasks remain open (ship `lib/swcTs.js`, `ts-edit.js`/`ts-scan.js` wrappers, env-var switches inside js-edit/js-scan, copy-from selectors, mutation helpers, js-scan-assisted plan generation).
- Same session’s `BATCH_IMPROVEMENTS.md`: Only the `--copy-batch` prototype checkbox is complete; remaining backlog covers structured plan schema + metadata, dependency-aware batching, transactional apply/rollback, guard expansion, logging/audit trail, integration tests.
- `docs/TOOLING_IMPROVEMENTS_BEYOND_GAP_3.md`: Wave-2/3/4 items still pending (fuzzy matching + diff previews, cross-file atomic batches with rollback, test validation hook, journal/resume, progress streaming) plus hotfix “Improvement 6” to rewire `--changes --dry-run` ingestion.
- `docs/sessions/2025-11-13-gap5-scouting/FOLLOW_UPS.md`: Gap 6 (call-graph, hot-path, dead-code analysis in js-scan) remains unimplemented after Gap 5 delivery.
- `docs/sessions/2025-11-20-ui-home-card-cli/SESSION_SUMMARY.md`: UI agents blocked on Improvement 6 fix for js-edit (Gap 3 regression) before they can resume standard workflows.

## Follow-ups / Questions
- _pending_
