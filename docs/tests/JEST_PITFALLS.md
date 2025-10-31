# Jest Test Runner Pitfalls & Remedies

**When to Read**: When Jest commands run more tests than intended, or when test selection behaves unexpectedly.

## Common Jest Pitfalls & Remedies

### 1. Regex vs Path Confusion

**Symptom**: `jest src/foo` runs "too many" tests.

**Reason**: Positional arg is a **regex** (testPathPattern), not a strict path.

**Fix**: Use `--runTestsByPath path/to/foo.test.ts`.

### 2. `testMatch` vs `testRegex`

**Symptom**: Unexpected files included/excluded.

**Reason**: Both options exist or regex catches a folder name.

**Fix**: Use **one** of them only. Prefer `testMatch` (glob) for clarity; if using `testRegex`, ensure it doesn't accidentally match directories.

### 3. Monorepo Runs Entire Suite

**Symptom**: Running from repo root runs all packages.

**Reason**: Multi-project config without `--selectProjects`.

**Fix**: Use `--selectProjects <name>` or per-package scripts. Keep per-project `roots` accurate.

### 4. Windows Path Escaping

**Symptom**: `--testPathPatterns` behaves oddly.

**Reason**: Backslashes in regex.

**Fix**: Use `/` as separator or escape as `\\`.

### 5. Name Filter Surprises

**Symptom**: `-t` appears to "run all".

**Reason**: Jest must *load* candidate suites to find matching names; non-matching tests are skipped after load.

**Fix**: Combine `-t` with `--runTestsByPath` to limit loaded suites.

### 6. Package Manager Flag Swallowing

**Symptom**: `npm test -t name` ignored.

**Reason**: Missing `--` to forward args.

**Fix**: `npm test -- -t name` or prefer `npx jest ...`.

### 7. Transforms Trigger Broad Discovery

**Symptom**: TS/Babel transforms slow or broaden discovery.

**Fix**: Keep `roots` narrow; cache transforms; avoid transforming `node_modules`; ensure `transformIgnorePatterns` sane.

### 8. VS Code "Run Test" vs "Debug Test" Mismatch

**Symptom**: UI runs a different set than CLI.

**Reason**: Extensions may use `--testPathPattern` for Run and `--runTestsByPath` for Debug.

**Fix**: Align UI settings with CLI guidance; document preferred commands.

### 9. `--onlyChanged` Expectations

**Symptom**: Fewer/more tests than expected.

**Reason**: Depends on VCS state; untracked files not considered.

**Fix**: Prefer `--findRelatedTests` for determinism in CI/docs.

### 10. Snapshots Updated Broadly

**Symptom**: `-u` updates many.

**Fix**: Combine `-u` with exact file selection or `-t`.