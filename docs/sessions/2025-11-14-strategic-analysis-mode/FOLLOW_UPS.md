# Follow Ups – Strategic Analysis Mode

1. Draft `tools/dev/js-workflow-helper.js` (or update docs) that wraps common js-scan/js-edit flows without relying on Bash/`jq`; refresh `docs/AGENT_CODE_EDITING_PATTERNS.md` with PowerShell + Node examples.
2. Spec and implement `js-scan --class-map <file>` view for large classes (starting with `src/crawler/QueueManager.js`) plus doc entry in `tools/dev/README.md`.
3. Build `tools/dev/test-suggest.js` to map a source file to Jest files + ready-to-run `npm run test:by-path <path>` commands; integrate into AGENT testing quick reference.
4. Prototype `tools/dev/js-plan-bootstrap.js` that turns relationship data (`--what-calls`, `--export-usage`) into guarded `changes.json` or plan stubs for multi-file updates.
