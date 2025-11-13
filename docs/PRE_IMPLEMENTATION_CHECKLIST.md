---
type: implementation-checklist
title: "Pre-Implementation Checklist: Tooling Improvements"
subtitle: "Tasks to complete before starting development"
date: 2025-11-13
---

# Pre-Implementation Checklist

Use this checklist to validate readiness and set up for successful implementation of the three tooling improvements.

---

## Phase 0: Pre-Development Setup (Before Hour 1)

### Documentation Review
- [ ] **Decision maker** reviewed `TOOLING_IMPROVEMENTS_SUMMARY.md`
- [ ] **Team lead** reviewed `IMPLEMENTATION_ROADMAP.md` phases
- [ ] **Implementation engineer(s)** reviewed `TOOLING_GAPS_2_3_PLAN.md` specs
- [ ] **All** understand the workflow improvements from `AGENT_REFACTORING_PLAYBOOK.md`

### Project Setup
- [ ] Created project/sprint in tracking system
- [ ] Assigned implementation engineer(s)
- [ ] Allocated time: 10-14 hours over 4-5 days
- [ ] Scheduled daily check-ins (15 min)
- [ ] Set up testing CI/CD pipeline

### Code Readiness
- [ ] Recent main branch checkout: `git checkout main && git pull`
- [ ] All tests passing: `npm test` or `npm run test:by-path tests/`
- [ ] No local changes: `git status` (should be clean)
- [ ] Review existing code structure:
  - [ ] Examined `tools/dev/js-scan.js` (understand structure)
  - [ ] Examined `tools/dev/js-edit.js` (understand structure)
  - [ ] Located `tools/dev/js-scan/operations/` directory
  - [ ] Located `tools/dev/js-edit/operations/` directory
  - [ ] Checked existing test structure in `tests/tools/`

### Documentation Integration
- [ ] Confirm `/docs/TOOLING_IMPROVEMENTS_*.md` files created
- [ ] Confirm `/docs/AGENT_REFACTORING_PLAYBOOK.md` created
- [ ] Confirm `/docs/IMPLEMENTATION_ROADMAP.md` created
- [ ] Confirm `AGENTS.md` updated with tooling section
- [ ] Verify all cross-references work correctly

---

## Phase 1 Prep: Gap 2 — Semantic Relationship Queries (6-8 hours)

### Requirements Validation
- [ ] Understand current import/export graph in js-scan
  - [ ] Reviewed how graph is built: `scanWorkspace()`
  - [ ] Identified graph data structure
  - [ ] Confirmed graph is available for relationship analysis
- [ ] Identify which operators to implement first
  - [ ] `--what-imports` (find importers)
  - [ ] `--what-calls` (find callers)
  - [ ] `--export-usage` (find export usage)
- [ ] Confirmed ripple analysis exists (can leverage it)

### File Structure
- [ ] Created/confirmed directory: `tools/dev/js-scan/operations/`
- [ ] Created stub file: `tools/dev/js-scan/operations/relationships.js` (or will create)
- [ ] Created test directory: `tests/tools/gap2/` (or will create)
- [ ] Created stub test: `tests/tools/gap2/relationships.test.js` (or will create)

### Testing Setup
- [ ] Test fixtures ready in: `tests/fixtures/` (real JS files for testing)
- [ ] Test runner working: `npm run test:by-path tests/tools/gap2/relationships.test.js`
- [ ] Confirmed test output format (JSON assertions)

### Documentation Prep
- [ ] Created/confirmed: `docs/GAP2_SEMANTIC_QUERIES.md` (stub)
- [ ] Will update: `tools/dev/README.md` (add new flags section)

---

## Phase 2 Prep: Gap 3 — Batch Dry-Run + Recovery (4-6 hours)

### Requirements Validation
- [ ] Understand current batch operation in js-edit
  - [ ] Reviewed `--changes` flag implementation
  - [ ] Identified where validation happens
  - [ ] Confirmed file loading mechanism
