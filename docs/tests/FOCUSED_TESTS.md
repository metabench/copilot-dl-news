# Focused Test Runs — Canonical Commands

**When to Read**: When you need to run specific tests without running the entire suite.

## ✅ SAFE Commands (Use These)

### Exact Files (Safest)
```bash
npx jest --runTestsByPath path/a.test.ts path/b.spec.ts
```

### Related to Changed Files
```bash
npx jest --findRelatedTests src/foo.ts src/bar.ts
```

### By Test Name (Loads Matched Files First)
```bash
npx jest -t "exact test name" --runTestsByPath path/a.test.ts
```

### List Only (No Execution)
```bash
npx jest --listTests [plus any filters]
```

### Resolve Config
```bash
npx jest --showConfig > resolved_config.json
```

### Multi-Project Focus
```bash
npx jest --selectProjects web --runTestsByPath web/src/foo.test.ts
```

## ❌ UNSAFE Commands (Avoid These)

### Anti-Examples
- `npx jest src/foo` *(interpreted as regex; may match more than intended)*
- `npm test` *(unfiltered; runs everything)*
- `npx jest -t Login` *(name filter can still load many suites; combine with by-path when possible)*

## Quick Table: Intent → Command

| Intent | Command |
|--------|---------|
| Run a single file | `--runTestsByPath` |
| Run related tests | `--findRelatedTests` |
| Run by name | `-t` + by-path |
| List only | `--listTests` |

## Monorepo Notes

Use `--selectProjects` and per-project configs. Windows: use `/` or escape `\\` in regex paths.

## "List First" Pattern

**Always check what would run before executing:**

```bash
# List what would run
npx jest --runTestsByPath path/a.test.ts --listTests

# Then run if correct
npx jest --runTestsByPath path/a.test.ts
```