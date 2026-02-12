---
type: workflow
id: tier1-tooling-loop
status: canonical
audience: agents
tags:
   - tooling
   - js
   - refactor
last-reviewed: 2026-02-12
---

# Tier 1 Tooling Loop

_Audience_: Agents editing JavaScript/TypeScript code under `src/` or `tools/`.

This workflow codifies the four-phase loop mandated in AGENTS.md + Singularity Engineer instructions: discover with `js-scan`, plan changes, dry-run with `js-edit`, and verify. Follow it every time you modify JS to keep refactors safe and replayable.

## Prerequisites
- `node` installed (same version used by the repo)
- Tier 1 tooling available at `tools/dev/js-scan.js` and `tools/dev/js-edit.js`
- Session folder + plan already created (see Session Bootstrap Workflow)

## Phase 1 — Discovery (Gap 2)
1. Identify the symbol or file you intend to touch.
2. Run semantic queries and store the command + output snippet inside your session `WORKING_NOTES.md`:
   ```bash
   node tools/dev/js-scan.js --what-imports src/path/to/module.js --json
   node tools/dev/js-scan.js --export-usage namedExport --json
   node tools/dev/js-scan.js --what-calls someFunction --json
   ```
3. Classify risk:
   - **LOW** (<5 usages)
   - **MED** (5–20)
   - **HIGH** (>20) → expect broader validation/tests
4. Write down affected files + planned edits/tests before touching code.

## Phase 2 — Plan
- Represent each change as a structured tuple `{ file, startLine, endLine, replacement }`.
- Save the batch in `changes.json` (kept in your session folder or a tmp subfolder).
- Note any required docs/test updates so you can execute them immediately after edits.

## Phase 3 — Apply Safely (Gap 3)
1. **Dry-run** the batch:
   ```bash
   node tools/dev/js-edit.js --file <path> --dry-run --changes changes.json --json
   ```
   - If offsets drift, regenerate via `--recalculate-offsets` or split the batch.
2. **Apply + emit plan** once the dry-run is clean:
   ```bash
   node tools/dev/js-edit.js --file <path> --changes changes.json --fix --emit-plan --json
   ```
3. Capture command output (or summary) in the session notes. Keep emitted plans when work spans multiple steps or hand-offs.

## Phase 4 — Verify & Document
1. Run targeted tests or checks:
   ```bash
   npm run test:by-path tests/<suite>.test.js
   ```
   Prefer repo scripts when available (they encode config and safety defaults). If you must run `npx jest ...` for a specific suite, still follow the Testing Quick Reference and always confirm exit code.
2. Re-run `js-scan --search` to confirm the symbol now appears where expected.
3. Update docs/JSDoc + `SESSION_SUMMARY.md` before declaring victory.

## Bilingual & Compact I/O Tips
- Default flags: `--json --ai-mode` to keep outputs machine-friendly.
- Mix Chinese aliases if collaborating bilingually (`--搜`, `--限`, etc.); use `--lang en|zh|bilingual|auto` to lock formatting.
- Log continuation tokens so others can resume long scans without rerunning heavy operations.

## Failure & Recovery Playbook
- If `js-edit` dry-run fails, fix the batch or re-run discovery—do **not** manually edit files.
- For cascading refactors, chain emitted plans with `--from-plan saved-plan.json --fix --json` to enforce guard verification.
- When tooling gaps surface, note them in your session and either extend the CLI immediately (with tests) or file a follow-up.

## Checklist
- [ ] Discovery commands logged with risk level
- [ ] Batch changes encoded and dry-run recorded
- [ ] `--fix --emit-plan` output captured (or reason logged if not applicable)
- [ ] Tests/checks run via repo scripts
- [ ] Docs/session notes updated before hand-off

## Related quick references
- [docs/TESTING_QUICK_REFERENCE.md](../TESTING_QUICK_REFERENCE.md)
- [docs/workflows/WORKFLOW_REGISTRY.md](WORKFLOW_REGISTRY.md)

