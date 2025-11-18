# Plan: Add TypeScript Support and Function Copying to js-edit/js-scan

Objective: 
1. Add TypeScript support to js-edit and js-scan tools using patterns from external repo
2. Implement function/expression copying capability in js-edit
3. Integrate copying with js-scan for batch operations

Done when:
- TypeScript files (.ts/.tsx) can be processed by js-edit and js-scan
- New --copy-from flag in js-edit can copy functions/expressions from other files
- js-scan can generate batch copy operations for multiple items
- Tests pass for new functionality

Change set: 
- Modify js-edit.js and js-scan.js to support TypeScript via environment variables
- Add lib/swcTs.js module for TypeScript AST parsing
- Add copy operations to js-edit operations/mutation.js
- Update CLI argument parsing for new --copy-from flag
- Add ts-edit.js and ts-scan.js wrapper scripts

Risks/assumptions: 
- External repo patterns work correctly
- @swc/core TypeScript support is compatible
- Copying operations maintain code correctness

Tests: 
- Unit tests for swcTs module
- Integration tests for TypeScript file processing
- Tests for copy operations
- Tests for batch copying via js-scan integration

Benchmark: N/A

Docs to update: 
- tools/dev/README.md with TypeScript support
- AGENTS.md if new workflows emerge