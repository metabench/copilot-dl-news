# js-scan Design Proposal

**Status**: Proposal  
**Created**: 2025-11-06  
**Owner**: GitHub Copilot  
**Related**: `md-scan`, `js-edit`, `tools/dev/lib/swcAst.js`

---

## Executive Summary

**js-scan** is a multi-file JavaScript discovery tool that helps AI agents and developers quickly locate relevant code across large JavaScript codebases without reading everything. It complements `js-edit` (single-file surgery) and `md-scan` (multi-file documentation discovery) by providing workspace-wide code reconnaissance with hash-compatible identification.

**Key Differentiators:**
- Multi-file scanning vs. js-edit's single-file focus
- Dense overview generation vs. detailed context extraction
- Hash-based cross-referencing with js-edit for guarded workflows
- Pattern-based discovery (e.g., "find all database adapters", "locate API endpoints")

---

## Problem Statement

### Current Pain Points

1. **No Multi-File Code Discovery**
   - Agents must run `js-edit --list-functions` separately on each file
   - No way to answer "where are all implementations of X pattern?"
   - Manual aggregation across 100+ JavaScript files is prohibitive

2. **Inefficient Reconnaissance Workflows**
   - Agents waste time reading entire files to find relevant functions
   - No visibility into module boundaries and dependencies
   - Cannot quickly map feature implementation across multiple files

3. **Hash Continuity Gap**
   - js-edit produces hashes for guarded edits
   - No tool to search by hash across workspace
   - Cannot track function relocations or find hash origins

4. **Pattern Discovery Limitations**
   - No way to find all functions matching naming patterns (e.g., `handle*`, `*Adapter`)
   - Cannot locate all exports, all classes, or all async functions
   - No visibility into CommonJS vs. ES modules distribution

### Use Cases

**Agent Reconnaissance (Primary)**
- *"Find all functions that interact with the database"*
- *"Locate API route handlers for planning endpoint refactor"*
- *"Map compression-related utilities before modularization"*
- *"Identify all classes for OOP architecture analysis"*

**Hash-Based Workflows**
- *"This hash appeared in a test failure—which file contains it?"*
- *"Locate the original function for this plan hash"*
- *"Find all functions with similar hashes (collision detection)"*

**Codebase Mapping**
- *"Show module structure with export counts"*
- *"List all entry points (files with CLI patterns)"*
- *"Find orphaned functions (not exported, not called internally)"*

**Pattern Analysis**
- *"How many async functions exist in the codebase?"*
- *"Find all event handlers by naming convention"*
- *"Locate adapter pattern implementations"*

---

## Design Goals

### Core Principles

1. **Hash Compatibility First**
   - Use identical hash system as js-edit (`HASH_PRIMARY_ENCODING = 'base64'`, 8 chars)
   - Ensure hashes can be used interchangeably between js-scan and js-edit
   - Support hash-based lookup for tracing functions across files

2. **Dense Information Design**
   - Optimize for quick scanning, not exhaustive detail
   - **Terse output by default** with 200-line limit (overridable)
   - Show relevance ranking with ★ stars (like md-scan)
   - Provide just enough context for decision-making
   - **Agent guidance**: Suggest refinements when results are truncated

3. **Workspace-Aware**
   - Scan entire directories with smart exclusions (node_modules, tests, etc.)
   - Understand module boundaries and export patterns
   - Map dependencies between files

4. **Pattern-First Discovery**
   - Support regex and glob patterns for function names
   - Enable semantic queries (e.g., "async functions", "exported classes")
   - Provide filtering by function kind, export status, location

5. **JSON-First Output**
   - Always provide machine-readable JSON for agent consumption
   - **Compact by default**: Limit output to 200 lines unless `--limit` specified
   - **Smart truncation**: Suggest query refinements when results exceed limits
   - Support piping to other tools (jq, grep)

---

## Hash System Integration

### Hash Compatibility with js-edit

**Shared Hash Infrastructure:**
```javascript
// From tools/dev/lib/swcAst.js
const HASH_PRIMARY_ENCODING = 'base64';
const HASH_FALLBACK_ENCODING = 'hex';
const HASH_LENGTH_BY_ENCODING = Object.freeze({
  base64: 8,
  hex: 12
});

function createDigest(text, encoding = HASH_PRIMARY_ENCODING) {
  const digestEncoding = HASH_LENGTH_BY_ENCODING[encoding] ? encoding : HASH_FALLBACK_ENCODING;
  const digest = crypto.createHash('sha256').update(text).digest(digestEncoding);
  const sliceLength = HASH_LENGTH_BY_ENCODING[digestEncoding] || digest.length;
  return digest.slice(0, sliceLength);
}

function computeHash(source, span, encoding = HASH_PRIMARY_ENCODING) {
  const byteIndex = buildByteIndex(source);
  const normalizedSpan = normalizeSpan(span, byteIndex);
  const sourceBuffer = Buffer.from(source, 'utf8');
  const snippet = normalizedSpan.byteEnd > normalizedSpan.byteStart
    ? sourceBuffer.slice(normalizedSpan.byteStart, normalizedSpan.byteEnd).toString('utf8')
    : '';
  return createDigest(snippet, encoding);
}
```

**js-scan must:**
1. Import `createDigest`, `computeHash`, and hash constants from `tools/dev/lib/swcAst.js`
2. Use identical span extraction logic (byte-based, normalized)
3. Store hashes in all function records for cross-tool lookups
4. Support `--find-hash <hash>` operation to locate functions by hash

