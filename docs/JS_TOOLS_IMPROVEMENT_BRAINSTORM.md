# js-edit & js-scan Improvement Brainstorm

**Date:** November 11, 2025  
**Focus:** Multi-file workflows and reducing command count  

This document captures improvement ideas for `js-edit` and `js-scan` that enable more complex work in fewer invocations, especially for refactoring scenarios involving multiple files.

---

## Part 1: Multi-File Operations (js-edit Extensions)

### 1.1 Multi-File Extract & Move (`--move-to <targetFile>`)

**Problem:** Moving a function from one file to another currently requires:
1. `js-edit --file source.js --extract function` (to get the code)
2. Manual editing to add imports/adjust code
3. `js-edit --file target.js --replace ...` (to insert at target)
4. `js-edit --file source.js --replace ...` (to remove from source)

**Proposal:** A single `--move` workflow that:
- Locates a function in source file
- Extracts it with dependency analysis
- Identifies required imports from source file (via import tracing)
- Inserts it into target file at specified location (e.g., `--insert-before "function foo"`)
- Adds necessary imports to target file if missing
- Removes the function from source file
- Optionally updates call sites in source to import the moved function
- Outputs a manifest of changes across both files

**Command Examples:**
```bash
# Move function from source to target, auto-add imports
node tools/dev/js-edit.js --move-function "processData" \
  --from src/utils/helpers.js \
  --to src/utils/data.js \
  --insert-before "export function validate" \
  --trace-deps --fix --emit-diff --emit-plan tmp/move-plan.json

# Dry-run with manifest of all changes
node tools/dev/js-edit.js --move-function "formatOutput" \
  --from src/formatter.js --to src/output/formatter.js \
  --trace-deps --json
```

**Benefits:**
- Single command replaces 3-4 manual steps
- Dependency analysis prevents broken imports
- Plan manifest allows multi-file atomic workflows
- Reduces error-prone manual editing

**Implementation Notes:**
- Reuse `--trace-deps` from js-scan (or add dependency tracer to mutation.js)
- Generate import statements using AST manipulation
- Handle both ESM and CommonJS patterns
- Validate that target file exists or offer to create it
- Guard against circular dependencies

---

### 1.2 Multi-File Search & Replace (`--replace-across-files`)

**Problem:** Renaming a commonly-used utility function requires:
1. `js-scan --search functionName` (find all uses)
2. Individual `js-edit --replace` calls for each file
3. Manual verification that all call sites updated

**Proposal:** A batch replace workflow that:
- Takes a source selector (function name + optional hash for disambiguation)
- Uses js-scan to find all call sites and uses across the codebase
- Validates each usage site with guardrails (hash checks)
- Applies replacements in parallel (or sequentially if dependencies detected)
- Returns a manifest with success/failure per file
- Supports conditional transformations (e.g., rename + adjust arguments)

**Command Examples:**
```bash
# Rename function and update all call sites
node tools/dev/js-edit.js --rename-global "oldName" --to "newName" \
  --search-scope src/ --exclude-patterns "*.test.js" \
  --verify-hash <hash> --fix --emit-summary

# Replace a function signature with argument mapping
node tools/dev/js-edit.js --replace-signature "processData" \
  --from "function processData(items, options)" \
  --to "function processData(items, options = {})" \
  --update-calls --scope src/ --fix

# Find and replace all references to a moved export
node tools/dev/js-edit.js --replace-import "formatData" \
  --from "src/utils/format.js" \
  --to "src/output/formatData.js" \
  --scope src/ --fix --emit-diff
```

**Benefits:**
- One command replaces dozens of individual edits
- Guardrail validation across all files simultaneously
- Parallel execution potential for large codebases
- Detailed manifest allows review before applying

**Implementation Notes:**
- Integrate with js-scan's dependency graph for impact analysis
- Use hash/path guards from each call site for safety
- Support batch fix mode with --verify-all before writing any files
- Store per-file results in manifest for audit trail

---

### 1.3 Multi-File Import Consolidation (`--consolidate-imports`)

**Problem:** A utility might be imported from multiple module paths (due to refactors or convenience), creating inconsistency:
```javascript
// file1.js: import { format } from '../utils/format';
// file2.js: import { format } from '../../utils/format';
// file3.js: import format from '../utils/format.js';
```