- [ ] Confirm existing guard system:
  - [ ] `expectHash` available
  - [ ] `expectSpan` available
  - [ ] `pathSignature` available
- [ ] Plan dry-run workflow:
  - [ ] What to validate (line ranges, file existence, syntax)
  - [ ] What to report (validity status, conflicts, suggestions)
  - [ ] How to detect conflicts (overlapping ranges)

### File Structure
- [ ] Created/confirmed directory: `tools/dev/js-edit/operations/`
- [ ] Created stub file: `tools/dev/js-edit/operations/batch-dryrun.js` (or will create)
- [ ] Created recovery system stub: `tools/dev/js-edit/operations/batch-recovery.js` (or will create)
- [ ] Created test directory: `tests/tools/gap3/`
- [ ] Created stub test: `tests/tools/gap3/batch-dryrun.test.js`

### Testing Setup
- [ ] Test fixtures ready (JSON batch files with various scenarios)
- [ ] Test runner working: `npm run test:by-path tests/tools/gap3/batch-dryrun.test.js`
- [ ] Confirmed dry-run output format (detailed JSON report)

### Documentation Prep
- [ ] Created/confirmed: `docs/GAP3_BATCH_DRYRUN.md` (stub)
- [ ] Will update: `tools/dev/README.md` (add dry-run section)

---

## Phase 3 Prep: Plans Integration (2-3 hours)

### Requirements Validation
- [ ] Understand current `--emit-plan` output
  - [ ] Examined what plans contain
  - [ ] Confirmed plan format (JSON structure)
  - [ ] Identified guard fields (hash, span, etc.)
- [ ] Understand how plans should be consumed
  - [ ] How to load plan JSON
  - [ ] How to extract guard values
  - [ ] How to apply guards to next operation

### Implementation Plan
- [ ] Confirmed where to add `--from-plan` flag
  - [ ] In argument parsing
  - [ ] In main execution logic
- [ ] Confirmed where to populate from plan
  - [ ] Set `args.file`
  - [ ] Set `args['expect-hash']`
  - [ ] Set `args['expect-span']`

### Testing Setup
- [ ] Test fixtures ready (plan JSON files)
- [ ] Test runner working: `npm run test:by-path tests/tools/plans/`

### Documentation Prep
- [ ] Updated: `/docs/AGENT_REFACTORING_PLAYBOOK.md` (already includes plans section)
- [ ] Will create: Example recipes in `tools/dev/js-edit/recipes/`

---

## Pre-Flight Checks (Before Day 1)

### Code Quality
- [ ] Linter passes: `npm run lint` or equivalent
- [ ] Type checker passes (if using TS): `npm run type-check`
- [ ] Existing tests still pass: `npm test`
- [ ] No TypeScript/linting issues in target files

### Environment
- [ ] Node.js version confirmed (target: 18+)
- [ ] npm/yarn versions confirmed
- [ ] SWC parser version checked (used by both tools)
- [ ] All dependencies installed: `npm ci`

### Repository
- [ ] On main branch: `git branch` shows `* main`
- [ ] Latest changes pulled: `git pull` shows "Already up to date"
- [ ] No uncommitted changes: `git status` is clean
- [ ] Ready for feature branch: Will use `feat/gap2-relationship-queries` format

### Communication
- [ ] Team knows timeline (4-5 days)
- [ ] Daily standup scheduled (15 min)
- [ ] Code review process confirmed (who reviews PRs?)
- [ ] Testing requirements clarified (unit + integration + e2e?)

---

## Day 1 Kickoff Agenda (30 minutes)

```
Time | Activity
-----|----------------------------------------------------------
5m   | Confirm everyone reviewed documentation
5m   | Walk through architecture (where changes go)
10m  | Review Phase 1 tasks (Gap 2 - hours 1-2)
5m   | Identify any blockers or questions
5m   | Commit plan to documentation, start implementation
```

---

## Daily Standup Template (15 minutes)

