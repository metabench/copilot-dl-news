# Working Notes: JS/TS Scan and Edit Tooling Review

## Files Reviewed
- `tools/dev/js-scan.js` - Multi-file JavaScript discovery tool
- `tools/dev/js-edit.js` - Guarded JavaScript function surgery tool
- `tools/dev/README.md` - Comprehensive CLI documentation
- `docs/AGENT_REFACTORING_PLAYBOOK.md` - Workflow guides for Gap 2/3 tools
- `tests/tools/js-edit/batch-dry-run.test.js` - Batch operations testing
- `tests/tools/js-scan/operations/relationships.test.js` - Gap 2 semantic queries testing

## Current Capabilities (Gap 2 & Gap 3 Implemented)

### js-scan (Discovery & Analysis)
- **Search Operations**: Multi-term search with ranking, pattern matching, hash lookups
- **Gap 2 Semantic Queries**:
  - `--what-imports <target>` - Find all files importing a module
  - `--what-calls <function>` - Find all callers of a function
  - `--export-usage <target>` - Comprehensive usage analysis (imports + calls + re-exports)
- **Analysis Features**:
  - `--ripple-analysis <file>` - Dependency impact assessment with risk scoring
  - `--build-index` - Module statistics and entry point discovery
  - `--follow-deps` - Dependency chain traversal
- **Output Formats**: JSON, human-readable tables, bilingual support (English/Chinese)
- **Filtering**: `--match`, `--exclude`, `--include-paths`, `--exported`, `--async`

### js-edit (Safe Code Modification)
- **Core Operations**: `--locate`, `--replace`, `--extract`, `--rename`, `--context`
- **Gap 3 Batch Operations**:
  - `--dry-run` - Preview changes without applying
  - `--recalculate-offsets` - Handle line number drift in batch edits
  - `--from-plan` - Replay verified changes with guardrails
- **Guardrails**: Hash verification, span checking, syntax validation, unified diffs
- **Selectors**: Function names, hashes, paths, variable targets (declarator/binding/declaration)
- **Recipe System**: Multi-step workflows with conditional logic and error handling
- **Bilingual CLI**: Chinese aliases (`--搜`, `--替`, etc.)

### Testing & Quality
- Comprehensive test suites for core functionality
- Batch dry-run operations tested
- Relationship queries validated
- Performance benchmarks included

## Gaps and Brainstormed Improvements

### 1. TypeScript Support (High Priority)
**Current State**: Tools are JavaScript-only, no TypeScript parsing
**Ideas**:
- Create `ts-scan.js` and `ts-edit.js` with TypeScript AST support
- Add `--lang ts` flag to existing tools for TypeScript files
- Support TypeScript-specific queries: `--what-implements <interface>`, `--what-extends <class>`
- Handle `.ts`/`.tsx` files with type-aware analysis
- Integrate with TypeScript compiler API for better accuracy

### 2. Advanced AST-Based Refactoring (High Priority)
**Current State**: Basic function/variable operations
**Ideas**:
- Extract method/inline function capabilities
- Rename symbols across files with type safety
- Change function signatures with parameter updates
- Extract interface/class from existing code
- Convert between function styles (arrow, function declaration, method)
- Handle destructuring, spread operators, template literals

### 3. VS Code Integration (Medium Priority)
**Current State**: CLI-only tools
**Ideas**:
- VS Code extension that wraps js-scan/js-edit
- LSP integration for real-time analysis
- Code actions powered by the tools
- Interactive diff viewer for changes
- Keyboard shortcuts for common operations

### 4. Undo/Redo & Version Control Integration (Medium Priority)
**Current State**: No undo mechanism
**Ideas**:
- Git integration to create commits for each change
- Undo stack with `--undo` flag
- Branch management for experimental refactors
- Stash/unstash changes during complex operations

### 5. Enhanced Error Recovery & Diagnostics (Medium Priority)
**Current State**: Basic conflict detection
**Ideas**:
- Automatic conflict resolution strategies
- Better error messages with suggestions
- Recovery from partial failures in batch operations
- Diagnostic mode that explains why operations fail

### 6. Performance & Scalability (Medium Priority)
**Current State**: Works for moderate codebases
**Ideas**:
- Incremental analysis with caching
- Parallel processing for large workspaces
- Memory-efficient AST processing
- Streaming results for very large outputs

### 7. Extended Query Types (Low Priority)
**Current State**: Basic import/call/export queries
**Ideas**:
- `--what-depends-on <symbol>` - Reverse dependency analysis
- `--what-implements <interface>` - Interface implementation discovery
- `--what-uses <type>` - Type usage analysis
- `--dead-code` - Identify unused code
- `--circular-deps` - Detect circular dependencies

### 8. Machine Learning Integration (Future)
**Current State**: Rule-based analysis
**Ideas**:
- Suggest refactorings based on patterns
- Learn from successful/failed operations
- Code completion powered by codebase analysis
- Automatic bug detection

### 9. Multi-Language Support (Future)
**Current State**: JavaScript/TypeScript focus
**Ideas**:
- Python scanning/editing tools
- Support for other C-family languages
- Language-agnostic query interface
- Cross-language dependency analysis

### 10. Plugin System (Future)
**Current State**: Built-in operations only
**Ideas**:
- User-defined operations via plugins
- Community plugin ecosystem
- Custom analysis rules
- Integration with linters/formatters

### 11. UI & Visualization (Future)
**Current State**: CLI-only
**Ideas**:
- Web-based interface for complex operations
- Graph visualization of dependencies
- Interactive refactoring tools
- Dashboard for codebase metrics

### 12. Testing Framework Integration (Future)
**Current State**: Standalone tools
**Ideas**:
- Automatic test generation for refactored code
- Integration with Jest/Mocha for test-aware refactoring
- Test impact analysis
- Safe refactoring with test coverage validation

### 13. Code Generation & Templates (Future)
**Current State**: Manual code writing
**Ideas**:
- Generate boilerplate from patterns
- Template-based code generation
- AI-powered code completion
- Snippet management

### 14. Documentation Generation (Future)
**Current State**: Code analysis only
**Ideas**:
- Generate JSDoc from code analysis
- API documentation from usage patterns
- Dependency diagrams
- Architecture documentation

### 15. Security & Compliance (Future)
**Current State**: No security features
**Ideas**:
- Security vulnerability scanning
- Compliance rule checking
- Safe refactoring for regulated code
- Audit trails for changes

## Prioritized Implementation Plan

### Phase 1: TypeScript Support (2-3 weeks)
1. Add TypeScript AST parsing to existing tools
2. Implement `--lang ts` flag
3. Add TypeScript-specific queries
4. Update tests and documentation

### Phase 2: Advanced Refactoring (3-4 weeks)
1. Implement extract method functionality
2. Add signature change operations
3. Support complex destructuring
4. Enhanced rename operations

### Phase 3: IDE Integration (2-3 weeks)
1. Create VS Code extension wrapper
2. Add LSP protocol support
3. Implement code actions
4. Interactive diff viewer

### Phase 4: Ecosystem Expansion (Ongoing)
1. Plugin system architecture
2. Additional language support
3. UI components
4. ML integration research

## Success Metrics
- Reduce refactoring time by 80% (current Gap 2/3: 75-80% improvement)
- Support TypeScript with same feature parity as JavaScript
- Enable safe complex refactorings (extract method, change signatures)
- Integrate with developer workflows (VS Code, version control)
- Maintain high reliability (>95% success rate for operations)