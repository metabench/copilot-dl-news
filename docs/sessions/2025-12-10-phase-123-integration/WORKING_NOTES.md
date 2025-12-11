# Working Notes – Fix HierarchicalPlanner plan fallback

- 2025-12-10 — Session created via CLI. Add incremental notes here.

- 2025-12-10 09:07 — - Implemented HierarchicalPlanner fallback: track best node during branch-and-bound and return partial plan when goal unmet; ensures plan.steps never null in phase-123 integration.
- Hardened heuristic learning: derive success from expected vs actual values, default action sequences when missing, and allow single-action patterns to seed cross-domain sharing.
- Added single-action support in _extractPatterns to avoid empty pattern sets.
- Tests: npm run test:by-path src/crawler/__tests__/phase-123-integration.test.js (pass).

- 2025-12-10 09:09 — Key takeaways for future agents:
- HierarchicalPlanner could return null when no goal node hit; tracking best node and returning partial plan fixes plan.steps undefined failures. If tests show plan null, check _branchAndBound pruning and ensure partial fallback exists.
- _extractPatterns ignored single-action sequences; adding single-action support prevents empty patterns and unblocks cross-domain sharing tests. When heuristics look empty, verify actionSequence population and pattern extraction for length-1 sequences.
- learnHeuristics previously required explicit success/actualValue; now infers success from expected vs actual (>=70%) and falls back to actions when actionSequence missing. When feeding plan outcomes, provide expectedValue/value to help pattern learning.
- Cross-domain sharing relies on planning_heuristics + pattern_performance seed data; tests seed both tables. If sharing fails, inspect DB fixture: planning_heuristics first, pattern_performance FK to it.
- Phase-123 integration tests are sensitive to feature flags: ensure patternDiscovery, adaptiveBranching, costAwarePriority, crossDomainSharing are enabled for the primary planner under test.