**Hash Stability Guarantees:**
- Hashes are deterministic based on function body content (byte-level)
- Whitespace changes inside function body alter hash (by design—detects drift)
- Moving a function to another file preserves hash (content unchanged)
- Renaming a function preserves hash (name not included in hash)

### Cross-Tool Workflow Example

```bash
# Agent discovers function location
chcp 65001
node tools/dev/js-scan.js --dir src --search "database" --json > scan-results.json

# Extract hash for target function
$targetHash = (Get-Content scan-results.json | ConvertFrom-Json).matches[0].hash

# Use hash with js-edit for guarded replacement
node tools/dev/js-edit.js --file src/db.js --replace "exports.query" `
  --expect-hash $targetHash --with new-query.js --fix
```

---

## Feature Design

### Phase 1: Core Discovery (MVP)

#### 1.1 Multi-File Function Search

**Operation:** `--search <terms>`

Search for functions across multiple files by name, pattern, or content.

**Example:**
```bash
node tools/dev/js-scan.js --dir src --search "compress database"
```

**Output (Compact by Default):**
```
Search: compress, database | 127 files, 2,341 functions | 18 matches

src/utils/articleCompression.js:99        kJ8mP3xQ ★★★★★ compressAndStoreArticleHtml (exported)
src/utils/articleCompression.js:182       7wY2nL5R ★★★★  getArticleCompressionStatus (exported)
src/utils/compressionBatch.js:45          mK9pT4vX ★★★   compressBatch (async, exported)
src/db.js:234                              xT5nM8kL ★★    query
src/utils/compressionBuckets.js:67        pL2vN9mT ★★    storeInBucket (exported)
src/utils/articleCompression.js:235       wX4kR7nQ ★     decompressArticleHtml (exported)
[... 12 more matches ...]

💡 Showing top 20 of 18 matches. Use --limit 50 to see more.
💡 Narrow search: try --search "compress database transaction" or --exported
```

**JSON Output:**
```json
{
  "operation": "search",
  "terms": ["compress", "database"],
  "directory": "src",
  "stats": {
    "filesScanned": 127,
    "functionsFound": 2341,
    "matchCount": 18
  },
  "matches": [
    {
      "rank": 5,
      "file": "src/utils/articleCompression.js",
      "function": {
        "name": "compressAndStoreArticleHtml",
        "canonicalName": "exports.compressAndStoreArticleHtml",
        "kind": "function",
        "exportKind": "named",
        "line": 99,
        "column": 10,
        "hash": "kJ8mP3xQ",
        "span": {
          "start": 3120,
          "end": 5890,
          "length": 2770,
          "byteStart": 3120,
          "byteEnd": 5890,
          "byteLength": 2770
        },
        "pathSignature": "module.body[5].FunctionDeclaration"
      },
      "context": {
        "snippet": "Compresses article HTML and stores in bucket system...",
        "matchTerms": ["compress", "database"],
        "nearbyExports": ["getArticleCompressionStatus", "decompressArticleHtml"]
      }
    }
  ]
}
```

**Relevance Ranking:**
- ★★★★★ (5): Name match + both terms in body
- ★★★★ (4): Name match + one term in body
- ★★★ (3): Both terms in body
- ★★ (2): One term in body, other term in nearby context
- ★ (1): Single term match with low frequency

**Agent Guidance (Smart Suggestions):**
When output exceeds 200 lines (default limit), js-scan provides actionable guidance:
```
⚠️  200+ matches found (showing first 20). Consider:
💡 Add filters: --exported, --async, --kind "function"
💡 Narrow search: --search "compress database transaction"
💡 Target directory: --dir src/utils (currently scanning src/)
💡 Show more: --limit 50 or --limit 0 (unlimited)
💡 Export for analysis: --json > results.json
```

#### 1.2 Hash-Based Lookup

**Operation:** `--find-hash <hash>`

Locate function by its hash value across the entire workspace.

**Example:**
```bash
node tools/dev/js-scan.js --dir src --find-hash kJ8mP3xQ --json
```

**Output:**
```json
{
  "operation": "find-hash",
  "hash": "kJ8mP3xQ",
  "encoding": "base64",
  "found": true,
  "matches": [
    {
      "file": "src/utils/articleCompression.js",
      "function": {
        "name": "compressAndStoreArticleHtml",
        "canonicalName": "exports.compressAndStoreArticleHtml",
        "kind": "function",
        "hash": "kJ8mP3xQ",
        "line": 99,
        "span": {
          "start": 3120,
          "end": 5890
        }
      }
    }
  ]
}
```

**Use Cases:**
- Trace test failure hashes back to source functions
- Verify hash uniqueness (collision detection)
- Find function after refactoring moved it to different file
- Validate plan hashes before applying edits

#### 1.3 Module Index

**Operation:** `--build-index`

Generate overview of all JavaScript files with export counts and entry point detection.

**Example:**
```bash
node tools/dev/js-scan.js --dir src --build-index
```

**Output:**
```
╔══════════════════════════════════════════════════════════════════════════════╗
║                            JavaScript Module Index                           ║
╚══════════════════════════════════════════════════════════════════════════════╝

Files             : 127
Total Functions   : 2,341
Total Classes     : 48
Total Exports     : 892

─────────────────────────────────────────────────────────────────────────────────

⭐ src/crawl.js (Entry Point)
   Functions : 8 (6 exported)
   Classes   : 1 (NewsCrawler, exported)
   Pattern   : CLI entry point detected

