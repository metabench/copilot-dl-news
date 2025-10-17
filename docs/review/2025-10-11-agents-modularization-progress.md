# AGENTS.md Modularization Progress

**Date**: October 11, 2025  
**Status**: In Progress - Incremental Extraction  
**Goal**: Reduce AGENTS.md size while maintaining its effectiveness as the primary AI agent guide

---

## Objectives

1. **Preserve Core Functionality**: AGENTS.md must remain the hardcoded entry point for AI agents
2. **Extract Verbose Content**: Move detailed patterns to specialized quick reference guides
3. **Maintain Quick Reference**: Keep essential patterns and rules inline
4. **Clear Delegation**: Add explicit "READ FIRST" pointers to specialized docs

---

## Progress Summary

### Starting State
- **Line Count**: 1,458 lines
- **Structure**: Large inline sections for commands, testing, database patterns
- **Issues**: Too much detail inline, hard to navigate, analysis paralysis risk

### Current State (After Phase 1)
- **Line Count**: 1,359 lines (-99 lines, 7% reduction)
- **Sections Modularized**: 3 major sections
- **New Specialized Docs Created**: 3 quick reference guides

### Completed Extractions

#### 1. Command Execution (✅ Complete)
- **Extracted To**: `docs/COMMAND_EXECUTION_GUIDE.md`
- **Lines Removed**: ~90 lines
- **What Stayed in AGENTS.md**: 
  - Quick summary (15 lines)
  - Critical rules list
  - Pointer to full guide
- **What Moved**:
  - Detailed PowerShell command patterns
  - Background process warnings
  - curl vs Invoke-WebRequest details
  - Decision trees and examples

#### 2. Testing Guidelines (✅ Partial)
- **Extracted To**: `docs/TESTING_QUICK_REFERENCE.md`
- **Lines Removed**: ~30 lines (more to go)
- **What Stayed in AGENTS.md**:
  - Golden rules (5 core rules)
  - Quick patterns (schema bugs, async/await, WAL mode)
  - Pointers to specialized docs
- **What Still Inline** (to be addressed):
  - Async cleanup patterns (lines 630-860, ~230 lines)
  - Test debugging patterns (lines 860-1069, ~209 lines)
  - These are already in `docs/TESTING_ASYNC_CLEANUP_GUIDE.md`

#### 3. Database Handle Patterns (✅ Complete)
- **Extracted To**: `docs/DATABASE_QUICK_REFERENCE.md`
- **Lines Removed**: ~80 lines
- **What Stayed in AGENTS.md**:
  - Quick summary (25 lines)
  - Most common usage patterns
  - Test-specific critical warning
  - Pointer to full guide
- **What Moved**:
  - Detailed usage examples
  - Low-level access patterns
  - Architecture overview
  - Migration notes

---

## Next Steps (Phase 2)

### High-Priority Extractions

1. **Testing Guidelines - Async Cleanup Section** (lines 630-860, ~230 lines)
   - Already documented in `docs/TESTING_ASYNC_CLEANUP_GUIDE.md`
   - Can replace with 10-15 line summary + pointer
   - Estimated reduction: ~215 lines

2. **Testing Guidelines - Debugging Patterns** (lines 860-1069, ~209 lines)
   - Already documented in `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md`
   - Can replace with 10-15 line summary + pointer
   - Estimated reduction: ~194 lines

3. **PowerShell Command Guidelines** (lines 1280-1439, ~159 lines)
   - Duplicates content already in `docs/COMMAND_EXECUTION_GUIDE.md`
   - Can replace with pointer to existing guide
   - Estimated reduction: ~150 lines

### Medium-Priority Consolidations

4. **Build Process Duplication** (2 sections: lines 394-403, 1311-1335)
   - Merge into single section with pointer to detailed build docs
   - Estimated reduction: ~15 lines

5. **Database Schema Evolution** (lines 1611-1707, ~96 lines)
   - Already documented in `docs/PHASE_0_IMPLEMENTATION.md` and others
   - Replace with summary + pointer
   - Estimated reduction: ~80 lines

### Projected Final State

**Target Line Count**: ~700-800 lines (50% reduction from original)

**Retained Content**:
- Documentation strategy and Topic Index (~150 lines)
- Critical command rules (summary) (~20 lines)
- Core workflow rules (~80 lines)
- Project structure essentials (~100 lines)
- Testing golden rules (~50 lines)
- Database quick reference (~30 lines)
- Anti-patterns and common mistakes (~100 lines)
- Architecture documentation index (~100 lines)
- Communication guidelines (~50 lines)

**Extracted to Specialized Docs**:
- Command execution details → `docs/COMMAND_EXECUTION_GUIDE.md`
- Testing patterns and workflows → `docs/TESTING_QUICK_REFERENCE.md`
- Database patterns and WAL mode → `docs/DATABASE_QUICK_REFERENCE.md`
- Async cleanup patterns → Already in `docs/TESTING_ASYNC_CLEANUP_GUIDE.md`

---

## Verification Checklist

Before proceeding with Phase 2:
- [ ] Verify existing quick reference docs are comprehensive
- [ ] Check that AGENTS.md pointers use correct file paths
- [ ] Test that GitHub Copilot instructions file references are current
- [ ] Ensure no critical patterns were lost in extraction
- [ ] Confirm navigation flow works (AGENTS.md → Quick Reference → Full Guide)

---

## Documentation Structure Updates

### New Directory: `docs/review/`
- **Purpose**: Store all review documents, findings, and progress reports
- **Location**: `docs/review/` (created October 11, 2025)
- **Migrated**: Moved all files from `docs/documentation-review/` to `docs/review/`
- **Updated**: AGENTS.md now documents this convention

### Updated Documentation Hierarchy
```
AGENTS.md (Central hub, <800 lines target)
    ↓
docs/COMMAND_EXECUTION_GUIDE.md (Quick references, 150-300 lines each)
docs/TESTING_QUICK_REFERENCE.md
docs/DATABASE_QUICK_REFERENCE.md
    ↓
ARCHITECTURE_*.md (System design, full detail)
    ↓
Feature-specific guides (BACKGROUND_TASKS_*.md, etc.)
    ↓
docs/review/ (Review documents, progress reports)
    ↓
Code comments
```

---

## Lessons Learned

1. **Incremental is Key**: Extract one section at a time, verify, then continue
2. **Preserve Pointers**: Always add "READ FIRST" references so agents know where to go
3. **Keep Golden Rules**: Critical patterns that apply project-wide should stay in AGENTS.md
4. **Quick Reference Pattern**: Summary + pointer works well for detailed content
5. **Avoid Breaking Changes**: AGENTS.md is hardcoded, so changes must be careful

---

## Next Session Plan

1. Continue Phase 2 extractions (async cleanup, debugging patterns)
2. Consolidate duplicate sections (PowerShell, build process)
3. Update GitHub Copilot instructions file with final structure
4. Verify all cross-references are correct
5. Create final summary document when target reached