**Proposal:** A batch import normalizer that:
- Scans for duplicate/inconsistent imports of the same export
- Detects all variations (relative vs. absolute, with/without .js, etc.)
- Picks a canonical path (or lets operator specify)
- Updates all files to use the canonical import
- Removes unused imports after consolidation
- Reports before/after import counts

**Command Examples:**
```bash
# Normalize all imports of a specific module
node tools/dev/js-edit.js --consolidate-imports "lodash-es" \
  --canonical-path "lodash-es" \
  --scope src/ --fix --emit-diff

# Consolidate local util imports with relative path normalization
node tools/dev/js-edit.js --consolidate-imports "validateUser" \
  --from-exports "src/validators/user.js" \
  --canonical-path "../validators/user.js" \
  --scope src/ --fix --emit-summary

# Find and fix inconsistent relative import paths
node tools/dev/js-edit.js --normalize-import-paths \
  --scope src/ --prefer-absolute --fix
```

**Benefits:**
- Reduces boilerplate and import sprawl
- Single sweep instead of per-file manual edits
- Helps enforce consistent path conventions
- Works well with large module reorganizations

**Implementation Notes:**
- Build on js-scan's import analysis
- Support AST-based import statement rewriting
- Handle both named and default imports
- Respect existing import grouping (e.g., keep grouped imports together)

---

### 1.4 Extract to New Module (`--extract-to-module`)

**Problem:** Extracting a set of related functions into a new module requires:
1. Creating the target file manually
2. Copying code from source
3. Adding exports to target
4. Adding imports to source
5. Updating imports in all call sites

**Proposal:** A workflow that:
- Accepts multiple function selectors from a source file
- Creates a new module with those functions
- Extracts their shared dependencies (helper functions, types)
- Generates appropriate exports in target module
- Adds imports to source file (if needed for remaining code)
- Updates call sites in other files if moving exported functions
- Validates no circular dependencies are created

**Command Examples:**
```bash
# Extract multiple functions to new module
node tools/dev/js-edit.js --extract-to-module "src/utils/analytics.js" \
  --functions "trackEvent,trackPageView,trackError" \
  --from src/tracker.js \
  --include-deps --fix --emit-plan tmp/extract.json

# Extract functions and auto-update all importing files
node tools/dev/js-edit.js --extract-to-module "src/validators/form.js" \
  --functions "validateEmail,validatePassword,validateUsername" \
  --from src/forms/index.js \
  --update-all-imports --create-barrel-export --fix

# Dry-run showing all files that would change
node tools/dev/js-edit.js --extract-to-module "src/api/handlers.js" \
  --functions "handleGet,handlePost,handleDelete" \
  --from src/api/index.js \
  --trace-deps --json
```

**Benefits:**
- Reduces module refactoring from 5+ steps to 1 command
- Automatically handles dependency extraction
- Updates all call sites in one go
- Plan output allows review before applying

**Implementation Notes:**
- Use AST to identify shared dependencies between extracted functions
- Generate appropriate export statements (named vs. default)
- Track all files that import from source and update them
- Check for circular dependencies before writing
- Option to create barrel export in source file if desired

---

## Part 2: Smart Search & Discovery (js-scan Extensions)

### 2.1 Ripple Analysis (`--ripple-analysis`)

**Problem:** When deciding if a function is safe to modify/remove, operators must manually trace:
- Where it's imported
- Where each import is used
- Whether changes to signature would break callers
- Presence of tests covering the function

**Proposal:** A single command that:
- Takes a function selector and starting file
- Maps the full import graph (who imports, who calls, distance from root)
- Identifies test files that exercise the function
- Flags exported vs. internal uses
- Reports risk level (safe to modify? can signature change?)
- Suggests impact zones for testing

**Command Examples:**
```bash
# Full ripple analysis with risk assessment
node tools/dev/js-scan.js --ripple-analysis "processData" \
  --file src/utils/data.js --scope src/ --json

# Find all call sites and potential issues
node tools/dev/js-scan.js --ripple-analysis "validateEmail" \
  --file src/validators.js --highlight-exports --find-tests

# Check if function can be safely deleted
node tools/dev/js-scan.js --ripple-analysis "legacyFormatter" \
  --file src/old/formatter.js --unused-only --show-last-use
```