⭐ src/db.js (Core Module)
   Functions : 24 (24 exported)
   Classes   : 1 (NewsDatabase, exported)
   Pattern   : Database adapter

src/utils/CliFormatter.js
   Functions : 28 (28 exported)
   Classes   : 1 (CliFormatter, exported)
   Pattern   : Utility module

src/utils/articleCompression.js
   Functions : 12 (8 exported, 4 internal)
   Classes   : 0
   Pattern   : Feature module

[... 123 more files ...]
```

**Priority Markers:**
- ⭐ Entry points (files with CLI patterns or main exports)
- High export density (>20 exported functions)
- Core modules (referenced by many other files)

#### 1.4 Pattern-Based Discovery

**Operation:** `--find-pattern <pattern>`

Find functions matching naming patterns using glob or regex.

**Examples:**
```bash
# Find all handler functions
node tools/dev/js-scan.js --dir src --find-pattern "handle*" --json

# Find all adapter classes
node tools/dev/js-scan.js --dir src --find-pattern "*Adapter" --kind class

# Find all async database functions
node tools/dev/js-scan.js --dir src --find-pattern "*" --async --search "database"
```

**Supported Pattern Types:**
- Glob: `handle*`, `*Adapter`, `get*Status`
- Regex: `/^handle[A-Z]/`, `/Adapter$/`
- Semantic: `--async`, `--exported`, `--class`, `--arrow-function`

#### 1.5 Agent Guidance System

**Operation:** Automatic (embedded in all operations)

Provide actionable suggestions when results are large or ambiguous to help agents refine queries efficiently.

**Guidance Triggers:**
- **High match count** (>50): Suggest filters (--exported, --async, --kind)
- **Output truncation** (>200 lines): Suggest --limit or --max-lines increase
- **Broad directory** (scanning root): Suggest --dir refinement
- **Low relevance scores** (<3 stars): Suggest additional search terms
- **Zero matches**: Suggest pattern alternatives or directory expansion

**Example Output:**
```
Search: handler | src/ | 89 files, 1,240 functions | 156 matches

[... first 20 matches ...]

⚠️  156 matches found (showing 20). Output limited to 200 lines.
💡 Refine search:
   • Add filters: --exported --async
   • Narrow terms: --search "handler event"
   • Target area: --dir src/api
   • Show more: --limit 50 --max-lines 500
