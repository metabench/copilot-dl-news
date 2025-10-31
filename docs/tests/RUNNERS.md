# Jest Test Runners — Scripts & Projects

**When to Read**: When choosing which test runner or script to use for different scenarios.

## Available Test Runners

### Configuration Runner (`tests/run-tests.js`)
**Purpose**: Run predefined test suites with specific configurations.

```bash
node tests/run-tests.js <suite-name>
node tests/run-tests.js unit
node tests/run-tests.js e2e
node tests/run-tests.js unit --files="file1.test.js,file2.test.js"
```

**Suites Available**:
- `unit` - Fast unit tests only (no network, no E2E)
- `integration` - HTTP server integration tests
- `e2e` - Standard E2E tests
- `e2e-quick` - Quick E2E smoke tests
- `all` - All regular tests
- `dev-geography` - Development geography tests
- `dev-geography-monitor` - Geography tests with monitoring

### Careful Runner (`scripts/jest_careful_runner.mjs`)
**Purpose**: Safe Jest wrapper that prevents accidental full suite runs.

```bash
# List tests only (default when no args)
node scripts/jest_careful_runner.mjs --list-only

# Run specific test files
node scripts/jest_careful_runner.mjs path/to/test.test.js

# Run multiple files
node scripts/jest_careful_runner.mjs file1.test.js file2.test.js
```

**Safety Features**:
- Defaults to `--listTests` when no arguments
- Uses `--runTestsByPath` for exact file matching
- Conservative flags: `--bail=1 --maxWorkers=50%`

### Direct Jest Commands
**Purpose**: Advanced Jest features for specific use cases.

```bash
# Find related tests
npx jest --findRelatedTests src/changed-file.ts

# Run by test name
npx jest -t "exact test name"

# Multi-project selection
npx jest --selectProjects <project-name>
```

## NPM Scripts

### Safe Focused Scripts
```bash
npm run test:list          # List all tests
npm run test:by-path       # Run specific files
npm run test:related       # Find related tests
npm run test:name          # Run by name
npm run test:proj          # Multi-project
```

### Suite Scripts
```bash
npm run test:unit          # Unit tests
npm run test:integration   # Integration tests
npm run test:e2e           # E2E tests
npm run test:e2e-quick     # Quick E2E
npm run test:all           # All tests
```

### Legacy Scripts (Use Carefully)
```bash
npm run test               # Full suite (DANGER)
npm run test:file          # Pattern matching (regex)
npm run test:legacy:fast   # Fast subset
npm run test:legacy:all    # All with detect handles
```

## Project Configurations

### Main Config (`package.json` jest field)
- **Roots**: Entire repo
- **Test Match**: `**/__tests__/**/*.test.js`, `**/?(*.)+(spec|test).js`
- **Ignores**: `node_modules`, helpers, broken, deprecated-ui

### Orchestration Config (`src/orchestration/jest.config.js`)
- **Roots**: `src/orchestration/`
- **Test Match**: `**/src/orchestration/**/*.test.js`
- **Purpose**: Isolated orchestration layer tests

## Choosing the Right Runner

| Scenario | Use This |
|----------|----------|
| Run entire suite | `npm run test:suite all` |
| Run unit tests | `npm run test:unit` |
| Run specific file | `npm run test:by-path file.test.js` |
| Debug test selection | `npm run test:list` |
| CI full run | `npm run test:suite all` |
| Development focus | `node scripts/jest_careful_runner.mjs` |
| Multi-project | `npm run test:proj` |

## Safety First

**Always list before running:**
```bash
# Check what would run
npm run test:list

# Then run if correct
npm run test:by-path specific.test.js
```

**Avoid these footguns:**
- `npm test` (runs everything)
- `npx jest` (no filters)
- Pattern matching without `--runTestsByPath`