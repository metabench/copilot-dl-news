# md-edit: Markdown Documentation Manager

A precision CLI tool for managing and refactoring Markdown documentation files, following the same architecture patterns as `js-edit`.

## Why md-edit?

Large documentation files (1000+ lines) become difficult to navigate and maintain. `md-edit` provides surgical operations for Markdown documents:

- **Discovery**: List sections, search content, analyze structure
- **Context**: View sections with neighbors, emit metadata plans
- **Mutation**: Remove outdated sections, extract content, replace with guards

## Installation

```bash
# Add markdown-it dependency
npm install markdown-it --save-dev

# Make executable
chmod +x tools/dev/md-edit.js
```

## ⚠️ **Windows PowerShell Users: Fix Unicode Display**

If you see garbled characters like `Ôöî` or `ÔòÉ` instead of box-drawing characters, run this **once per session**:

```powershell
chcp 65001
```

Or add to your PowerShell profile for a permanent fix:
```powershell
echo "chcp 65001 > `$null" | Out-File -Append $PROFILE
```

**Alternative**: Use the provided .cmd wrapper:
```cmd
tools\dev\md-edit.cmd docs/CHANGE_PLAN.md --stats
```

See **[docs/POWERSHELL_ENCODING_FIX.md](../../docs/POWERSHELL_ENCODING_FIX.md)** for complete details.

## Quick Start

```bash
# Show document statistics
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --stats

# List all sections
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --list-sections

# Search for content
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --search "Phase 2"

# Show a specific section
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --show-section "Task Ledger"

# Remove outdated sections (dry-run by default)
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --remove-section "Old Section" --fix
```

## Discovery Operations

### List Sections

```bash
# List all sections with line numbers
node tools/dev/md-edit.js docs/ARCHITECTURE.md --list-sections

# Filter by heading level
node tools/dev/md-edit.js docs/ARCHITECTURE.md --list-sections --level 2

# Filter by level range
node tools/dev/md-edit.js docs/ARCHITECTURE.md --list-sections --min-level 2 --max-level 3

# Filter by pattern (glob)
node tools/dev/md-edit.js docs/ARCHITECTURE.md --list-sections --match "*Implementation*"

# Exclude by pattern
node tools/dev/md-edit.js docs/ARCHITECTURE.md --list-sections --exclude "*deprecated*"

# Show with hashes (for guardrails)
node tools/dev/md-edit.js docs/ARCHITECTURE.md --list-sections --verbose
```

### Document Outline

```bash
# Show hierarchical outline
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --outline

# JSON format for processing
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --outline --json
```

### Statistics

```bash
# Show document statistics
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --stats

# Output:
#   Total lines:      892
#   Prose lines:      780
#   Code lines:       112
#   Total words:      15432
#   Total sections:   45
#   Sections by level:
#     H1: 1
#     H2: 12
#     H3: 32
#   Code blocks:      23
#   Avg section size: 19 lines
```

### Search Operations

```bash
# Search entire document
node tools/dev/md-edit.js docs/ARCHITECTURE.md --search "facade pattern"

# Search only in headings
node tools/dev/md-edit.js docs/ARCHITECTURE.md --search-headings "Phase"

# Limit search results
node tools/dev/md-edit.js docs/ARCHITECTURE.md --search "implementation" --search-limit 10

# JSON output for scripting
node tools/dev/md-edit.js docs/ARCHITECTURE.md --search "API" --json
```

### List Code Blocks

```bash
# List all code blocks with languages
node tools/dev/md-edit.js docs/GUIDE.md --list-code-blocks

# Verbose mode shows preview
node tools/dev/md-edit.js docs/GUIDE.md --list-code-blocks --verbose
```

## Context Operations

### Show Section

```bash
# Show a specific section
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --show-section "Task Ledger"

# Show with context lines
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --show-section "Task Ledger" --context-lines 5

# Show with neighboring sections
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --show-section "Task Ledger" --with-neighbors

# Select by hash (for precision)
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --show-section a1b2c3d4e5f6g7h8

# Show multiple matches
node tools/dev/md-edit.js docs/ARCHITECTURE.md --show-section "Implementation" --allow-multiple
```

### Emit Plan

```bash
# Export section metadata for batch operations
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --emit-plan tmp/sections-plan.json