💡 Export all: --json > results.json (no line limits)
```

**Guidance Categories:**
1. **Refinement suggestions**: How to narrow results
2. **Expansion options**: How to see more or remove limits
3. **Alternative approaches**: Different query strategies
4. **Export recommendations**: When to use JSON for programmatic analysis

### Phase 2: Advanced Discovery

#### 2.1 Dependency Mapping

**Operation:** `--map-dependencies`

Show which files import/require other files.

**Use Case:** Understanding module coupling before refactoring.

#### 2.2 Export Analysis

**Operation:** `--find-exports`

List all exported functions/classes with usage hints.

**Use Case:** Identifying public API surface for documentation.

#### 2.3 Orphan Detection

**Operation:** `--find-orphans`

Locate functions that are neither exported nor called internally.

**Use Case:** Dead code detection before cleanup.

#### 2.4 Similarity Search

**Operation:** `--find-similar <hash>`

Find functions with similar structure (near-hash matches).

**Use Case:** Detecting duplicate logic candidates for DRY refactoring.

#### 2.5 Refactor-Aware Filters (Agent Feedback Enhancement)

**Operation:** `--refactor-mode`

Enable filters optimized for refactoring scenarios, such as:
- `--high-coupling`: Prioritize functions with many dependencies or calls.
- `--large-functions`: Filter functions above a certain line count (e.g., >50 lines).
- `--export-candidates`: Suggest functions that could be extracted as modules.
- `--duplicate-detection`: Highlight functions with similar hashes or structures.

**Relevance Ranking Enhancements:**
- Boost scores for functions that are good refactoring candidates (e.g., large, highly coupled functions).
- Add refactor-specific metrics in output, like coupling score or extraction potential.

**Use Case:** Agents planning modularization can quickly identify functions that benefit from extraction or relocation.

#### 2.6 Refactor Plan Generation

**Operation:** `--refactor-plan <terms>`

Generate a structured plan for refactoring based on search results, including:
- Suggested module boundaries.
- Function move recommendations.
- Dependency analysis for safe refactoring.

**Output:** JSON plan compatible with js-edit workflows, including hash tracking for guarded edits.

**Use Case:** Automate initial planning for large refactorings, reducing manual analysis time.

### Phase 3: Integration Features

#### 3.1 Cross-Reference with md-scan

Link functions to documentation sections mentioning them.

#### 3.2 Test Coverage Mapping

Show which functions have corresponding test files.

#### 3.3 Batch Hash Validation

Verify multiple hashes from plan files still match current code.

### Phase 3: Integration Features

#### 3.1 Cross-Reference with md-scan

Link functions to documentation sections mentioning them.

#### 3.2 Test Coverage Mapping

Show which functions have corresponding test files.

#### 3.3 Batch Hash Validation

Verify multiple hashes from plan files still match current code.

---

## Command-Line Interface

### Basic Syntax

```bash
node tools/dev/js-scan.js [options]
```

### Core Operations (Mutually Exclusive)

| Operation | Description | Example |
|-----------|-------------|---------|
| `--search <terms>` | Search functions by name/content | `--search "database compress"` |
| `--find-hash <hash>` | Locate function by hash | `--find-hash kJ8mP3xQ` |
| `--build-index` | Generate module overview | `--build-index` |
| `--find-pattern <pattern>` | Match naming patterns | `--find-pattern "handle*"` |
| `--map-dependencies` | Show file dependencies | `--map-dependencies` |
| `--find-exports` | List all exports | `--find-exports` |
| `--refactor-plan <terms>` | Generate refactor plan | `--refactor-plan "compress"` |

### Filtering Options

| Flag | Description | Example |
|------|-------------|---------|
| `--dir <path>` | Directory to scan (default: `src`) | `--dir src/crawler` |
| `--exclude <patterns>` | Exclude paths | `--exclude "**/__tests__/**,**/node_modules/**"` |
| `--kind <type>` | Filter by function kind | `--kind "function,async function"` |
| `--exported` | Show only exported functions | `--exported` |
| `--async` | Show only async functions | `--async` |
| `--min-lines <n>` | Minimum function length | `--min-lines 50` |
| `--max-lines <n>` | Maximum function length | `--max-lines 200` |
| `--refactor-mode` | Enable refactor-aware filters | `--refactor-mode --high-coupling` |
| `--high-coupling` | Prioritize highly coupled functions | `--high-coupling` |
| `--large-functions` | Filter large functions (>50 lines) | `--large-functions` |

### Filtering Options
### Filtering Options

| Flag | Description | Example |
|------|-------------|---------|
| `--dir <path>` | Directory to scan (default: `src`) | `--dir src/crawler` |
| `--exclude <patterns>` | Exclude paths | `--exclude "**/__tests__/**,**/node_modules/**"` |
| `--kind <type>` | Filter by function kind | `--kind "function,async function"` |
| `--exported` | Show only exported functions | `--exported` |
| `--async` | Show only async functions | `--async` |
| `--min-lines <n>` | Minimum function length | `--min-lines 50` |
| `--max-lines <n>` | Maximum function length | `--max-lines 200` |
| `--refactor-mode` | Enable refactor-aware filters | `--refactor-mode --high-coupling` |
| `--high-coupling` | Prioritize highly coupled functions | `--high-coupling` |
| `--large-functions` | Filter large functions (>50 lines) | `--large-functions` |

### Output Options

| Flag | Description | Example |
|------|-------------|---------|
| `--json` | Machine-readable JSON output | `--json` |
| `--verbose` | Detailed text output (boxes, full context) | `--verbose` |
| `--limit <n>` | Max matches to show (default: 20, 0=unlimited) | `--limit 50` |
| `--max-lines <n>` | Max output lines (default: 200, 0=unlimited) | `--max-lines 500` |
| `--no-snippets` | Omit code snippets (compact only) | `--no-snippets` |
| `--no-guidance` | Suppress agent guidance suggestions | `--no-guidance` |
| `--hashes-only` | Output only hash list | `--hashes-only` |

### Special Modes

| Flag | Description | Example |
|------|-------------|---------|
| `--priority-only` | Show only priority files | `--priority-only` |
| `--stats` | Show statistics only | `--stats` |
| `--verify-hashes <file>` | Validate plan hashes | `--verify-hashes plan.json` |

---

## Implementation Plan

### Technical Stack

- **Parser**: `@swc/core` (reuse js-edit infrastructure)
- **Hash System**: `tools/dev/lib/swcAst.js` (shared with js-edit)
- **Formatting**: `src/utils/CliFormatter.js` (consistent with md-scan)
- **Arguments**: `src/utils/CliArgumentParser.js`
- **Output**: JSON-first with text fallback

### File Structure

```
tools/dev/
├── js-scan.js              # Main CLI entry point (~600 lines)
├── js-scan.cmd             # Windows UTF-8 wrapper
├── js-scan-README.md       # Tool documentation
└── js-scan/
    ├── operations/
    │   ├── search.js       # Multi-term search logic
    │   ├── hashLookup.js   # Hash-based discovery
    │   ├── indexing.js     # Module index building
    │   └── patterns.js     # Pattern matching
    ├── shared/
    │   ├── scanner.js      # Multi-file scanning
    │   ├── ranker.js       # Relevance ranking
    │   └── filters.js      # Result filtering
    └── lib/
        └── fileContext.js  # File-level metadata extraction
