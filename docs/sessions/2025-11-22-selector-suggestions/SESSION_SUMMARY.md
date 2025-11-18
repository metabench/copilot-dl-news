# Session Summary: Selector Suggestions

## Overview
Implemented `--suggest-selectors` flag for `js-edit` to provide structured disambiguation options when a selector matches multiple targets.

## Changes
- **`tools/dev/js-edit/shared/selector.js`**:
    - Added `MultipleMatchesError` class.
    - Added `generateSelectorSuggestions` function.
    - Updated `ensureSingleMatch` to throw `MultipleMatchesError` with match details.
- **`tools/dev/js-edit.js`**:
    - Added `--suggest-selectors` CLI flag.
    - Updated `main()` to catch `MultipleMatchesError` and output suggestions if the flag is present.

## Verification
- Created reproduction file `tmp/ambiguous_nested.js`.
- Verified JSON output:
  ```json
  {
    "status": "multiple_matches",
    "suggestions": [
      { "name": "outer > inner", "selectors": ["path:...", "hash:..."] },
      ...
    ]
  }
  ```
- Verified human-readable output.

## Usage
```bash
node tools/dev/js-edit.js --file <file> --locate <ambiguous-name> --suggest-selectors --json
```

## Next Steps
- Consider adding this flag to `AGENTS.md` or `AGENT_REFACTORING_PLAYBOOK.md` as a recommended pattern for agents when encountering ambiguity.