**Benefits:**
- One command replaces complex manual tracing
- Quantifies refactoring risk automatically
- Identifies test coverage gaps
- Supports safe refactoring decisions

**Implementation Notes:**
- Extend js-scan's dependency graph to track usage depth
- Add test discovery (find `*.test.js` files + test imports)
- Score risk based on: export status, distance from leaves, test coverage
- Output visual tree of usage paths if JSON requested

---

### 2.2 Cross-Module Search with Context (`--cross-module-search`)

**Problem:** Finding a pattern (e.g., all error handlers, all async functions, all database queries) across multiple files currently requires:
1. `js-scan --search "async"` (keyword search, lots of false positives)
2. Manual review to filter relevant results
3. No correlation across files

**Proposal:** Pattern-aware search that:
- Accepts AST patterns (e.g., "functions that call `error.log`")
- Searches across multiple files with dependency context
- Groups results by pattern category
- Shows usage relationships between files
- Offers quick-jump suggestions for related code

**Command Examples:**
```bash
# Find all error handlers across codebase
node tools/dev/js-scan.js --pattern "error.*handler" \
  --cross-module --group-by "pattern,location" \
  --scope src/ --suggest-related

# Find all async functions that call database methods
node tools/dev/js-scan.js --pattern "async.*db\\.query" \
  --cross-module --include-context --call-depth 2 \
  --scope src/api --json

# Find all functions that update state
node tools/dev/js-scan.js --pattern "setState|updateState|.*State =" \
  --cross-module --exports-only --scope src/ --lang zh --视 简
```

**Benefits:**
- Semantic pattern search (not just text/keyword)
- Groups related code automatically
- Cross-file correlation reveals patterns
- Supports large-scale refactoring planning

**Implementation Notes:**
- Use SWC AST patterns to match beyond simple keyword search
- Build a simple pattern DSL (e.g., `function.*async+error`)
- Correlate matches across dependency graph
- Cache pattern results for repeated queries

---

### 2.3 Dependency Graph Visualization (`--visualize-deps`)

**Problem:** Understanding complex module relationships requires:
1. Manual import tracing in each file
2. Mental model building
3. Detecting circular dependencies requires deep analysis

**Proposal:** A command that:
- Generates a structured dependency graph
- Detects circular dependencies with clear paths
- Identifies "hub" modules (heavily depended on)
- Reports modularity metrics
- Outputs as JSON, DOT graph, or ASCII tree
- Supports filtering by path/pattern

**Command Examples:**
```bash
# ASCII tree view of dependencies
node tools/dev/js-scan.js --visualize-deps --format tree \
  --root src/api/server.js --depth 4 --scope src/

# Find circular dependencies
node tools/dev/js-scan.js --visualize-deps --format graph \
  --find-cycles --scope src/ --json

# Identify hub modules
node tools/dev/js-scan.js --visualize-deps --format stats \
  --show-hubs --hub-threshold 10 --scope src/

# Export as Graphviz DOT
node tools/dev/js-scan.js --visualize-deps --format dot \
  --scope src/api --output tmp/api-deps.dot
```

**Benefits:**
- Visual understanding of architecture
- Detects structural issues (circular deps, hubs)
- Supports architecture documentation
- Guides refactoring priorities

**Implementation Notes:**
- Use existing dependency graph from js-scan
- Generate multiple output formats
- Highlight problematic patterns (cycles, over-connected hubs)
- Consider mermaid or ascii-tree libraries for rendering

---

## Part 3: Workflow Acceleration (Combined js-edit + js-scan)

### 3.1 Refactor Recipe Mode (`--recipe`)

**Problem:** Common refactoring patterns (rename + move, extract + consolidate imports, etc.) require chaining multiple commands and remembering the right sequence.

**Proposal:** Predefined "recipes" that chain js-edit and js-scan operations:
- Recipe file (YAML or JSON) describing a sequence of operations
- Each step can use output from previous steps (e.g., hash from locate feeds into search)
- Dry-run mode walks through all steps, showing cumulative changes
- Manifest captures all files touched and changes made