```

### Core Abstractions

#### FileRecord
```javascript
{
  filePath: 'src/utils/articleCompression.js',
  relativePath: 'src/utils/articleCompression.js',
  stats: {
    lines: 280,
    functions: 12,
    classes: 0,
    exports: 8
  },
  moduleKind: 'commonjs',  // or 'esm'
  entryPoint: false,
  priority: false,
  functions: [...],  // Array of FunctionRecord
  classes: [...],    // Array of ClassRecord
  dependencies: {
    imports: ['./compression', '../db'],
    exports: ['compressAndStoreArticleHtml', ...]
  }
}
```

#### FunctionRecord (Extended from js-edit)
```javascript
{
  name: 'compressAndStoreArticleHtml',
  canonicalName: 'exports.compressAndStoreArticleHtml',
  kind: 'function',
  async: false,
  generator: false,
  exportKind: 'named',  // or 'default', null
  line: 99,
  column: 10,
  hash: 'kJ8mP3xQ',
  span: { start, end, length, byteStart, byteEnd, byteLength },
  pathSignature: 'module.body[5].FunctionDeclaration',
  scopeChain: [],
  file: 'src/utils/articleCompression.js'  // Added for multi-file
}
```

#### SearchMatch
```javascript
{
  rank: 5,  // 1-5 stars
  score: 0.92,  // 0-1 relevance
  file: 'src/utils/articleCompression.js',
  function: FunctionRecord,
  context: {
    snippet: '...',
    matchTerms: ['compress', 'database'],
    matchLocations: [{ term: 'compress', inName: true, inBody: true }],
    nearbyExports: ['getArticleCompressionStatus']
  }
}
```

#### GuidancePayload (Agent Assistance)
```javascript
{
  triggered: true,
  reason: 'high-match-count',  // or 'output-truncated', 'low-relevance', 'zero-matches'
  suggestions: [
    {
      category: 'refine',
      action: 'add-filter',
      example: '--exported --async',
      rationale: '48% of matches are exported, 32% are async'
    },
    {
      category: 'narrow',
      action: 'add-term',
      example: '--search "handler event click"',
      rationale: 'Common co-occurring terms in top matches'
    },
    {
      category: 'target',
      action: 'change-dir',
      example: '--dir src/api',
      rationale: '78% of matches in src/api subdirectory'
    },
    {
      category: 'expand',
      action: 'increase-limit',
      example: '--limit 50 --max-lines 500',
      rationale: 'Showing 20 of 156 matches'
    }
  ],
  stats: {
    matchCount: 156,
    displayed: 20,
    truncated: true,
    avgRelevance: 2.3,
    exportedRatio: 0.48,
    asyncRatio: 0.32,
    topDirectory: 'src/api',
    topDirectoryRatio: 0.78
  }
}
```

### Shared Infrastructure with js-edit

**Direct Reuse:**
```javascript
// From tools/dev/lib/swcAst.js
const {
  parseModule,
  collectFunctions,
  collectVariables,
  createDigest,
  computeHash,
  createSpanKey,
  HASH_PRIMARY_ENCODING,
  HASH_FALLBACK_ENCODING,
  HASH_LENGTH_BY_ENCODING
} = require('./lib/swcAst');
```

**Key Constraint:** js-scan must NOT modify swcAst.js hash logic. Any hash-related features must use existing functions.

### Phased Implementation

#### Phase 1.1: Scanner Foundation (Day 1)
- [ ] Create `js-scan.js` CLI skeleton
- [ ] Implement `findJavaScriptFiles()` with exclusions
- [ ] Build `parseFileRecord()` using swcAst
- [ ] Test multi-file parsing on src/ directory
- [ ] Deliverable: Can scan and parse all files, output file list

#### Phase 1.2: Search Operation (Day 1-2)
- [ ] Implement multi-term search with word boundaries
- [ ] Build relevance ranking algorithm (★ stars)
- [ ] Add snippet extraction with context
- [ ] Implement compact text output as default (vs. verbose)
- [ ] Add 200-line output limit with truncation warnings
- [ ] Build agent guidance system (smart suggestions)
- [ ] Implement `--search` with JSON and text output
- [ ] Test on real queries: "database", "compress cache", "handler"
- [ ] Deliverable: Working search with ranked results and guidance

#### Phase 1.3: Hash Lookup (Day 2)
- [ ] Implement hash-based function finder
- [ ] Support both base64 and hex hash formats
- [ ] Add collision detection (multiple matches warning)
- [ ] Test with known js-edit hashes
- [ ] Verify hash compatibility with js-edit
- [ ] Deliverable: `--find-hash` operation working

#### Phase 1.4: Module Index (Day 2-3)
- [ ] Build file statistics aggregator
- [ ] Detect entry points (CLI patterns)
- [ ] Identify priority modules (high export density)
- [ ] Implement `--build-index` operation
- [ ] Test on full src/ directory
- [ ] Deliverable: Complete module overview

#### Phase 1.5: Pattern Matching (Day 3)
- [ ] Implement glob pattern matching
- [ ] Add regex pattern support
- [ ] Build semantic filters (--async, --exported)
- [ ] Combine patterns with search
- [ ] Test various pattern queries
- [ ] Deliverable: `--find-pattern` operation working

#### Phase 1.6: Documentation & Testing (Day 4)
- [ ] Create js-scan-README.md
- [ ] Add usage examples for each operation
- [ ] Write Jest tests for core operations
- [ ] Test hash compatibility with js-edit
- [ ] Create Windows UTF-8 wrapper (js-scan.cmd)
- [ ] Update agent files with js-scan workflows
- [ ] Deliverable: Documented, tested MVP

---

## Agent Integration

### Workflow Patterns

#### Pattern 1: Discovery → Context → Edit

```bash
# Step 1: Find relevant functions across workspace
node tools/dev/js-scan.js --dir src --search "database adapter" --json > targets.json

# If output suggests refinement (too many matches):
# Follow guidance: node tools/dev/js-scan.js --dir src/db --search "database adapter" --exported --json > targets.json

# Step 2: Get detailed context for specific function
$file = (Get-Content targets.json | ConvertFrom-Json).matches[0].file
$func = (Get-Content targets.json | ConvertFrom-Json).matches[0].function.canonicalName
node tools/dev/js-edit.js --file $file --context-function $func --emit-plan plan.json

# Step 3: Apply guarded edit
node tools/dev/js-edit.js --file $file --replace $func --with new-impl.js --expect-hash (Get-Content plan.json | ConvertFrom-Json).matches[0].hash --fix
```

#### Pattern 2: Hash Tracing

```bash
# Test fails with hash kJ8mP3xQ
# Find the source function
node tools/dev/js-scan.js --dir src --find-hash kJ8mP3xQ --json