# Plan includes: heading, level, slug, hash, line ranges
# Use for scripting or sharing section metadata
```

## Mutation Operations

All mutation operations are **dry-run by default**. Add `--fix` to apply changes.

### Remove Section

```bash
# Preview removal
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --remove-section "Deprecated Feature"

# Apply removal
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --remove-section "Deprecated Feature" --fix

# Remove with hash guard (prevents wrong section)
node tools/dev/md-edit.js docs/CHANGE_PLAN.md \
  --remove-section "Old Section" \
  --expect-hash a1b2c3d4e5f6g7h8 \
  --fix

# Remove multiple matching sections
node tools/dev/md-edit.js docs/ARCHITECTURE.md \
  --remove-section "TODO" \
  --allow-multiple \
  --fix
```

### Extract Section

```bash
# Extract to stdout
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --extract-section "Task Ledger"

# Extract to file
node tools/dev/md-edit.js docs/CHANGE_PLAN.md \
  --extract-section "Phase 2 Summary" \
  --output tmp/phase2-summary.md

# Extract as JSON
node tools/dev/md-edit.js docs/CHANGE_PLAN.md \
  --extract-section "Task Ledger" \
  --json
```

### Replace Section

```bash
# Replace with inline text
node tools/dev/md-edit.js docs/CHANGE_PLAN.md \
  --replace-section "Status" \
  --with "## Status\n\nAll tasks completed." \
  --fix

# Replace with file content
node tools/dev/md-edit.js docs/CHANGE_PLAN.md \
  --replace-section "Task Ledger" \
  --with-file tmp/updated-ledger.md \
  --fix

# Replace with hash guard
node tools/dev/md-edit.js docs/CHANGE_PLAN.md \
  --replace-section "Risks" \
  --with-file tmp/new-risks.md \
  --expect-hash a1b2c3d4e5f6g7h8 \
  --fix
```

## Selectors

Sections can be selected by:

1. **Exact heading**: `--show-section "Implementation Plan"`
2. **Partial match** (case-insensitive): `--show-section "implementation"`
3. **Slug**: `--show-section "implementation-plan"`
4. **Hash**: `--show-section a1b2c3d4e5f6g7h8` (16-char SHA-256 prefix)

Hashes prevent accidental mutations when content changes.

## Common Workflows

### Clean Up Completed Tasks

```bash
# 1. Find completed sections
node tools/dev/md-edit.js docs/TASKS.md --search-headings "completed"

# 2. Extract for archive
node tools/dev/md-edit.js docs/TASKS.md \
  --extract-section "Completed Tasks" \
  --output docs/archives/completed-$(date +%Y%m%d).md

# 3. Remove from active doc
node tools/dev/md-edit.js docs/TASKS.md \
  --remove-section "Completed Tasks" \
  --fix
```

### Split Large Documents

```bash
# 1. Get plan of all sections
node tools/dev/md-edit.js docs/LARGE_GUIDE.md --emit-plan tmp/sections.json

# 2. Extract specific sections to new files
node tools/dev/md-edit.js docs/LARGE_GUIDE.md \
  --extract-section "Installation" \
  --output docs/installation.md

node tools/dev/md-edit.js docs/LARGE_GUIDE.md \
  --extract-section "Configuration" \
  --output docs/configuration.md

# 3. Update main doc with links
node tools/dev/md-edit.js docs/LARGE_GUIDE.md \
  --replace-section "Installation" \
  --with "See [Installation Guide](./installation.md)" \
  --fix
```

### Update Recurring Sections

```bash
# 1. Show current content with hash
node tools/dev/md-edit.js docs/README.md \
  --show-section "Status" \
  --verbose

# 2. Prepare new content
cat > tmp/new-status.md << 'EOF'
All Phase 2 tasks completed.
See CHANGE_PLAN.md for details.
EOF

# 3. Replace with guard
node tools/dev/md-edit.js docs/README.md \
  --replace-section "Status" \
  --with-file tmp/new-status.md \
  --expect-hash <hash-from-step-1> \
  --fix
