# Plan: Selector Suggestions Implementation

Objective: Implement `--suggest-selectors` in `js-edit` to provide structured disambiguation options when a selector matches multiple targets.

Done when:
- `js-edit` accepts `--suggest-selectors` flag.
- When multiple matches occur with this flag, the tool outputs a JSON payload with `status: "multiple_matches"` and a list of `suggestions` (canonical selectors).
- Without the flag, the tool behaves as before (throws error), but potentially with a hint to use the new flag.
- Tests verify the suggestion output format.

Change set:
- `tools/dev/js-edit.js`: Add flag, handle multiple match scenario.
- `tools/dev/js-edit/shared/selector.js`: Add `generateSelectorSuggestions` helper.
- `tests/tools/js-edit-suggestions.test.js`: New test file.

Risks/assumptions:
- Existing error handling might mask the multiple match condition if not careful.
- Need to ensure `resolveMatches` or its callers can propagate the matches back up for suggestion generation.

Tests:
- Create a file with overloaded names (e.g. class method vs standalone function).
- Run `js-edit --locate` with ambiguous selector.
- Assert JSON output contains suggestions.

Docs to update:
- `AGENTS.md` (mention new flag)
- `tools/dev/README.md` (if exists)
