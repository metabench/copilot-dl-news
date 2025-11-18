# Working Notes: Selector Suggestions

## Discovery
- `js-edit.js` uses `resolveMatches` from `shared/selector.js`.
- `ensureSingleMatch` throws the error currently.
- Need to intercept this.

## Design
- Add `--suggest-selectors` to `normalizeOptions`.
- In `selector.js`, `ensureSingleMatch` could take the `suggestSelectors` option.
- If true and multiple matches, instead of throwing, it returns a special result or throws a specific error type that carries the matches.
- Or, `resolveMatches` catches the error? No, `ensureSingleMatch` has the matches.
- Better: `ensureSingleMatch` returns the matches array if `suggestSelectors` is true, and lets the caller handle it?
- But `resolveMatches` expects a single record usually (or array if allowMultiple).
- If `suggestSelectors` is on, we probably want to exit early with the suggestion output, rather than proceeding with an operation that might fail on an array.

## Implementation Plan
1. Modify `normalizeOptions` in `js-edit.js` to parse `--suggest-selectors`.
2. Modify `ensureSingleMatch` in `selector.js`:
   - If `options.suggestSelectors` is true and matches > 1:
     - Return the matches array (do not throw).
     - Or throw a `AmbiguousMatchError` with the matches attached.
3. Update `js-edit.js` main loop:
   - When calling operations that use `resolveMatches` (like `locate`, `extract`, `replace`), handle the "ambiguous match" result.
   - Actually, `resolveMatches` is used inside operations.
   - Maybe we should just implement this for `--locate` first, as that's the primary discovery tool.
   - But the proposal says `js-edit --file ... --locate ... --suggest-selectors`.

## Refined Design
- `resolveMatches` is the bottleneck.
- If `options.suggestSelectors` is true, `resolveMatches` should return the array of matches even if > 1.
- The *caller* (the operation) needs to check if it got multiple matches when it didn't expect them.
- Most operations expect a single record.
- If `resolveMatches` returns multiple, the operation might try to process them all or fail.
- We should probably handle this centrally.

Alternative:
- `ensureSingleMatch` throws a custom `MultipleMatchesError` that contains the matches.
- `js-edit.js` catches this error.
- If `--suggest-selectors` is ON, it catches the error, generates suggestions, and prints JSON.
- If OFF, it prints the standard error message (maybe with a hint).

This seems least invasive to the operations logic.

## Selector Generation
We need a function `generateSelectorSuggestions(matches)` in `selector.js`.
It should iterate matches and produce:
- `name:/...`
- `path:/...`
- `hash:...`
- `index:...`

## Tasks
1. Create reproduction/test file.
2. Update `selector.js` with `MultipleMatchesError` class and `generateSelectorSuggestions`.
3. Update `ensureSingleMatch` to throw `MultipleMatchesError`.
4. Update `js-edit.js` to catch this error and handle `--suggest-selectors`.