# Get full context
node tools/dev/js-edit.js --file <result-file> --context-function <result-func>
```

#### Pattern 3: Module Reconnaissance

```bash
# Before refactoring compression utilities
node tools/dev/js-scan.js --dir src/utils --search "compress" --json > compress-inventory.json

# Analyze module boundaries
node tools/dev/js-scan.js --dir src/utils --build-index --priority-only
```

#### Pattern 4: Refactor Planning (Agent Feedback Enhancement)

```bash
# Agent task: Plan modularization of high-coupling functions

# Step 1: Use refactor-aware search
node tools/dev/js-scan.js --dir src --refactor-mode --high-coupling --large-functions --search "compress" --json > refactor-candidates.json

# Step 2: Generate refactor plan
node tools/dev/js-scan.js --dir src --refactor-plan "compress" --json > refactor-plan.json

# Step 3: Review plan and apply js-edit moves
# Use hashes from plan for guarded relocations
```

### Agent File Updates

Add to `.github/agents/Careful js-edit refactor.agent.md`:

```markdown
### α — Deep Discovery & Tooling Inventory

**Multi-file code discovery:** Use `node tools/dev/js-scan.js --dir <path> --search <terms>` to locate relevant functions across the workspace. Output is compact by default (200-line limit). If results are truncated, js-scan provides guidance on how to refine the query. Use `--find-pattern` for naming conventions (e.g., `handle*`, `*Adapter`). Use `--build-index` to understand module structure before invasive changes.

**Refactor-aware discovery:** For refactoring tasks, use `--refactor-mode` with filters like `--high-coupling` or `--large-functions` to prioritize functions that are good candidates for extraction or relocation. Use `--refactor-plan` to generate initial modularization plans.

**Follow agent guidance:** When js-scan suggests refinements (💡 messages), apply them before proceeding. Narrow searches are more efficient than unlimited output. For refactor scenarios, guidance includes suggestions for coupling analysis and extraction candidates.

**Hash-based tracing:** When encountering hashes in test failures or plan files, use `node tools/dev/js-scan.js --find-hash <hash>` to locate the source function across all files.

**JSON export for analysis:** For large result sets, use `--json > results.json` to bypass line limits and process programmatically with jq or Node.js scripts. For refactor planning, JSON output includes coupling metrics and extraction recommendations.
```

---

## Output Format Standards

### JSON Schema

```json
{
  "version": 1,
  "operation": "search|find-hash|build-index|find-pattern",
  "generatedAt": "2025-11-06T12:00:00.000Z",
  "directory": "src",
  "exclusions": ["**/__tests__/**", "**/node_modules/**"],
  "stats": {
    "filesScanned": 127,
    "functionsFound": 2341,
    "classesFound": 48,
    "matchCount": 18,
    "scanDurationMs": 1842
  },
  "query": {
    "terms": ["compress", "database"],
    "pattern": null,
    "hash": null,
    "filters": {
      "kind": null,
      "exported": false,
      "async": false,
      "minLines": null,
      "maxLines": null
    }
  },
  "matches": [
    {
      "rank": 5,
      "score": 0.92,
      "file": "src/utils/articleCompression.js",
      "relativePath": "src/utils/articleCompression.js",
      "function": {
        "name": "compressAndStoreArticleHtml",
        "canonicalName": "exports.compressAndStoreArticleHtml",
        "kind": "function",
        "async": false,
        "generator": false,
        "exportKind": "named",
        "line": 99,
        "column": 10,
        "hash": "kJ8mP3xQ",
        "span": {
          "start": 3120,
          "end": 5890,
          "length": 2770,
          "byteStart": 3120,
          "byteEnd": 5890,
          "byteLength": 2770
        },
        "pathSignature": "module.body[5].FunctionDeclaration",
        "scopeChain": []
      },
      "context": {
        "snippet": "Compresses article HTML and stores in bucket system using configured algorithm...",
        "snippetLength": 80,
        "matchTerms": ["compress", "database"],
        "matchLocations": [
          { "term": "compress", "inName": true, "inBody": true, "count": 12 },
          { "term": "database", "inName": false, "inBody": true, "count": 3 }
        ],
        "nearbyExports": ["getArticleCompressionStatus", "decompressArticleHtml"]
      }
    }
  ]
}
```

### Text Output Format (Default: Compact)

```
Search: compress, database | src/ | 127 files, 2,341 functions | 18 matches (1.8s)

src/utils/articleCompression.js:99        kJ8mP3xQ ★★★★★ compressAndStoreArticleHtml (exported)
src/utils/articleCompression.js:182       7wY2nL5R ★★★★  getArticleCompressionStatus (exported)
src/utils/compressionBatch.js:45          mK9pT4vX ★★★   compressBatch (async, exported)
src/db.js:234                              xT5nM8kL ★★    query
src/utils/compressionBuckets.js:67        pL2vN9mT ★★    storeInBucket (exported)
src/utils/articleCompression.js:235       wX4kR7nQ ★     decompressArticleHtml (exported)
[... 12 more matches ...]

