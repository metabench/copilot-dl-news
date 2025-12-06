# Plan – Implement Gap 5 and Gap 6 CLI Operations

## Objective
Add missing operation handlers for Gap 6 operations (--call-graph, --hot-paths, --dead-code) in js-scan.js. Gap 5 operations (--depends-on, --impacts) are already implemented.

## Status
**Current Phase**: Complete

## Done When
- [x] Gap 5 operations (--depends-on, --impacts) verified working
- [x] Gap 6: Add printCallGraph() function for human-readable output
- [x] Gap 6: Add printHotPaths() function for human-readable output
- [x] Gap 6: Add printDeadCode() function for human-readable output
- [x] Gap 6: Add operation handlers in main() for call-graph, hot-paths, dead-code
- [x] Validate with test runs
- [x] Key deliverables documented in `SESSION_SUMMARY.md`

## Change Set
- `tools/dev/js-scan.js` - Add print functions and operation handlers

## Discovery Notes
- CLI flags already defined in createParser() (lines 675-678)
- ensureSingleOperation() already handles call-graph, hot-paths, dead-code
- Core functions already exist in callGraph.js: buildCallGraph, selectNode, traverseCallGraph, computeHotPaths, findDeadCode
- Missing: print functions and operation handlers in main()

## Risks & Mitigations
- **Low risk**: Core logic already implemented in callGraph.js
- **Mitigation**: Test each operation after adding handler

## Tests / Validation
- Run `node tools/dev/js-scan.js --hot-paths --json --limit 10`
- Run `node tools/dev/js-scan.js --dead-code --json --limit 10`
- Run `node tools/dev/js-scan.js --call-graph <function> --json`