**Command Examples:**
```bash
# Run a predefined refactor recipe
node tools/dev/js-edit.js --recipe recipes/rename-and-move.json \
  --param function=oldName --param target-file=src/new-location.js \
  --fix --emit-summary

# Create and verify a custom recipe
node tools/dev/js-edit.js --recipe tmp/my-refactor.json \
  --verify --dry-run --emit-diff

# Recipe file structure (tmp/my-refactor.json):
{
  "name": "Extract utilities and consolidate imports",
  "steps": [
    { "op": "js-scan", "search": "myUtil", "scope": "src/", "emit": "usage_sites" },
    { "op": "js-edit", "move-function": "myUtil", "from": "src/old.js", "to": "src/utils.js" },
    { "op": "js-edit", "consolidate-imports": "myUtil", "scope": "src/" },
    { "op": "js-scan", "find-pattern": "*unused*", "scope": "src/old.js" }
  ]
}
```

**Benefits:**
- Complex refactors become one-command invocations
- Reusable recipes for team consistency
- Dry-run + manifest enable safe batch changes
- Reduces cognitive load on operators

**Implementation Notes:**
- Design lightweight recipe YAML/JSON format
- Implement recipe runner that chains operations
- Support variable interpolation and step output references
- Include library of common recipes in docs

---

### 3.2 Batch File Surgery Mode (`--batch`)

**Problem:** Applying the same transformation to multiple files requires:
1. `js-scan` to find matching files
2. Individual `js-edit` commands per file
3. Manual aggregation of results

**Proposal:** Batch mode that:
- Takes a file pattern and a transformation
- Applies the same edit operation to each file
- Collects all changes into a manifest
- Supports conditional transformations (skip if pattern not found)
- Rollback capability if any file fails

**Command Examples:**
```bash
# Add import to all files matching pattern
node tools/dev/js-edit.js --batch --pattern "src/**/*.js" \
  --exclude "*.test.js" \
  --add-import "const { logger } = require('../utils/log');" \
  --insert-after "^use strict" \
  --fix --emit-summary

# Update all functions with specific signature
node tools/dev/js-edit.js --batch --pattern "src/**/*.handler.js" \
  --replace-signature "handler(req, res)" \
  --to "handler(req, res, next)" \
  --update-calls --fix

# Remove all console.logs from a directory
node tools/dev/js-edit.js --batch --pattern "src/**/*.js" \
  --exclude "*.test.js,*.mock.js" \
  --remove-calls "console.log,console.warn" \
  --fix --emit-diff
```

**Benefits:**
- Large-scale transformations in one command
- Consistent application across many files
- Manifest provides audit trail
- Atomic batch operations (all-or-nothing option)

**Implementation Notes:**
- Iterate over file pattern from js-scan
- Apply same transformation via js-edit to each
- Collect errors/successes in manifest
- Support rollback by storing diffs before writing
- Allow conditional operations (skip file if pattern not found)

---

### 3.3 Dependency Health Check (`--health-check`)

**Problem:** Operators lack visibility into import health:
- Unused imports (dead code)
- Broken relative paths (imports that will fail)
- Circular dependencies
- Missing peer dependencies
- Import redundancy

**Proposal:** A comprehensive scan that:
- Analyzes all imports in a scope
- Flags unused imports with confidence level
- Detects broken/missing modules
- Identifies circular dependencies
- Reports redundant imports
- Suggests fixes
- Outputs as actionable report

**Command Examples:**
```bash
# Full health check on a scope
node tools/dev/js-scan.js --health-check --scope src/ \
  --strict --show-unused --show-cycles --fix-suggestions

# Check specific files
node tools/dev/js-scan.js --health-check \
  --files "src/api.js,src/utils.js" \
  --report-format summary --json

# Auto-fix unused imports
node tools/dev/js-scan.js --health-check --scope src/ \
  --auto-remove-unused --dry-run --emit-diff
```

**Benefits:**
- Single command identifies multiple issues
- Proactive code quality improvement
- Reduces troubleshooting time
- Auto-fix capabilities for simple issues

**Implementation Notes:**
- Track import usage via AST analysis
- Validate relative paths resolve correctly
- Use dependency graph for cycle detection
- Suggest removals with confidence scores (certain vs. likely)
- Group fixes by category for batch application

---

## Part 4: CLI Ergonomics & Output

### 4.1 Interactive Mode (`--interactive`)

**Problem:** Complex workflows require multiple commands with parameter tweaking; non-interactive mode forces trial-and-error.