💡 Use --json for machine-readable output | --verbose for detailed view | --limit 50 to see more
```

### Verbose Output Format (--verbose flag)

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                          JavaScript Function Search                          ║
╚══════════════════════════════════════════════════════════════════════════════╝

Search Terms      : compress, database
Directory         : src
Files Scanned     : 127
Functions Found   : 2,341
Matches           : 18
Scan Duration     : 1.8s

─────────────────────────────────────────────────────────────────────────────────

Match 1: compressAndStoreArticleHtml (★★★★★ 0.92)
  File     : src/utils/articleCompression.js:99
  Hash     : kJ8mP3xQ
  Kind     : function (exported)
  Length   : 83 lines (2770 bytes)
  Path     : module.body[5].FunctionDeclaration
  
  Matches  : ✓ compress (name + 12× body)
           : ✓ database (3× body)
  
  Snippet  : Compresses article HTML and stores in bucket system using
           : configured algorithm. Handles transaction rollback on failure...
  
  Nearby   : getArticleCompressionStatus, decompressArticleHtml

─────────────────────────────────────────────────────────────────────────────────

Match 2: getArticleCompressionStatus (★★★★ 0.78)
  [... similar format ...]

─────────────────────────────────────────────────────────────────────────────────
Use --json for machine-readable output. Results limited to 200 lines.
```

---

## Performance Considerations

### Scan Performance Targets

- **Small codebase** (50 files): < 500ms
- **Medium codebase** (200 files): < 2s
- **Large codebase** (500 files): < 5s

### Optimization Strategies

1. **Lazy Parsing**
   - Only parse files that pass filename/path filters
   - Skip test files by default unless explicitly included
   - Cache parsed ASTs for repeated queries

2. **Parallel Processing**
   - Parse files in parallel using worker threads
   - Batch file reads for I/O efficiency
   - Use streaming for large directory scans

3. **Smart Exclusions**
   - Default exclusions: `**/__tests__/**`, `**/*.test.js`, `**/node_modules/**`, `**/dist/**`
   - Support custom exclusion patterns
   - Early path filtering before file reads

4. **Index Caching** (Phase 3)
   - Cache file hashes and function inventories
   - Detect file changes via mtime or content hash
   - Incremental updates on subsequent scans

### Memory Constraints

- Limit concurrent file parsing (max 10 files in memory)
- Stream results for large match sets
- Clear ASTs after function extraction

---

## Testing Strategy

### Unit Tests

```javascript
// tests/tools/__tests__/js-scan.test.js

describe('js-scan multi-file discovery', () => {
  test('finds functions across multiple files', () => {
    const result = runJsScan(['--dir', fixtureDir, '--search', 'helper', '--json']);
    const payload = JSON.parse(result.stdout);
    expect(payload.stats.filesScanned).toBeGreaterThan(1);
    expect(payload.matchCount).toBeGreaterThan(0);
  });

  test('hash compatibility with js-edit', () => {
    // Get hash from js-edit
    const editResult = runJsEdit(['--file', fixture, '--list-functions', '--json']);
    const editPayload = JSON.parse(editResult.stdout);
    const expectedHash = editPayload.functions[0].hash;

    // Find same function via js-scan
    const scanResult = runJsScan(['--dir', path.dirname(fixture), '--find-hash', expectedHash, '--json']);
    const scanPayload = JSON.parse(scanResult.stdout);
    
    expect(scanPayload.found).toBe(true);
    expect(scanPayload.matches[0].function.hash).toBe(expectedHash);
  });

  test('relevance ranking prioritizes name matches', () => {
    const result = runJsScan(['--dir', fixtureDir, '--search', 'compress', '--json']);
    const payload = JSON.parse(result.stdout);
    const topMatch = payload.matches[0];
    expect(topMatch.context.matchLocations.some(loc => loc.inName)).toBe(true);
  });
});
```

### Integration Tests

- Scan real `src/` directory and verify performance
- Compare hashes with known js-edit output
- Test pattern matching against production code
- Validate JSON schema compliance

### Fixtures

```
tests/fixtures/tools/js-scan/
├── multi-file/
│   ├── moduleA.js    # 5 functions, 2 exported
│   ├── moduleB.js    # 8 functions, 3 exported, 1 class
│   └── utils.js      # 12 functions, all exported
├── hash-test/
│   ├── original.js   # Function with known hash
│   └── moved.js      # Same function, different file
└── patterns/
    ├── handlers.js   # Functions matching handle* pattern
    └── adapters.js   # Classes matching *Adapter pattern
```

---

## Risks & Mitigation

### Risk 1: Hash Collisions

**Risk:** Two functions might produce identical 8-char hashes.

**Mitigation:**
- Add collision detection in `--find-hash` operation
- Warn when multiple functions share hash
- Provide `--hash-collisions` diagnostic operation
- Document path signature as secondary identifier

**Probability:** Low (2^42 space with SHA-256 truncation)

### Risk 2: Performance Degradation

**Risk:** Large codebases (1000+ files) could cause unacceptable scan times.

**Mitigation:**
- Implement parallel parsing
- Add `--max-files` safety limit
- Provide progress indicators for long scans
- Phase 3: Implement index caching

**Probability:** Medium (acceptable for MVP, needs optimization)

### Risk 3: Hash Drift After Refactoring

**Risk:** Whitespace-only changes alter hashes, breaking hash-based lookups.

**Mitigation:**
- Document that hashes are content-based (by design)
- Provide `--verify-hashes <plan>` to detect drift before edits
- Agent workflows should re-scan after structural changes
- Future: Add normalized hash option (ignore whitespace)

**Probability:** High (expected behavior, not a bug)

### Risk 4: Tool Complexity Creep

**Risk:** Feature additions make tool unwieldy like js-edit (2000+ lines).

**Mitigation:**
- Modular operation structure (separate files per operation)
- Strict MVP scope for Phase 1
- Defer advanced features to Phase 2/3
- Regular complexity audits

**Probability:** Medium (manageable with discipline)

---

## Success Metrics

### Phase 1 MVP Success Criteria

