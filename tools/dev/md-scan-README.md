# md-scan: Multi-File Documentation Discovery

Fast documentation discovery across large Markdown documentation sets. Find relevant information without reading everything.

## Why md-scan?

When you have 200+ documentation files:
- **Finding is harder than reading** - Need to know where to look first
- **Multi-term search** - Find docs mentioning both "database" AND "migration"
- **Priority awareness** - Identify essential docs marked with ⭐
- **Section-level discovery** - Jump directly to "Troubleshooting" across all docs
- **AI agent workflows** - Help agents find relevant context quickly

## Installation

```bash
# Already installed with markdown-it dependency
npm install markdown-it --save-dev
```

## ⚠️ Windows PowerShell Users

Run this once per session for proper Unicode display:
```powershell
chcp 65001
```

Or use the wrapper:
```cmd
tools\dev\md-scan.cmd <args>
```

See [docs/POWERSHELL_ENCODING_FIX.md](../../docs/POWERSHELL_ENCODING_FIX.md) for details.

## Quick Start

```bash
# Search across all docs
node tools/dev/md-scan.js --dir docs --search testing async

# Find specific sections
node tools/dev/md-scan.js --dir docs --find-sections Troubleshooting "Common Pitfalls"

# Show priority documents
node tools/dev/md-scan.js --dir docs --build-index --priority-only

# Map cross-references
node tools/dev/md-scan.js --dir docs --map-links
```

## Operations

### Multi-Term Search

Find documents containing specific terms with relevance ranking:

```bash
# Basic search
node tools/dev/md-scan.js --dir docs --search testing async

# Limit results
node tools/dev/md-scan.js --dir docs --search database migration --search-limit 5

# Compact output (no context snippets)
node tools/dev/md-scan.js --dir docs --search "crawl" --compact

# Case-sensitive search
node tools/dev/md-scan.js --dir docs --search "WAL" --case-sensitive
```

**Output includes:**
- Relevance ranking (★ stars based on match count)
- Priority markers (⭐ for essential docs)
- Match counts per term
- Line numbers for all matches
- Context snippets
- Section names where matches occur

### Section Finder

Find specific section types across all documentation:

```bash
# Find troubleshooting sections
node tools/dev/md-scan.js --dir docs --find-sections Troubleshooting

# Multiple patterns
node tools/dev/md-scan.js --dir docs --find-sections "Usage" "Examples" "Quick Start"

# Compact output
node tools/dev/md-scan.js --dir docs --find-sections "API" --compact
```

**Output includes:**
- Files with matching sections
- Section headings with line ranges
- Content previews (unless --compact)
- Priority markers for essential docs

### Build Index

Generate overview of entire documentation set:

```bash
# Full index
node tools/dev/md-scan.js --dir docs --build-index

# Priority documents only
node tools/dev/md-scan.js --dir docs --build-index --priority-only

# JSON export
node tools/dev/md-scan.js --dir docs --build-index --json > doc-index.json
```

**Index includes:**
- File paths with line counts and section counts
- Priority markers (⭐, ⭐⭐, ⭐⭐⭐)
- Summary statistics

### Cross-Reference Map

Show how documents link to each other:

```bash
# Show all links
node tools/dev/md-scan.js --dir docs --map-links

# JSON export
node tools/dev/md-scan.js --dir docs --map-links --json
```

## Options

### Input
- `--dir <path>` - Directory to scan (default: current directory)
- `--exclude <pattern>` - Exclude paths containing pattern (e.g., `archive`)

### Operations
- `--search <term...>` - Search for terms (space-separated)
- `--find-sections <pattern...>` - Find sections by pattern
- `--build-index` - Build document index
- `--map-links` - Show cross-reference map

### Filters
- `--priority-only` - Show only docs with ⭐ markers
- `--case-sensitive` - Case-sensitive search

### Output
- `--search-limit <n>` - Max results to display (default: 20)
- `--compact` - Compact output (no context/previews)
- `--json` - Output as JSON
- `--verbose` - Show detailed processing

## Example Workflows

### AI Agent Starting New Task

**Task**: "Fix database connection timeout in tests"

```bash
# Step 1: Quick discovery
node tools/dev/md-scan.js --dir docs \
  --search "database connection" timeout tests \
  --priority-only --search-limit 5

# Output shows:
# ⭐ docs/DATABASE_QUICK_REFERENCE.md (8 matches)
# ⭐ docs/TESTING_ASYNC_CLEANUP_GUIDE.md (6 matches)
#   docs/TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md (4 matches)

# Step 2: Find troubleshooting sections
node tools/dev/md-scan.js --dir docs \
  --find-sections Troubleshooting --compact

# Step 3: Read identified docs with md-edit
node tools/dev/md-edit.js docs/DATABASE_QUICK_REFERENCE.md \
  --show-section "Connection Pooling" --with-neighbors
```