**Proposal:** Interactive REPL-style mode where:
- Operators navigate discovered code with menus
- Previous results feed into next commands
- Dry-run previews before applying changes
- Session history saved for replay
- Tab-completion for common operations

**Command Examples:**
```bash
node tools/dev/js-edit.js --interactive

# Then REPL-like interaction:
> search: processData
  ✓ Found 5 matches in 3 files
  1) src/utils/data.js: processData(items, options)
  2) src/api/handler.js: processData(payload)
  3) src/worker/task.js: processData(input)
  ... (show in interactive picker)

> select: 1
> context: --before 5 --after 10
> edit: --rename newName
> preview
  (show diff)
> apply --fix
> save-session tmp/refactor-session.json
```

**Benefits:**
- Reduces command repetition
- Immediate feedback loop
- Less context switching
- Session replay for documentation

**Implementation Notes:**
- Build on readline for REPL interface
- Store session state in memory
- Support command history and reverse search
- Integrate with js-scan for discovery

---

### 4.2 Output Format Templates (`--template`)

**Problem:** Different workflows need different output formats; operators can't easily customize without post-processing.

**Proposal:** Pluggable output templates that:
- Define custom column/field ordering
- Support different serializations (CSV, Markdown table, etc.)
- Include computed fields (risk score, impact radius, etc.)
- Allow filtering within template
- Enable custom formatting per field

**Command Examples:**
```bash
# Use predefined template
node tools/dev/js-scan.js --search "handler" --template impact-analysis \
  --scope src/

# Use custom template file
node tools/dev/js-scan.js --search "deprecated" --template tmp/my-template.json

# Template file (tmp/my-template.json):
{
  "format": "markdown-table",
  "columns": [
    { "field": "name", "header": "Function" },
    { "field": "file", "header": "Location", "abbreviate": 40 },
    { "field": "exported", "header": "Public?" },
    { "computed": "callerCount", "header": "# Callers" },
    { "computed": "testCoverage", "header": "Test %", "format": "percent" }
  ]
}

# Output as GitHub markdown for PR comments
node tools/dev/js-scan.js --search "*" --template github-markdown \
  --scope src/ > tmp/summary.md
```

**Benefits:**
- Operators get exactly the info they need
- Reduces post-processing scripts
- Enables documentation automation
- Template reuse across workflows

**Implementation Notes:**
- Design lightweight template schema
- Support both built-in and custom templates
- Include computed field definitions
- Integrate with CliFormatter for rendering

---

### 4.3 Diff/Manifest Aggregation (`--aggregate-diffs`)

**Problem:** Multi-file operations generate many individual diffs; operators can't easily see the big picture.

**Proposal:** Aggregation mode that:
- Collects all diffs from a batch operation
- Summarizes by change type (rename, add, remove, etc.)
- Highlights cross-file impact
- Shows before/after statistics
- Flags potential issues (breaking changes, etc.)

**Command Examples:**
```bash
# Generate aggregated summary of all changes
node tools/dev/js-edit.js --batch-recipe recipes/large-refactor.json \
  --aggregate-diffs --summary-format markdown \
  --output tmp/refactor-summary.md

# Interactive diff review
node tools/dev/js-edit.js --batch --pattern "src/**/*.js" \
  --apply-transform "rename oldFunc to newFunc" \
  --aggregate-diffs --interactive-review \
  --fix
```

**Benefits:**
- Easy review of large refactors
- Detects unexpected side effects across files
- Supports change documentation
- Better audit trails

**Implementation Notes:**
- Parse all generated diffs
- Categorize changes by type
- Build cross-file impact graph
- Generate multiple summary formats

---

## Part 5: Performance & Caching

### 5.1 AST Caching (`--use-cache`)

**Problem:** Repeated js-edit operations re-parse the same files; large files are slow.

**Proposal:** Optional AST caching layer:
- Caches parsed AST + hashes between operations
- Invalidates on file modification
- Significant speedup for repeated scans
- Manual cache clear option

**Command Examples:**
```bash
# Enable caching for this session
node tools/dev/js-edit.js --file src/large-file.js \
  --use-cache --list-functions

# Second operation on same file uses cache
node tools/dev/js-edit.js --file src/large-file.js \
  --use-cache --search-text "pattern"  # Much faster

# Clear cache
node tools/dev/js-edit.js --clear-cache
```