- [ ] Can search 200+ files in < 3 seconds
- [ ] Hash compatibility verified with js-edit (100% match)
- [ ] JSON output validates against schema
- [ ] Relevance ranking improves first-match accuracy by 80%+
- [ ] **Compact output fits in 200 lines for 90% of queries**
- [ ] **Agent guidance provides 3+ actionable suggestions when truncated**
- [ ] Agents can locate functions without reading entire files
- [ ] Documentation includes 10+ workflow examples
- [ ] **Refactor-aware filters prioritize high-coupling and large functions effectively**
- [ ] **Refactor plan generation produces actionable JSON plans for modularization**

### Adoption Metrics (Post-MVP)

- Agent usage frequency (tracked in CHANGE_PLAN.md)
- Time saved vs. manual file scanning
- Hash-based workflow adoption rate
- User feedback from agent file integration

---

## Future Enhancements (Phase 4+)

### Advanced Search
- Semantic search using embeddings (find similar functions by behavior)
- Call graph analysis (find all functions calling X)
- Parameter signature matching (find functions with similar args)

### Refactoring Support
- Suggest move targets for functions (module boundary optimization)
- Detect duplicate code by near-hash matching
- Identify coupling hotspots (files with many cross-references)

### Documentation Integration
- Auto-link functions to related documentation sections
- Generate API reference from export inventory
- Track documentation coverage (functions without JSDoc)

### CI/CD Integration
- Pre-commit hash validation (detect unexpected function changes)
- Export inventory diffing (track API surface changes)
- Dead code reporting (orphaned function detection)

---

## Comparison with Alternatives

| Feature | js-scan | grep/ripgrep | ast-grep | Custom Scripts |
|---------|---------|--------------|----------|----------------|
| Multi-file search | ✓ | ✓ | ✓ | ✓ |
| Hash-based lookup | ✓ | ✗ | ✗ | ✗ |
| Relevance ranking | ✓ | ✗ | ✗ | ✗ |
| AST-aware | ✓ | ✗ | ✓ | ✗ |
| js-edit integration | ✓ | ✗ | ✗ | ✗ |
| JSON output | ✓ | ✓ | ✓ | ✓ |
| Pattern matching | ✓ | ✓ | ✓ | ✓ |
| Module indexing | ✓ | ✗ | ✗ | ✗ |
| Span/byte accuracy | ✓ | ✗ | ✓ | ✗ |

**Key Differentiator:** Hash compatibility with js-edit enables guarded multi-file workflows that no other tool supports.

---

## Appendix: Example Workflows

### Workflow 1: Feature Modularization Planning

```bash
# Agent task: Modularize compression utilities

# Step 1: Discover all compression-related functions
node tools/dev/js-scan.js --dir src --search "compress decompress" --json > compress-inventory.json

# Step 2: Analyze module boundaries
node tools/dev/js-scan.js --dir src/utils --build-index --priority-only

# Step 3: Extract hashes for tracking during refactor
jq -r '.matches[].function.hash' compress-inventory.json > compress-hashes.txt

# Step 4: Before moving functions, verify hashes still match
node tools/dev/js-scan.js --dir src --find-hash (cat compress-hashes.txt | head -1)

# Step 5: Use js-edit with hashes for guarded moves
# (repeat for each function)
```

### Workflow 2: Test Failure Investigation

```bash
# Test fails with message: "Hash mismatch: expected kJ8mP3xQ"

# Find the function
node tools/dev/js-scan.js --dir src --find-hash kJ8mP3xQ --json > found.json

# Get detailed context
$file = (Get-Content found.json | ConvertFrom-Json).matches[0].file
node tools/dev/js-edit.js --file $file --context-function exports.compressAndStoreArticleHtml

# Compare current hash with expected
node tools/dev/js-edit.js --file $file --locate exports.compressAndStoreArticleHtml --json | jq -r '.matches[0].hash'
```

### Workflow 3: API Surface Documentation

```bash
# Generate complete export inventory for documentation

# Find all exports
node tools/dev/js-scan.js --dir src --find-exports --json > exports.json

# Group by module
jq 'group_by(.file) | map({file: .[0].file, exports: map(.function.name)})' exports.json > api-surface.json

# Find undocumented exports (missing JSDoc)
node tools/dev/js-scan.js --dir src --find-exports --filter "no-jsdoc" --json
```

---

## Conclusion

**js-scan** fills a critical gap in the agent tooling ecosystem by enabling efficient multi-file JavaScript discovery with hash-compatible function identification. By reusing js-edit's proven hash infrastructure and following md-scan's dense information design patterns, it provides agents with the reconnaissance capabilities needed for confident cross-file refactoring.

**Key Value Propositions:**
1. **Speed**: Find relevant code in seconds vs. minutes of manual file reading
2. **Accuracy**: Hash-based identification eliminates ambiguity in multi-file workflows
3. **Integration**: Seamless handoff to js-edit for guarded mutations
4. **Consistency**: Unified CLI experience across js-scan, js-edit, and md-scan
5. **Intelligence Amplification**: Agent guidance system suggests query refinements, increasing agent effectiveness
6. **Terse by Default**: 200-line output limit prevents context overflow while maintaining actionability

**Next Steps:**
1. Review this proposal with stakeholders
2. Approve Phase 1 scope and priorities
3. Begin implementation (estimated 4 days for MVP)
4. Integrate into agent workflows
5. Gather usage data for Phase 2 prioritization

---

**Document Version**: 1.1  
**Last Updated**: 2025-11-06  
**Status**: Updated with agent feedback