### Exploring New Codebase

```bash
# What documentation exists?
node tools/dev/md-scan.js --dir docs --build-index --priority-only

# Find all getting started content
node tools/dev/md-scan.js --dir docs \
  --find-sections "Quick Start" "Getting Started" "Installation"

# Search for architecture docs
node tools/dev/md-scan.js --dir docs --search architecture system design
```

### Finding Examples

```bash
# Find code examples
node tools/dev/md-scan.js --dir docs \
  --find-sections Examples Usage "Code Samples"

# Find specific API usage
node tools/dev/md-scan.js --dir docs \
  --search "createConnection" "db.query" --compact
```

## Output Format

### Search Results

```
┌ Search Results (2 terms, 3 files, 240 matches) ══════════════
│
├─ docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md ★★★★★ (99 matches)
│  ├─ "database" (28 matches) L1, L3, L26, L39... 
│  │  **When to Read**: When planning database migration...
│  ├─ "migration" (71 matches) L1, L6, L13...
│  └─ Sections: Database Migration Guide for AI Agents
│
├─ docs/PHASE_0_IMPLEMENTATION.md ★★★★★ ⭐ (78 matches)
│  ├─ "database" (23 matches) L1, L22, L23...
│  └─ Sections: Database Normalization - Phase 0
```

**Legend:**
- `★★★★★` - Relevance ranking (more stars = more matches)
- `⭐` - Priority marker (essential documentation)
- `L123` - Line numbers
- `(N matches)` - Match count

### Section Results

```
┌ Section Search (2 patterns, 19 sections in 18 files) ═══════
│
├─ docs/DATABASE_ACCESS_PATTERNS.md ⭐ (1 sections)
│  ├─   Troubleshooting L658-735
│  │    Common issues with database connections...
│
├─ docs/GUIDE_TO_AGENTIC_WORKFLOWS.md (2 sections)
│  ├─     31. Common Pitfalls and Solutions L1497-1552
│  └─     D. Troubleshooting Guide L1819-1841
```

## JSON Export

For programmatic consumption:

```bash
# Export search results
node tools/dev/md-scan.js --dir docs \
  --search testing --json > search-results.json

# Export full index
node tools/dev/md-scan.js --dir docs \
  --build-index --json > doc-index.json

# Export cross-references
node tools/dev/md-scan.js --dir docs \
  --map-links --json > cross-refs.json
```

## Performance

Scanning 250 files (~300,000 lines):
- **Build index**: ~2 seconds
- **Multi-term search**: ~1-2 seconds
- **Section finder**: ~1 second

Results are sorted by relevance, so most useful docs appear first.

## Integration with Other Tools

### With md-edit

```bash
# 1. Find relevant docs
node tools/dev/md-scan.js --dir docs --search "testing patterns" --compact

# 2. View specific sections
node tools/dev/md-edit.js docs/TESTING_QUICK_REFERENCE.md \
  --show-section "Common Patterns" --with-neighbors
```

### With grep/ripgrep

```bash
# md-scan: High-level discovery
node tools/dev/md-scan.js --dir docs --search async cleanup

# ripgrep: Detailed code search
rg "afterEach\|afterAll" docs/ -A 3
```

## Comparison with Other Tools

| Tool | Use Case | Speed | Output |
|------|----------|-------|--------|
| **md-scan** | Multi-file doc discovery | Fast | Ranked, structured |
| **md-edit** | Single-file editing/viewing | Fast | Detailed |
| **grep/rg** | Code/text search | Fastest | Raw matches |
| **find** | File discovery | Fastest | File lists |

**When to use md-scan:**
- Need to search multiple Markdown files
- Want relevance ranking
- Need section-level granularity
- Working with priority-marked docs (⭐)
- Building documentation indices

## Limitations

- **Markdown only** - Doesn't parse other formats
- **No fuzzy search** - Requires exact word matches (with word boundaries)
- **Memory usage** - Loads all docs into memory (not an issue for <1000 files)
- **No incremental updates** - Re-parses everything each run

## Future Enhancements

See proposal in md-scan.js for Phase 2/3 features:
- Cached index with incremental updates
- Topic clustering algorithms
- Boolean search operators (AND, OR, NOT)
- Fuzzy/semantic search
- When to Read metadata extraction
- AI-optimized snippet export

## Related Documentation

- [md-edit README](./md-edit-README.md) - Single-file Markdown editing
- [docs/POWERSHELL_ENCODING_FIX.md](../../docs/POWERSHELL_ENCODING_FIX.md) - Unicode display issues
- [docs/AI_AGENT_DOCUMENTATION_GUIDE.md](../../docs/AI_AGENT_DOCUMENTATION_GUIDE.md) - Writing AI-friendly docs

## License

Same as project license.