**Benefits:**
- 5-10x speedup on repeated operations
- Better experience for interactive workflows
- Transparent to user (no code changes needed)

**Implementation Notes:**
- Use file modification time to invalidate
- Store cache in `tmp/` directory
- Include options fingerprint in cache key
- Make cache size configurable

---

## Part 6: Integration & Composition

### 6.1 Pipe-Friendly Output (`--pipe-results`)

**Problem:** js-edit/js-scan results don't easily feed into other tools or scripts.

**Proposal:** Structured output mode optimized for scripting:
- JSONL (JSON Lines) output for streaming
- Hash/path format that's copy-paste friendly
- Support piping between tools (js-scan → js-edit)
- CLI composition helpers

**Command Examples:**
```bash
# Output hashes one per line, ready for scripting
node tools/dev/js-scan.js --search "processData" \
  --scope src/ --pipe-results --hashes-only | \
  xargs -I {} node tools/dev/js-edit.js --file {} \
    --replace-function "processData" --rename "newName"

# Pipe from js-scan to js-edit in shell
js-scan --pattern "*.handler" --pipe-results | \
  js-edit --batch-from-stdin --update-imports

# PowerShell equivalent
node tools/dev/js-scan.js --search "Service" --scope src/ \
  --pipe-results | ForEach-Object { 
    node tools/dev/js-edit.js --file $_ --list-functions 
  }
```

**Benefits:**
- Unix philosophy: compose tools
- Powerful shell scripting possibilities
- Reduces bespoke wrapper scripts
- Better automation support

**Implementation Notes:**
- Add `--pipe-results` mode that outputs minimal necessary data
- Design friendly line format (hash, path, name separated clearly)
- Support `--batch-from-stdin` in js-edit
- Document common shell patterns in README

---

### 6.2 Workflow Manifest Replay (`--replay`)

**Problem:** Complex multi-step refactors can't be easily documented or shared.

**Proposal:** Manifest-based replay system:
- Record all operations in a manifest file
- Replay entire workflow later with same or different code
- Useful for team documentation and automation
- Supports parameterized replays (variables)

**Command Examples:**
```bash
# Record a refactoring session
node tools/dev/js-edit.js --record-manifest tmp/refactor.manifest.json \
  --move-function "utils" --from src/old.js --to src/new.js

# Later: Replay the same operations
node tools/dev/js-edit.js --replay tmp/refactor.manifest.json \
  --scope different-branch/src/ --dry-run

# Replay with parameter overrides
node tools/dev/js-edit.js --replay recipes/extract-service.manifest.json \
  --param function-name="processOrder" \
  --param target-module="src/services/OrderService.js" \
  --fix

# Manifest file structure shows what happened:
{
  "name": "Extract analytics module",
  "steps": [
    { "op": "extract-to-module", "functions": ["track", "report"], "from": "src/tracker.js", "to": "src/analytics.js" },
    { "op": "consolidate-imports", "module": "src/analytics.js", "scope": "src/" },
    { "op": "remove-unused-imports", "file": "src/tracker.js" }
  ]
}
```

**Benefits:**
- Document refactoring procedures
- Enables team consistency
- Supports parameterized refactors
- Better for CI/CD integration

**Implementation Notes:**
- Design manifest schema that's both human and machine readable
- Support replay with fresh code
- Include parameter substitution
- Version manifests for compatibility

---

## Part 7: Safety & Verification

### 7.1 Pre-Apply Verification (`--pre-verify`)

**Problem:** Complex multi-file changes can introduce subtle bugs; operators can't easily verify correctness before applying.

**Proposal:** Pre-apply verification step that:
- Simulates changes in memory (no disk writes)
- Re-parses modified files to catch syntax errors
- Runs import validation (check all imports resolve)
- Optional linting on modified code
- Tests can be run against modified code
- Full rollback available

**Command Examples:**
```bash
# Batch operation with pre-verification
node tools/dev/js-edit.js --batch --pattern "src/**/*.js" \
  --apply-transform "rename old to new" \
  --pre-verify \
  --verify-imports --verify-syntax \
  --run-tests "npm run test -- src/" \
  --fix

# Verify without applying
node tools/dev/js-edit.js --move-function "utils" \
  --from src/a.js --to src/b.js \
  --pre-verify --import-check --syntax-check \
  --dry-run --emit-diff

# Verify with custom checks
node tools/dev/js-edit.js --batch --recipe refactor.json \
  --pre-verify \
  --verify-script "scripts/verify-refactor.js" \
  --fail-fast \
  --fix
```