```

### Remove Deprecated Warnings

```bash
# Find all deprecation notices
node tools/dev/md-edit.js docs/*.md --search "DEPRECATED" --json > tmp/deprecations.json

# Remove batch (manual review recommended)
for file in docs/API_*.md; do
  node tools/dev/md-edit.js "$file" \
    --remove-section "*deprecated*" \
    --allow-multiple \
    --fix
done
```

## Architecture

Follows `js-edit` patterns:

```
tools/dev/
├── md-edit.js           # Main CLI entry point
├── lib/
│   └── markdownAst.js   # Markdown parsing (markdown-it)
└── md-edit/
    ├── operations/
    │   ├── discovery.js  # List, search, outline, stats
    │   ├── context.js    # Show sections, emit plans
    │   └── mutation.js   # Remove, extract, replace
    └── shared/
        └── io.js         # File I/O utilities
```

### Why markdown-it?

- **Token-based parsing**: Preserves line positions for precise edits
- **Extensible**: Can add plugins for custom syntax
- **Battle-tested**: Used by VS Code, Docusaurus, VuePress
- **CommonJS compatible**: Works with existing toolchain

## Limitations & Future Work

### Current Limitations

1. **Heading-based only**: Sections are defined by headings. No paragraph-level operations yet.
2. **No frontmatter support**: YAML frontmatter is treated as prose.
3. **No link rewriting**: When extracting/splitting, links remain absolute.
4. **No conflict detection**: Multiple mutations must be run separately.

### Planned Features

- `--rename-section`: Change heading text while preserving content
- `--move-section`: Reorder sections within document
- `--merge-sections`: Combine related sections
- `--split-section`: Break large sections at subheadings
- `--fix-links`: Update relative links after extraction
- `--deduplicate`: Find and merge duplicate sections
- Frontmatter support with `--update-frontmatter`
- Table of contents generation with `--generate-toc`

## Comparison with js-edit

| Feature | js-edit | md-edit |
|---------|---------|---------|
| Discovery | Functions, variables | Sections, code blocks |
| Selectors | Name, hash, line | Heading, slug, hash |
| Guards | `--expect-hash`, `--expect-span` | `--expect-hash` |
| Mutations | Extract, replace with AST | Extract, replace sections |
| Dry-run | Default | Default |
| Plan emission | JSON metadata | JSON metadata |
| Language | JavaScript (SWC) | Markdown (markdown-it) |

## Tips

1. **Always dry-run first**: Review changes before `--fix`
2. **Use hashes for critical edits**: Guards prevent wrong-section mutations
3. **Emit plans for complex work**: JSON plans enable scripting
4. **Search before removing**: Verify matches with `--search` first
5. **Archive before bulk changes**: Extract to `docs/archives/` before cleanup

## Related Tools

- `tools/docs/generate-doc-inventory.js`: Documentation analysis
- `docs/INDEX.md`: Central documentation index
- `AGENTS.md`: AI agent documentation hub

## Examples from Real Docs

### Analyze CHANGE_PLAN.md

```bash
# Show structure
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --stats
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --outline

# Find Phase 2 references
node tools/dev/md-edit.js docs/CHANGE_PLAN.md --search "Phase 2" --search-limit 5

# Extract completed phase
node tools/dev/md-edit.js docs/CHANGE_PLAN.md \
  --extract-section "Phase 2 - Crawl Facade" \
  --output docs/archives/phase2-complete.md
```

### Clean Up TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md (1597 lines)

```bash
# List top-level sections
node tools/dev/md-edit.js docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md \
  --list-sections --level 2

# Extract specific testing category
node tools/dev/md-edit.js docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md \
  --extract-section "Integration Tests" \
  --output docs/testing/integration-tests.md

# Remove deprecated test patterns
node tools/dev/md-edit.js docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md \
  --remove-section "Legacy Test Patterns" \
  --fix
```

## Contributing

When adding features:

1. Add operation to appropriate module (`discovery`/`context`/`mutation`)
2. Update CLI parser in `md-edit.js`
3. Add examples to this README
4. Write tests (see `tests/tools/__tests__/md-edit.test.js`)
5. Update AGENTS.md with workflow guidance

## See Also

- [js-edit README](./README.md) - JavaScript refactoring tool
- [AGENTS.md](../../AGENTS.md) - Documentation for AI agents
- [docs/INDEX.md](../../docs/INDEX.md) - Documentation index
