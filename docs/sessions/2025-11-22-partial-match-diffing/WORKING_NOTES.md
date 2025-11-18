# Working Notes: Partial Match & Diffing

## Context
We are implementing Tier 2 of the tooling roadmap. `js-edit` currently requires exact string matches for replacements (unless using AST selectors, but even then, the `old` code in a replacement often needs to match exactly if we are doing text-based replacement within a range).

## Objectives
1.  **Fuzzy Matching**: Ignore whitespace differences.
2.  **Diff Output**: Show what actually changed.

## Design Thoughts
-   **Normalization**:
    -   Strip all whitespace? No, `function foo()` != `functionfoo()`.
    -   Collapse whitespace? `function  foo(  )` -> `function foo()`.
    -   Ignore indentation? Yes.
-   **Implementation**:
    -   When `locate` is called with a code snippet (not just a name), we currently might be doing exact search.
    -   If we are using `js-edit`'s `--replace <selector> --with <code` pattern, the selector locates the node.
    -   If we are using `--search-text`, that's pure text search.
    -   The "Partial Match" requirement usually applies to the *verification* step of a replacement. i.e. "Replace this block of code". If the user provides the "old" code, we want to find it even if indentation changed.
    -   Wait, `js-edit` primarily works by AST selector (`--replace functionName`).
    -   However, `js-edit` also supports `--search-text`.
    -   And crucially, for **batch edits** (`changes.json`), we often provide `startLine`/`endLine` OR we might provide `originalText` to verify.
    -   Let's look at how `js-edit` currently works.

## Investigation
-   Check `tools/dev/js-edit.js` to see how it locates targets.
-   Check `tools/dev/js-edit/shared/selector.js`.

## Commands
```bash
node tools/dev/js-edit.js --help
```

## Progress
- [x] Analyze `js-edit` architecture
- [x] Add `--fuzzy` flag to CLI
- [x] Implement `normalizeText` utility
- [x] Implement fuzzy search in `discovery.js`
- [x] Implement fuzzy verification in `BatchDryRunner.js`
- [x] Verify with test case

## Implementation Details
- `tools/dev/js-edit/shared/text-utils.js`: Contains `normalizeText(text)` which replaces `/\s+/g` with `' '` and trims.
- `BatchDryRunner`:
  - Constructor accepts `fuzzy` option.
  - `addChange` preserves `original` field.
  - `_verifyChangeGuards` uses `normalizeText` to compare `content` and `original` if strict hash check fails and `fuzzy` is true.
- `discovery.js`:
  - `searchTextMatches` uses regex `/\s+/` to match whitespace when `fuzzy` is true.

## Verification
Ran `tests/tools/js-edit-fuzzy.test.js` which confirmed:
1. Strict hash check fails when whitespace differs.
2. Fuzzy check passes when whitespace differs but normalized content matches.