**Benefits:**
- Catches errors before applying changes
- Reduced debugging time
- Higher confidence in batch operations
- Integration with test suites

**Implementation Notes:**
- Build virtual file system for simulation
- Reuse existing validation logic
- Support custom verification scripts
- Clear failure messages with fix suggestions

---

### 7.2 Rollback Tracking (`--enable-rollback`)

**Problem:** If batch changes introduce problems, rolling back is manual and error-prone.

**Proposal:** Automatic rollback capability:
- Stores original file contents before batch operation
- Provides simple command to revert
- Tracks which files were changed
- Supports partial rollback (revert subset of files)
- Preserves rollback history

**Command Examples:**
```bash
# Enable rollback tracking for batch operation
node tools/dev/js-edit.js --batch --pattern "src/**/*.js" \
  --enable-rollback \
  --apply-transform "..." \
  --fix

# Rollback all changes from last operation
node tools/dev/js-edit.js --rollback-last

# List recent operations with rollback capability
node tools/dev/js-edit.js --rollback-list

# Rollback specific operation by ID
node tools/dev/js-edit.js --rollback "20231111-145930-batch-rename"

# Partial rollback (only revert some files)
node tools/dev/js-edit.js --rollback-last --files "src/api.js,src/utils.js"
```

**Benefits:**
- Safety net for large operations
- Reduces fear of batch changes
- Quick recovery from mistakes
- Audit trail of what changed

**Implementation Notes:**
- Store rollback data in `.js-edit-rollback/` directory
- Use file hashing to detect external modifications
- Clean up old rollbacks periodically
- Provide rollback manifest for review

---

## Summary: Priority Tiers

### Tier 1 (High Impact, Moderate Effort)
- **1.1 Multi-File Extract & Move** — Common refactoring pattern, enables many workflows
- **2.1 Ripple Analysis** — Quantifies risk, enables safe refactoring
- **3.1 Refactor Recipe Mode** — Multiplies value of existing commands
- **5.1 AST Caching** — Easy win for performance

### Tier 2 (Good Value, Medium Effort)
- **1.2 Multi-File Search & Replace** — Extends existing rename capability
- **1.3 Import Consolidation** — Common housekeeping task
- **2.2 Cross-Module Pattern Search** — Enables architectural discovery
- **3.2 Batch File Surgery** — Scales existing operations
- **6.1 Pipe-Friendly Output** — Enables composition

### Tier 3 (Nice to Have, Higher Effort)
- **1.4 Extract to New Module** — Complex but powerful
- **2.3 Dependency Visualization** — Documentation value, architectural insights
- **3.3 Dependency Health Check** — Code quality tool
- **4.1 Interactive Mode** — UX improvement, exploration tool
- **6.2 Workflow Replay** — Documentation and CI integration

### Stretch Goals (Research/Polish Phase)
- **4.2 Output Format Templates** — Customization framework
- **4.3 Diff Aggregation** — Summary and impact analysis
- **7.1 Pre-Apply Verification** — Safety feature
- **7.2 Rollback Tracking** — Safety feature

---

## Recommended Implementation Sequence

1. **Start with Tier 1**: Each enables significant workflow improvement with reasonable effort
2. **Then Tier 2**: These expand reach without deep architectural changes
3. **Polish with Tier 3**: UI/UX improvements and specialized tools
4. **Stretch**: Only if time/resources available

The Tier 1 items would move from ~5-10 commands per refactoring task down to 1-2 commands, which is the core user value proposition.

---

## Open Questions for Discussion

1. **Batch Safety:** Should `--batch` operations have a dry-run-first enforced workflow to prevent mistakes?
2. **Recipe Language:** YAML, JSON, or custom DSL? What's the sweet spot for expressiveness vs. simplicity?
3. **Caching:** Should AST caching be opt-in (--use-cache) or opt-out (--no-cache)?
4. **Rollback History:** How long should rollback data be retained? Configurable threshold?
5. **Interactive Mode:** Worth the complexity, or should recipes handle most scenarios?
6. **Performance Targets:** What's acceptable wait time for batch operations on large codebases?

