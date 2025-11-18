# Working Notes — 2025-11-16-js-scan-terse-output

## Phase Tracker
- Spark ✅ (session + plan created)
- Spec City ✅ (md-scan discovery complete)
- Scaffold ✅ (gap inventory + change map captured)
- Thicken ✅ (span fix + CLI plumbing implemented)
- Polish 🔄 (tests + docs updates underway)
- Steward ☐

## Source Docs / Inputs Consulted
- [x] `AGENTS.md`
- [x] `docs/AGENT_REFACTORING_PLAYBOOK.md`
- [ ] Prior relevant session folders (search results logged below)

## Command Log
_Record Tier 1 tooling commands (js-scan/js-edit, md-scan, tests) with arguments + continuation tokens._

- 2025-11-16 11:02 — `node tools/dev/md-scan.js --dir docs/sessions --search js-scan --json`
- 2025-11-16 11:10 — `$env:TSNJS_SCAN_LANGUAGE='typescript'; node tools/dev/js-scan.js --dir C:\Users\james\Documents\repos\metabench-oracle-cloud-connector --search tsEdit --limit 20 --view terse --fields location,name,hash --json` (0 matches)
- 2025-11-16 11:15 — `$env:TSNJS_SCAN_LANGUAGE='typescript'; node tools/dev/js-scan.js --dir C:\Users\james\Documents\repos\metabench-oracle-cloud-connector --search Batch --limit 20 --view terse --fields location,name,hash --json`
- 2025-11-16 13:40 — `npm run test:by-path tests/tools/__tests__/js-scan.test.js` (syntax error surfaced in help text)
- 2025-11-16 14:05 — `npm run test:by-path tests/tools/__tests__/js-scan.test.js` (dependency traversal assertions failed due to broader snippet coverage)
- 2025-11-16 14:25 — `npm run test:by-path tests/tools/__tests__/js-scan.test.js` (PASS after help + test adjustments)
- 2025-11-16 14:10 — `node -e "const path=require('path'); const {scanWorkspace}=require('./tools/dev/js-scan/shared/scanner'); const fixtureDir=path.resolve('tests/fixtures/tools'); const res=scanWorkspace({dir:path.join(fixtureDir,'dep-root'), exclude:[]}); console.log(res.files.map(r=>r.relativePath));"`
- 2025-11-16 14:12 — `node -e "const path=require('path'); const {scanWorkspace}=require('./tools/dev/js-scan/shared/scanner'); const {runSearch}=require('./tools/dev/js-scan/operations/search'); const fixtureDir=path.resolve('tests/fixtures/tools'); const noFollow=scanWorkspace({dir:path.join(fixtureDir,'dep-root'), exclude:[]}); const result=runSearch(noFollow.files,['helperOne'],{limit:5}); console.log(JSON.stringify(result,null,2));"`

## Findings & Decisions
- CLI support for TypeScript no longer depends on `TSNJS_SCAN_LANGUAGE`; `--source-language` now drives parser selection (aliases wired into Chinese lexicon + help text). Added bilingual help hints under `lang` + `source_language` sections to explain the flags.
- Span normalization fix ensures SWC byte offsets stay local to the current file mapper, which in turn makes snippet previews accurate. This exposed that dependency traversal tests were implicitly relying on truncated snippets; updated the tests to assert dependency inclusion via file lists instead of snippet side-effects.
- Terse output now always surfaces `location/name/hash` plus optional `selector`, ensuring AI-mode consumers can ingest matches even when snippet text is empty.

## Follow-ups / Questions
- _TBD_
