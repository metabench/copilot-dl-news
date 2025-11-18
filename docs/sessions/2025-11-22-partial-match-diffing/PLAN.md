# Plan: Partial Match & Diffing

**Objective**: Enable `js-edit` to match code blocks with minor whitespace/formatting differences (fuzzy matching) and provide diff-based previews to increase robustness against auto-formatting.

**Done when**:
- [ ] `js-edit` accepts a `--fuzzy` flag (or defaults to fuzzy for large blocks).
- [ ] Matching logic normalizes whitespace (ignores indentation/newlines differences) when fuzzy mode is active.
- [ ] `js-edit` accepts a `--diff` flag to show a unified diff of changes instead of just "Applied".
- [ ] `MultipleMatchesError` includes a diff hint if matches are close but not exact (optional).
- [ ] Tests verify fuzzy matching succeeds where exact matching fails.

**Change set**:
- `tools/dev/js-edit.js`: Add flags.
- `tools/dev/js-edit/shared/selector.js`: Update `locateNode` or `matchCode` logic to support normalization.
- `tools/dev/js-edit/shared/text-utils.js`: Add normalization helpers.
- `tests/tools/js-edit-fuzzy.test.js`: New test suite.

**Risks/assumptions**:
- Fuzzy matching might match unintended targets if too loose. Need strict normalization rules (e.g., collapse whitespace to single space, ignore leading/trailing).
- Performance impact of normalizing large files.

**Tests**:
- Unit tests for normalization logic.
- Integration tests for `js-edit --fuzzy`.

**Docs to update**:
- `AGENTS.md` (Tooling section)
- `docs/AGENT_REFACTORING_PLAYBOOK.md`
