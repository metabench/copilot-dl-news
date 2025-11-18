# Plan: js-scan-terse-output

**Lifecycle Phase: Spark → Spec City prep**

Objective: Strengthen `tools/dev/js-scan.js` so it can read TypeScript sources more effectively and emit terser, direct output for the required sections the user wants surfaced.

Done when:
- Context from earlier js-scan/js-edit work plus relevant docs is captured in `WORKING_NOTES.md`.
- Current js-scan TypeScript handling and CLI output gaps are identified via Tier 1 discovery commands.
- Concrete improvements to js-scan parsing/output are implemented (code + tests) to address the gaps.
- Updated behavior is documented (session notes + any impacted guides) and validated through the appropriate Jest suites.

Change set (expected):
- `tools/dev/js-scan.js`
- `tools/dev/js-scan/` helpers if new parsing/output utilities are needed
- `tests/tools/js-scan/*.test.js` (add/extend coverage)
- `docs/AGENT_REFACTORING_PLAYBOOK.md` or other tooling docs if output contract shifts
- Session docs under `docs/sessions/2025-11-16-js-scan-terse-output/`

Risks/assumptions:
- js-scan currently leans on SWC for JS parsing; TypeScript constructs may require different parser flags or AST traversal logic.
- Output changes must stay compatible with bilingual/AI-mode expectations.
- Need to avoid regressions for existing JS workflows while tightening verbosity for requested sections.

Tests:
- Targeted Jest suites under `tests/tools/js-scan/` (exact file TBD after discovery).
- Capture at least one `npm run test:by-path tests/tools/__tests__/js-scan.test.js` run in notes once TypeScript flag wiring is complete.

Benchmark: Not applicable unless parser performance noticeably changes; capture parse timings if adjustments add overhead.

Docs to update:
- Session docs (notes + summary)
- `docs/AGENT_REFACTORING_PLAYBOOK.md` or related CLI references if CLI ergonomics change (e.g., new `--source-language` flag, terse field guarantees).
