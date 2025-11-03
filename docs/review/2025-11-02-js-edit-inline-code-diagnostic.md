# js-edit Inline Code Diagnostic — 2025-11-02

## Overview
- **Scope**: Review the recent `--with-code` support that landed in `tools/dev/js-edit.js` and the companion tests in `tests/tools/__tests__/js-edit.test.js`.
- **Trigger**: `npx jest tests/tools/__tests__/js-edit.test.js --forceExit --reporters=default --testNamePattern="with-code"` currently reports seven failures.
- **Goal**: Identify what broke, why the new guardrails reject the inline snippets, and document fixes needed for the suite/use-cases.

## Key Changes in js-edit
- `getReplacementSource` now routes inline arguments through `unescapeCodeString` and `validateCodeSyntax` (module → statement → expression fallback) before any write occurs.
- Variable replacements still operate on **declarator spans by default** (the portion after the declaration keyword). `prepareNormalizedSnippet` normalizes newline style and appends a trailing newline so hashes/guardrails stay stable.

## Test Failures and Root Causes
| Test name | Observed error | Cause | Fix recommendation |
| --- | --- | --- | --- |
| `--with-code handles escaped double quotes`<br>`--with-code handles escaped backslashes (Windows paths)`<br>`--with-code ensures trailing newline`<br>`--with-code supports multi-statement code`<br>`--with-code shows diff without --fix (dry-run)` | `Replacement produced invalid JavaScript: const const msg = …` | The tests feed full `const …` statements into a declarator span; js-edit splices only the *right-hand side* of `const sequence = …`, so the generated code becomes `const const …`, tripping the syntax guard.| Update the snippets to match the declarator (`sequence = …`) or switch the tests to `--variable-target declaration` when the entire statement is desired.|
| `--with-code works with --replace (functions)` | `TypeError: Cannot read properties of undefined (reading '0')` | The `--locate` JSON payload exposes `matches`, not `functions`. The test is dereferencing a non-existent property before issuing the replacement. | Change the test to read `locatePayload.matches[0].hash` (or reuse shared helper) before calling `--replace`.|
| `--with-code requires --replace or --replace-variable` | CLI now stops earlier with the generic “Provide one of …” error list. | `normalizeOptions` validates that exactly one primary operation flag is present before it checks `--with-code`, so the test’s expected message is outdated. | Update the assertion to match the new validation flow or restructure the test to hit the specific `--with-code` guard via a stub operation flag.|

## Reproduction Notes
- Variable failure reproduced with a temp copy of `tests/fixtures/tools/js-edit-sample.js`:
  ```powershell
  node tools/dev/js-edit.js --file C:\Users\james\AppData\Local\Temp\js-edit-review-double\sample.js --replace-variable sequence --with-code 'const msg = "hello world";' --expect-hash r/ofxVZO --json --fix
  ```
  Output excerpt (syntax guardrail):
  ```
  [✖ ERROR] Replacement produced invalid JavaScript:   × Expected ident
    ╭─[35:1]
  35 │       const const msg = hello
             ─────
  ```
- Function replacement succeeds when the inline snippet matches the full declaration:
  ```powershell
  node tools/dev/js-edit.js --file C:\Users\james\AppData\Local\Temp\js-edit-review-double\sample.js --replace exports.alpha --with-code 'function alpha() { return "updated"; }' --expect-hash gqs8no7s --json --fix
  ```

## Recommendations
1. **Adjust the tests** so declarator replacements supply RHS-only snippets or opt into `--variable-target declaration` before asserting success.
2. **Fix the locator helper** inside the function replacement test to use `matches[0]`.
3. **Refresh the error-message assertion** for the `--with-code` misuse case to align with the stricter operation validation.
4. Once the tests match the new guardrails, rerun `npx jest tests/tools/__tests__/js-edit.test.js --forceExit --reporters=default --testNamePattern="with-code"` to confirm the workflow.

## Follow-Up
- No code changes were applied during this review. The diagnostic is documentation-only.
- Capture any future guardrail tweaks in this review file (or subsequent addenda) so inline replacement expectations stay transparent for operators.