```
Questions to answer each day:
1. What did I complete yesterday? (Specific tasks/hours)
2. What am I working on today? (Next tasks/hours)
3. Are there any blockers? (Technical or logistical)
4. Do I need help? (Pairing, unblocking, etc.)

When to escalate:
- Major architectural questions
- Blockers affecting timeline
- Changes needed to spec
- Testing or integration issues
```

---

## Validation Gates (Between Phases)

### After Phase 1 (Gap 2 Complete)
- [ ] All three relationship queries working
- [ ] CLI tests passing (>90% coverage)
- [ ] Performance within targets (<2 sec per query)
- [ ] Documentation updated with examples
- [ ] Ready for Phase 2? **Go/No-Go decision**

### After Phase 2 (Gap 3 Complete)
- [ ] Dry-run mode working
- [ ] Recovery suggestions functional
- [ ] Batch operation tests passing (>90% coverage)
- [ ] Performance within targets (<1 min for typical batch)
- [ ] Ready for Phase 3? **Go/No-Go decision**

### After Phase 3 (Plans Complete)
- [ ] `--from-plan` flag working
- [ ] Agent workflow end-to-end test passing
- [ ] All integration tests passing
- [ ] Documentation and examples complete
- [ ] **Ready to deploy!**

---

## Success Criteria (All Phases Complete)

### Code
- [ ] All tests passing: `npm test`
- [ ] No linting errors: `npm run lint`
- [ ] Coverage targets met (>80% for new code)
- [ ] Zero TypeScript errors

### Documentation
- [ ] README updated with new flags
- [ ] Examples show all three features
- [ ] Agent playbook examples work
- [ ] Agent team trained

### Performance
- [ ] Gap 2: <2 seconds per relationship query
- [ ] Gap 3: <1 minute for typical batch
- [ ] Plans: <100ms overhead per operation

### Deployment
- [ ] Changes merged to main
- [ ] No regressions in existing tests
- [ ] Backward compatibility verified
- [ ] Ready for production use

---

## Resources

| Resource | Location | Purpose |
|----------|----------|---------|
| Technical Spec | `/docs/TOOLING_GAPS_2_3_PLAN.md` | Reference during coding |
| Implementation Plan | `/docs/IMPLEMENTATION_ROADMAP.md` | Hour-by-hour tasks |
| Agent Playbook | `/docs/AGENT_REFACTORING_PLAYBOOK.md` | Validation examples |
| Existing Code | `tools/dev/js-scan.js` | Study architecture |
| Existing Code | `tools/dev/js-edit.js` | Study architecture |
| Tests | `tests/tools/` | Understand test patterns |

---

## Questions to Resolve Before Starting

If any of these are unclear, resolve before beginning:

1. **Graph Architecture**: How is import/export graph currently built in js-scan?
   - _Answer_: [Document here after investigation]

2. **Relationship Queries**: Which operator to implement first?
   - _Answer_: `--what-imports` (simplest, most useful)

3. **Dry-Run Design**: Should dry-run succeed if NO issues, or only if all changes are valid?
   - _Answer_: Should succeed only if all changes are valid

4. **Recovery System**: Should recalculate-offsets be automatic or manual flag?
   - _Answer_: Manual flag (safer, more explicit)

5. **Plans Format**: Is current plan format (from `--emit-plan`) sufficient, or needs modification?
   - _Answer_: [Check this during Phase 0]

6. **Testing**: What's the minimum coverage target?
   - _Answer_: >80% for new code, no regression in existing

7. **Timeline**: Can this fit in one sprint, or split across two?
   - _Answer_: One sprint (4-5 days, 10-14 hours)

---

## Go/No-Go Decision

**All items checked?** ✓ Ready to proceed  
**Missing items?** ✗ Resolve before starting

**Recommendation**: Once this checklist is complete, proceed to Phase 1 implementation.

---

_Pre-implementation checklist v1.0 — Complete the items above before Day 1._
