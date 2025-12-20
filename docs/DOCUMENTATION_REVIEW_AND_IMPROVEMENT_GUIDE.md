# Documentation Review and Improvement Guide

**Status**: Self-Improving Reference Guide for AI Agents  
**Purpose**: Systematic approach to reviewing and improving project documentation  
**When to Use**: When user requests "documentation review", "improve docs", "audit documentation", or "documentation cleanup"

---

## Overview

This guide provides a structured approach for AI agents to review, audit, and improve project documentation. It ensures documentation remains discoverable, accurate, maintainable, and helpful for both AI agents and human developers.

**CRITICAL: This guide is about DOING documentation review work, not creating reports ABOUT documentation review work.**

**Tooling Documentation Requirement**: Any time you create or modify a tool (scripts, generators, checklists, etc.) to support this review workflow, immediately record how to invoke it, what outputs it produces, and when to run it within this guide so future reviewers can rely on the same tooling without guesswork.

**What This Guide Produces**:
- ✅ Updated AGENTS.md with better index and patterns
- ✅ Fixed cross-references and orphaned docs
- ✅ New/updated documentation files for features
- ✅ Cleaned docs/ directory (archived obsolete content)
- ✅ Single living review document (docs/documentation-review/CURRENT_REVIEW.md) updated with progress
- ❌ NOT: Multiple dated "documentation analysis report" files
- ❌ NOT: Separate findings documents per review cycle
- ❌ NOT: Meta-documentation about the review process

**Review Document Strategy**:
- **Single Source of Truth**: Maintain ONE document at `docs/documentation-review/CURRENT_REVIEW.md`
- **Update in Place**: Each review cycle UPDATES this document, doesn't create a new one
- **Archive Old Versions**: Before starting a new review, archive the previous version to `docs/documentation-review/archive/YYYY-MM-DD-review.md`
- **Working Document**: Use CURRENT_REVIEW.md as a scratchpad during the review, then clean it up at the end

**"Fix-as-you-go" Principle (Autonomous Operation)**: This process is designed for autonomous execution. When an inaccuracy, an outdated statement, or a clear error is found in a document during the review phases (especially Phase 2), **fix it immediately**. Do not stop to ask for confirmation about planned fixes or next steps—execute them in sequence until the review checklist is complete. If the user says "continue" (or anything similar), treat it as an instruction to proceed through the remaining checklist without pausing. Report a summary of fixes only upon completion of the entire task.

**Key Feature**: This is a **self-improving process**. Phase 6 analyzes the review process itself and updates this guide to make future reviews more effective.

**Estimated Time**: 11-18 hours (varies by project size, includes self-improvement phase)  
**Frequency**: Quarterly or when major features added  
**Prerequisites**: Read AGENTS.md Documentation Strategy section first

---

## Phase 1: Discovery & Audit (0.5-1 hour with automation, 2-3 hours manual)

### Objectives
- Create comprehensive inventory of all documentation
- Measure current discoverability and quality
- Identify orphaned, outdated, or broken docs

**Time Scaling** (October 2025 Update): With automation, this phase is **10x faster**. Budget 1-2 minutes per doc with tool, 5-10 minutes per doc manually.

### Tasks

**1.1 Documentation Inventory** ⭐ **Run Tool First**
- [ ] **CRITICAL**: Run `node tools/docs/generate-doc-inventory.js` to capture baseline metrics (JSON + Markdown reports). This script scans every `.md` file, writes detailed per-doc metrics to `docs/documentation-review/<date>-inventory.json`, and produces helper Markdown reports (missing AGENTS references, missing "When to Read" guidance, zero cross-references). **This saves 1-2 hours.**
- [ ] Review tool output files:
  - `2025-10-10-summary.json` - High-level metrics (read this first)
  - `2025-10-10-missing-in-agents.md` - Docs not in Topic Index
  - `2025-10-10-needs-when-to-read.md` - Docs missing usage guidance
  - `2025-10-10-zero-crossrefs.md` - Potentially orphaned docs
- [ ] Only use manual file_search if tool fails or you need custom analysis
- [ ] Record baseline metrics in CURRENT_REVIEW.md

**1.2 Cross-Reference Analysis**
- [ ] Check which docs are referenced in AGENTS.md Topic Index
- [ ] Search for cross-references between docs (grep `docs/`)
- [ ] Identify orphan docs (not referenced anywhere)
- [ ] Find broken references (doc mentioned but doesn't exist)
- [ ] Map reference graph (which docs link to which)

**1.3 Metrics Collection**
For each documentation file, measure:
- [ ] **Discoverability**: Is it in AGENTS.md index? (Yes/No)
- [ ] **"When to Read" metadata**: Does it have usage guidance? (Yes/No)
- [ ] **Cross-references**: How many other docs reference it? (Count)
- [ ] **Focus**: Is it <2000 lines or clearly scoped? (Yes/No)
- [ ] **Timeliness**: Last modified within 3 months? (Yes/No)
- [ ] **Code examples**: Contains executable examples? (Yes/No)
- [ ] **Visual aids**: Has diagrams, tables, or structured data? (Yes/No)

**1.4 Quick Wins Identification**
- [ ] List docs missing from AGENTS.md that should be indexed
- [ ] Identify mega-docs (>2000 lines) that should be split
- [ ] Find investigation docs that should be archived
- [ ] Note docs with confusing or unclear titles

### Deliverables
- **Update CURRENT_REVIEW.md** with:
  - Documentation Inventory Summary (total, by category, metrics)
  - Orphan Docs List (docs not referenced anywhere)
  - Broken References List (mentions of non-existent docs)
  - Quick Wins List (easy improvements with high impact)
- **Tool outputs** (in docs/documentation-review/):
  - `2025-10-10-inventory.json` (detailed metrics, auto-generated)
  - `2025-10-10-summary.json` (high-level stats, auto-generated)
  - Helper reports (auto-generated, can be deleted after review)

---

## Phase 2: Content Review (4-6 hours)

### Objectives
- Assess and improve the quality and accuracy of existing documentation
- Identify and correct outdated or conflicting information
- Verify and fix code examples

### Spot-Check vs. Exhaustive: Decision Matrix (October 2025)

**Use this decision tree to determine review depth:**

```
1. Check inventory tool metrics first:
   └─> Discoverability <70% OR "When to Read" <50%?
       ├─> YES → EXHAUSTIVE REVIEW (all docs need work)
       └─> NO → Continue to step 2

2. When was last comprehensive review?
   └─> >6 months ago OR never?
       ├─> YES → EXHAUSTIVE REVIEW (too much may have changed)
       └─> NO → Continue to step 3

3. What triggered this review?
   ├─> Major refactoring / architecture change → EXHAUSTIVE REVIEW
   ├─> New team members need docs → EXHAUSTIVE REVIEW  
   ├─> Specific bug/confusion from docs → SPOT-CHECK (fix what's broken)
   └─> Routine maintenance → SPOT-CHECK (verify high-priority)

4. Time budget available?
   └─> <4 hours available?
       ├─> YES → SPOT-CHECK (can't finish exhaustive anyway)
       └─> NO → Use judgment (EXHAUSTIVE if issues suspected)
```

**Spot-Check Strategy** (2-4 hours):
- Verify 5-10 high-priority docs:
  - AGENTS.md (central hub)
  - ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md (system design)
  - SERVICE_LAYER_GUIDE.md (implementation patterns)
  - API_ENDPOINT_REFERENCE.md (API contracts)
  - Top 5 most-referenced docs (from inventory tool)
- Fix only critical issues (broken refs, wrong API endpoints, missing classes)
- Update "When to Read" sections if missing
- Skip timeliness, completeness, formatting

**Exhaustive Strategy** (8-20 hours):
- Review ALL docs in each category
- Verify all code examples
- Check all cross-references
- Update all "When to Read" sections
- Fix formatting inconsistencies
- Archive outdated docs
- Check timeliness (update stale content)

**Verification Approach** (both strategies):
- Read claim in documentation
- Use `semantic_search` to find implementation
- Verify class names, method signatures, behavior match
- Fix immediately if mismatch found
- Batch related searches (search for multiple classes at once)
- Use grep_search for exact strings (faster than semantic_search)
- Focus on architectural claims, not implementation details

### Tasks

**2.1 Architecture Documentation Review**

**Scope**: 
- SPOT-CHECK: 3-5 architecture docs (AGENTS.md, ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md, top-referenced)
- EXHAUSTIVE: All architecture docs (ARCHITECTURE_*.md, *_ARCHITECTURE.md)

For each doc in scope:
- [ ] **Verify and Fix Accuracy**: Does it match the current codebase? Cross-reference claims with the actual code. **If an inaccuracy is found, fix it immediately.** Use `grep_search` and `read_file` to verify, and `apply_patch` to correct the documentation.
- [ ] **Search for Deprecated Names**: Look for references to removed/renamed classes or services (for example `CrawlerManager`) and update them to current equivalents.
- [ ] **Completeness** (EXHAUSTIVE only): Are all major components covered? If not, add placeholder sections for what's missing.
- [ ] **Clarity** (EXHAUSTIVE only): Can an AI agent understand the system in <10 min? If not, add summaries or simplify complex language.
- [ ] **Diagrams** (EXHAUSTIVE only): Are there visual representations? If not, and the system is complex, add a note to create a diagram.
- [ ] **Decision rationale** (EXHAUSTIVE only): Why were these choices made? Are trade-offs documented?
- [ ] **Add "When to Read"**: If the section is missing, **add it immediately.** (BOTH strategies)

**2.2 Feature Documentation Review**

**Scope**:
- SPOT-CHECK: API_ENDPOINT_REFERENCE.md + any docs mentioned in current issues/PRs
- EXHAUSTIVE: All feature docs (background tasks, crawls, compression, etc.)

For each doc in scope:
- [ ] **Verify and Fix Implementation Status**: Is the documentation accurate? **Check code existence and logic, and fix any discrepancies.** (BOTH strategies)
- [ ] **Validate Response Contracts**: Compare documented status codes and payload fields against the corresponding route/controller implementations (e.g., `/api/pause`, `/api/stop`).
- [ ] **Verify and Fix Code Examples** (EXHAUSTIVE only): Do they run? **Don't execute examples blindly** - read code to verify patterns exist. Test with `run_in_terminal` only for critical examples.
- [ ] **Verify and Fix API Documentation**: Are endpoints, parameters, and responses documented correctly? Use efficient pattern below. (BOTH strategies)
- [ ] **Testing guidance** (EXHAUSTIVE only): How to test this feature? If missing, add a section.
- [ ] **Common issues** (EXHAUSTIVE only): Known problems or troubleshooting tips? If missing, add them.
- [ ] **Add "When to Read"**: If the section is missing, **add it immediately.** (BOTH strategies)

**Efficient API Verification Pattern** (October 2025):
```bash
# Find all API routes in one search
grep_search query:"router\.(get|post|put|delete)" includePattern:"src/ui/express/routes/*.js" isRegexp:true

# Compare results to API_ENDPOINT_REFERENCE.md
# Fix mismatches immediately
```

**2.3 Investigation Documentation Review**
For each investigation doc (*_INVESTIGATION.md, *_DEBUG.md):
- [ ] **Update Resolution Status**: Was the issue fixed? Add the outcome if it's missing.
- [ ] **Extract and Document Lessons**: What patterns should be avoided? If a key lesson is found, add it to AGENTS.md.
- [ ] **Archive if Appropriate**: If the issue was resolved more than 6 months ago, move the document to the `docs/archive/` directory.
- [ ] **Ongoing relevance**: Is it still useful for future debugging?

**2.4 Planning Documentation Review**
For each planning doc (*_PLAN.md, *_ROADMAP.md, *_IMPLEMENTATION.md):
- [ ] **Update Implementation Status**: Which phases are complete? Update the status markers.
- [ ] **Mark as Obsolete if Abandoned**: If the plan is no longer active, add an "OBSOLETE" marker to the top of the document.
- [ ] **Next steps**: Are the next actions clear?
- [ ] **Archive if Complete**: If fully implemented, summarize key lessons at the top and move the document to `docs/archive/`.

### Deliverables
- **Update CURRENT_REVIEW.md** with:
  - Outdated Information List (specific sections needing major updates that can't be fixed immediately)
  - Code Example Test Results (which examples work, which fail, and which were fixed)
  - Archive Recommendations (docs to move to `docs/archive/`)
  - Accuracy fixes applied during review

---

## Phase 3: Gap Analysis (0.5 hours spot-check, 2-3 hours exhaustive)

### Objectives
- Identify missing documentation
- Prioritize gaps by impact
- Create placeholders or full docs for critical gaps

**Scope Decision**:
- SPOT-CHECK: Only check high-priority gaps (missing "When to Read", broken refs in top docs)
- EXHAUSTIVE: Full gap analysis across all categories

### Tasks

**3.1 Code-to-Doc Mapping**

**Scope**:
- SPOT-CHECK: Check only `src/crawler/`, `src/background/`, `src/ui/express/` main directories
- EXHAUSTIVE: Check all directories including subdirectories

- [ ] List major directories: `src/crawler/`, `src/background/`, `src/ui/`, `src/db/`
- [ ] For each directory, check if documented in architecture docs
- [ ] Identify subdirectories with no corresponding documentation (EXHAUSTIVE only)
- [ ] Note complex modules (>500 lines) without explanation docs (EXHAUSTIVE only)

**3.2 Feature Gap Analysis**

**Scope**:
- SPOT-CHECK: Check only API endpoints and major background tasks
- EXHAUSTIVE: Check all features including scripts, database tables, crawler types

- [ ] Review package.json scripts - are they documented? (EXHAUSTIVE only)
- [ ] Check API endpoints (grep for `router.get`, `router.post`) - documented? (BOTH strategies)
- [ ] Review background task types - each has documentation? (SPOT-CHECK: check existence, EXHAUSTIVE: check completeness)
- [ ] Check crawler types - documented in architecture docs? (SPOT-CHECK: check existence, EXHAUSTIVE: check completeness)
- [ ] List database tables (read schema files) - ERD or schema doc exists? (EXHAUSTIVE only)

**3.3 Common Questions Gap Analysis** (EXHAUSTIVE only)
Review recent work sessions (terminal history, git commits) for:
- [ ] Questions that took >30 min to answer (needed better docs?)
- [ ] "How do I..." questions without clear doc answer
- [ ] Repeated debugging of same issues (missing troubleshooting doc?)
- [ ] Configuration confusion (missing config guide?)
- [ ] Testing confusion (missing test guide?)

**3.4 Pattern Gap Analysis** (EXHAUSTIVE only)
- [ ] Are there repeated code patterns not documented in AGENTS.md?
- [ ] Common bugs or mistakes worth documenting?
- [ ] Performance considerations not captured?
- [ ] Security patterns or considerations missing?

### Deliverables
- **Update CURRENT_REVIEW.md** with:
  - Missing Documentation List (prioritized by impact)
  - Undocumented Features List (features without docs)
  - Common Questions List (questions needing doc answers)
  - Pattern Documentation Needs (patterns to add to AGENTS.md)

---

## Phase 4: Improvements (1 hour spot-check, 3-5 hours exhaustive)

### Objectives
- Fix issues identified in Phases 2-3
- Improve structure and organization
- Add missing content

### Strategy: Fix-As-You-Go (CRITICAL)

**Don't create a backlog of fixes.** Fix issues immediately when found:
- ✅ See missing "When to Read" → Add it now
- ✅ Find broken reference → Fix it now
- ✅ Spot outdated code example → Update it now
- ✅ Notice unclear explanation → Rewrite it now

**Why This Works**:
- Context is fresh (you just read the doc)
- No context-switching overhead
- No "fix later" items pile up
- More efficient overall

**Scope Decision**:
- SPOT-CHECK: Fix only critical issues (wrong APIs, missing classes, broken refs, missing "When to Read")
- EXHAUSTIVE: Fix all issues including formatting, outdated examples, unclear language, completeness

### Tasks

**4.1 Quick Fixes**

**Time**: 
- SPOT-CHECK: 30 min (critical fixes only)
- EXHAUSTIVE: 30-60 min (all quick fixes)

- [ ] Add orphaned docs to AGENTS.md Topic Index (EXHAUSTIVE only)
- [ ] Fix broken cross-references (update paths) (BOTH strategies)
- [ ] Add "When to Read" sections to docs missing them (BOTH strategies)
- [ ] Update status markers (COMPLETE, OBSOLETE, IN PROGRESS) (EXHAUSTIVE only)
- [ ] Standardize doc filenames (consistent naming convention) (EXHAUSTIVE only)

**4.2 AGENTS.md Improvements**

**Time**:
- SPOT-CHECK: 15 min (add missing high-priority docs to Topic Index)
- EXHAUSTIVE: 30-60 min (comprehensive updates)

- [ ] Add newly discovered patterns to Anti-Patterns section (EXHAUSTIVE only)
- [ ] Update Topic Index with any new categories (EXHAUSTIVE only)
- [ ] Add missing docs to Task-to-Doc Mapping table (BOTH - focus on high-priority in spot-check)
- [ ] Review and update "When to Read" guidance (EXHAUSTIVE only)
- [ ] Add common questions to Quick Reference sections (EXHAUSTIVE only)

**4.3 Architecture Doc Updates**

**Time**:
- SPOT-CHECK: 15 min (fix critical inaccuracies found in Phase 2)
- EXHAUSTIVE: 1-2 hours (comprehensive updates)

- [ ] Update outdated architecture docs with current code (BOTH - critical updates only in spot-check)
- [ ] Add missing diagrams (system interactions, data flow) (EXHAUSTIVE only)
- [ ] Document recent architectural decisions (EXHAUSTIVE only)
- [ ] Split mega-docs (>2000 lines) into focused pieces (EXHAUSTIVE only)
- [ ] Ensure consistent structure across all architecture docs (EXHAUSTIVE only)

**4.4 Create Missing High-Priority Docs** (EXHAUSTIVE only, 1-2 hours)
Based on gap analysis, create:
- [ ] **Missing Feature Docs**: Document undocumented features
- [ ] **API Reference**: Consolidated endpoint documentation
- [ ] **Configuration Guide**: All env vars, config files, options
- [ ] **Troubleshooting Guide**: Common issues and solutions
- [ ] **Testing Guide**: How to write and run tests

**4.5 Archive and Cleanup (30 minutes)**
- [ ] Move resolved investigation docs to `docs/archive/`
- [ ] Archive obsolete planning docs
- [ ] Delete duplicate or redundant documentation
- [ ] Update README to reflect current state

### Deliverables
- **Updated AGENTS.md** (improved index, patterns, guidance)
- **Updated Architecture Docs** (accurate, current, complete)
- **New Documentation Files** (missing docs now created)
- **Cleaned docs/ Directory** (archived old, removed redundant)
- **Update CURRENT_REVIEW.md** with summary of all changes made

---

## Phase 5: Validation (1-2 hours)

### Objectives
- Verify improvements achieve intended goals
- Test discoverability with real scenarios
- Get feedback and iterate

### Tasks

**5.1 Discoverability Testing**
Simulate AI agent scenarios:
- [ ] "Fix crawl not showing up" - Can agent find right doc in <2 min?
- [ ] "Add new background task" - Path from AGENTS.md clear?
- [ ] "Debug database issue" - Troubleshooting doc helpful?
- [ ] "Understand architecture" - Central docs comprehensive?
- [ ] Time each scenario, compare to pre-improvement baseline

**5.2 Completeness Validation**
- [ ] Review gap analysis list - all high priority items addressed?
- [ ] Check all architecture docs have "When to Read" sections
- [ ] Verify all features in codebase have corresponding docs
- [ ] Confirm all orphan docs now indexed or archived
- [ ] Validate cross-references all point to existing docs

**5.3 Metrics Re-Collection**
Re-measure Phase 1 metrics to show improvement:
- [ ] Discoverability rate: % docs in AGENTS.md index
- [ ] "When to Read" coverage: % docs with usage guidance
- [ ] Cross-reference density: avg references per doc
- [ ] Focus score: % docs <2000 lines or well-scoped
- [ ] Timeliness: % docs updated in last 3 months
- [ ] Completeness: % features with documentation

**5.4 Documentation Quality Report**
Create summary report:
- [ ] Before/after metrics comparison
- [ ] Time savings estimate (discovery time reduction)
- [ ] Documentation inventory (total, by category)
- [ ] Remaining gaps (lower priority items)
- [ ] Maintenance recommendations (ongoing practices)

### Deliverables
- **Update CURRENT_REVIEW.md** with:
  - Validation Test Results (scenario timing, success rate)
  - Metrics Comparison Report (before vs after in table format)
  - Summary of Improvements (what was fixed, what was created)
  - Maintenance Recommendations (keep docs current)
- **Metrics files** (auto-generated JSON, can be compared across reviews)

---

## Phase 6: Process Self-Improvement (30-60 minutes)

### Objectives
- Reflect on documentation review process effectiveness
- Identify bottlenecks and inefficiencies in the review workflow
- Capture lessons learned for next review cycle
- Update this guide to incorporate improvements
- Archive completed review document

### Tasks

**FIRST: Archive Previous Review**
- [ ] Move `docs/documentation-review/CURRENT_REVIEW.md` to `docs/documentation-review/archive/YYYY-MM-DD-review.md`
- [ ] Create fresh `CURRENT_REVIEW.md` template for next review
- [ ] Clean up auto-generated helper reports (inventory JSON files can stay for comparison)

**6.1 Process Effectiveness Review**
Reflect on what worked well and what didn't:
- [ ] **Time accuracy**: Did phases take expected time? Which phases took longer/shorter?
- [ ] **Task clarity**: Were checklist items clear and actionable? Any confusion?
- [ ] **Tool effectiveness**: Were grep_search, file_search, read_file sufficient? Missing tools?
- [ ] **Deliverable usefulness**: Which deliverables were most valuable? Any redundant?
- [ ] **Bottlenecks identified**: What slowed down the process? Where did you get stuck?

**6.2 Metric Evaluation**
Assess whether success metrics captured the right things:
- [ ] **Missing metrics**: What should we measure that we didn't?
- [ ] **Redundant metrics**: Any metrics that didn't provide useful signal?
- [ ] **Threshold accuracy**: Were target thresholds (90%, 80%, etc.) appropriate?
- [ ] **Measurement difficulty**: Were any metrics hard to collect? Simplifications possible?

**6.3 Workflow Analysis**
Identify improvements to the 5-phase workflow:
- [ ] **Phase order**: Should phases be reordered or parallelized?
- [ ] **Phase granularity**: Should any phase be split or combined?
- [ ] **Quick wins timing**: Should Phase 1 quick wins be implemented immediately vs waiting for Phase 4?
- [ ] **Iterative vs batch**: Should process be more iterative (fix-as-you-go) or batch (fix-at-end)?
- [ ] **Automation opportunities**: What manual tasks could be automated?

**6.4 Template and Standard Improvements**
Evaluate documentation templates and standards:
- [ ] **Template completeness**: Does documentation template cover all needed sections?
- [ ] **"When to Read" effectiveness**: Is template clear enough? Examples needed?
- [ ] **Status markers**: Are current markers (COMPLETE, OBSOLETE, etc.) sufficient?
- [ ] **File naming**: Are naming conventions clear and followed?
- [ ] **Anti-patterns**: Did you discover new anti-patterns to document?

**6.5 Capture Specific Improvements**
Document concrete changes to make this guide better:
- [ ] **Add missing checklist items**: Note tasks you performed that aren't in checklists
- [ ] **Remove redundant items**: Note checklist items you skipped as unnecessary
- [ ] **Clarify ambiguous instructions**: Note items that were confusing or unclear
- [ ] **Add examples**: Note where examples would have helped
- [ ] **Update time estimates**: Adjust phase time estimates based on actual duration

**6.6 Update This Guide**
Make the identified improvements to this document:
- [ ] Add new checklist items discovered during review
- [ ] Remove or clarify ambiguous or redundant items
- [ ] Update time estimates for phases based on actual experience
- [ ] Add examples where they would help
- [ ] Update success metrics if better measures identified
- [ ] Document new anti-patterns discovered
- [ ] Add automation suggestions if opportunities found
- [ ] Update documentation inventory tooling (`tools/docs/generate-doc-inventory.js`) when new metrics or report formats are needed **and revise the instructions in this guide accordingly (command, arguments, output paths, and interpretation)**
- [ ] For every new tool introduced during the review, add a usage subsection to this guide that explains setup, invocation, expected outputs, and maintenance duties

### Deliverables
- **Update CURRENT_REVIEW.md** with:
  - Process Improvement Notes (what worked, what didn't, specific recommendations)
  - Lessons Learned (key takeaways for next review)
  - Time tracking (actual vs estimated for each phase)
- **Updated DOCUMENTATION_REVIEW_AND_IMPROVEMENT_GUIDE.md** (this file, improved based on experience)
- **Archive CURRENT_REVIEW.md**: Move to `docs/documentation-review/archive/YYYY-MM-DD-review.md` when complete

### Self-Improvement Questions

Answer these questions after each documentation review cycle:

1. **Efficiency**: How could this review have been completed faster without sacrificing quality?
2. **Effectiveness**: What documentation improvements had the biggest impact? Focus more on those?
3. **Blind spots**: What issues did you miss that became apparent later?
4. **Tool gaps**: What tools or capabilities would have made this easier?
5. **Pattern recognition**: Did you notice repeated issues that suggest systemic problems?
6. **Scalability**: As project grows, will this process scale? What will break first?
7. **Automation**: What parts of this process could be automated or semi-automated?

### Example Improvements (Learn from Each Cycle)

**Example 1: Time Estimates Were Off**
```markdown
# Before
## Phase 1: Discovery & Audit (2-3 hours)

# After (based on experience)
## Phase 1: Discovery & Audit (1.5-2.5 hours for small projects, 3-4 hours for large)
Note: Time scales with number of docs. Budget 5-10 min per doc for metrics collection.
```

**Example 2: Missing Checklist Item**
```markdown
# Discovered during review: Always check package.json for undocumented scripts

# Add to Phase 3.2 Feature Gap Analysis:
- [ ] Review package.json scripts - are they documented in README or RUNBOOK?
```

**Example 3: Tool Gap Identified**
```markdown
# Discovered: No easy way to find all TODO/FIXME comments in documentation

# Add to Phase 3.1 Code-to-Doc Mapping:
- [ ] Search for TODO/FIXME in docs: grep_search "TODO|FIXME" (isRegexp: true)
- [ ] Prioritize addressing documented TODOs before adding new docs
```

**Example 4: Metric Was Not Useful**
```markdown
# Before
- Cross-reference density: avg references per doc (found this didn't correlate with quality)

# After (remove or replace with better metric)
- Cross-reference completeness: % of mentioned docs that have live links
```

### Continuous Improvement Cycle

This Phase 6 makes documentation review a **self-improving process**:

```
Review Cycle 1 → Phase 6 improvements → Updated guide
                                              ↓
Review Cycle 2 → Phase 6 improvements → Updated guide (now better)
                                              ↓
Review Cycle 3 → Phase 6 improvements → Updated guide (even better)
                                              ↓
                            ... and so on ...
```

**Key Principle**: Each review cycle should make the NEXT review cycle faster, easier, and more effective.

---

## Lessons Learned from October 2025 Review

### What Worked Exceptionally Well

1. **Automated Inventory Tool** ⭐⭐⭐
   - Reduced Phase 1 from 2-3 hours to 15 minutes (10x speedup)
   - Generated objective baseline metrics in <1 minute
   - Produced actionable reports (missing "When to Read", orphaned docs)
   - **Action**: Keep and enhance this tool before every review

2. **Spot-Checking Architecture** ⭐⭐⭐
   - Verified 3-5 critical docs instead of all 91 docs
   - Found zero inaccuracies (high baseline quality)
   - Used semantic_search + grep_search efficiently
   - **Action**: Document spot-checking strategy (added above in Phase 2)

3. **Fix-As-You-Go Principle** ⭐⭐⭐
   - Added all 18 "When to Read" sections immediately during review
   - No "fix later" backlog created
   - More efficient than creating action items
   - **Action**: Continue this approach for all future reviews

4. **Single Living Document** ⭐⭐⭐
   - CURRENT_REVIEW.md prevents report accumulation
   - Archive old versions to keep docs/ clean
   - Working document + final summary in one file
   - **Action**: Enforce this pattern (now documented above)

### What Could Be Improved

1. **API Verification Process**
   - Manually checking each endpoint in API_ENDPOINT_REFERENCE.md was slow
   - **Solution**: Use single grep_search to find all router.get/post/put/delete at once
   - **Action**: Added efficient pattern to Phase 2.2 above

2. **Code Example Verification**
   - Considered running examples but realized most are conceptual
   - **Solution**: Read code to verify patterns exist, don't execute blindly
   - **Action**: Updated Phase 2.2 with this guidance

3. **Phase Time Estimates**
   - Guide estimated 11-18 hours, actual was 2.25 hours
   - **Reason**: Automation + high baseline quality
   - **Solution**: Add conditional time estimates (with/without automation, high/low baseline)
   - **Action**: Updated all phase headers with realistic ranges

### Automation Opportunities

1. **Accuracy Checking Tool** (Future - High Priority)
   ```javascript
   // Proposed: tools/docs/verify-accuracy.js
   // - Extract class names from docs
   // - Search codebase for those classes
   // - Report missing classes or mismatched signatures
   // - Estimate effort: 2-3 hours to build
   ```

2. **Cross-Reference Validator** (Future - Medium Priority)
   ```javascript
   // Add to generate-doc-inventory.js
   // - Parse all [text](path) links in docs
   // - Check if target files exist
   // - Report broken links
   // - Estimate effort: 1 hour to add
   ```

3. **"When to Read" Linter** (Future - Low Priority)
   ```javascript
   // Pre-commit hook or CI check
   // - Ensure all new .md files have "When to Read" section
   // - Estimate effort: 30 minutes
   ```

### Key Insights from October 10, 2025 Review

1. **High baseline quality compounds**
   - Well-maintained docs make reviews 5-10x faster
   - Accuracy verification found zero issues initially, but deep checking revealed 6 subtle API documentation errors
   - Investment in doc quality pays exponential dividends

2. **API Documentation Needs Code Verification**
   - Response payloads, status codes, and error responses MUST be verified against actual route implementation
   - Don't assume API docs are correct - always check the source code
   - Small mismatches (missing field, wrong status code) mislead API consumers significantly

3. **Automation is non-negotiable**
   - Manual inventory would have taken 2-3 hours
   - Automated inventory took <1 minute
   - ROI: 120x time savings

4. **Spot-checking beats exhaustive checking**
   - Verifying 5 high-priority docs found same issues as checking all 92 would have
   - Focus on architectural claims, API contracts, and deprecated class references
   - Use judgment: if baseline is high, spot-checking is sufficient

5. **Single document pattern works**
   - CURRENT_REVIEW.md is clear working document
   - Archive on completion keeps history without clutter
   - Much better than creating dated reports each review

6. **Deprecated class references persist**
   - References to non-existent classes (like `CrawlerManager`) can exist in multiple docs
   - Always search for deprecated names explicitly during Phase 2
   - Cross-check class/service names against actual source code

### Recommendations for Next Review

1. **Before Starting**:
   - [ ] Build accuracy checking tool if time permits (2-3 hour investment)
   - [ ] Add cross-reference validation to inventory tool (1 hour)
   - [ ] Review this "Lessons Learned" section first

2. **During Review**:
   - [ ] Run inventory tool first (saves 2+ hours)
   - [ ] Spot-check 5-10 high-priority docs, not all docs
   - [ ] Use batch searches (grep all API routes at once)
   - [ ] **CRITICAL**: Verify API documentation against route implementations (don't skip this!)
   - [ ] Search for deprecated class names explicitly (e.g., grep for common old names)
   - [ ] Fix issues immediately (fix-as-you-go)
   - [ ] Update CURRENT_REVIEW.md throughout, not at end

3. **After Review**:
   - [ ] Update this section with new learnings
   - [ ] Archive CURRENT_REVIEW.md to dated file (if creating new cycle)
   - [ ] Create fresh CURRENT_REVIEW.md for next cycle (if needed)

### Time Estimates Revised (October 2025)

| Scenario | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 6 | Total |
|----------|---------|---------|---------|---------|---------|---------|-------|
| **High baseline + automation** | 0.25h | 0.5h | 0.25h | 0.75h | 0.25h | 0.25h | **2-3h** |
| **High baseline, no automation** | 2h | 2h | 1h | 2h | 0.5h | 0.5h | **8h** |
| **Low baseline + automation** | 1h | 4h | 2h | 4h | 1h | 0.5h | **12-13h** |
| **Low baseline, no automation** | 3h | 6h | 3h | 6h | 2h | 1h | **21h** |

**Baseline Quality Indicators**:
- **High**: >90% discoverability, >80% "When to Read", recent updates, few gaps
- **Low**: <70% discoverability, <50% "When to Read", outdated content, many gaps

### When to Skip Phase 6

Phase 6 can be skipped if:
- This is your first time using the guide (not enough experience to improve it yet)
- No significant issues or insights emerged during review
- Time constraints are severe (but try to at least note improvements for later)

However, **always perform Phase 6 after your 2nd or 3rd review** to capture accumulated learnings.

---

## Success Metrics

Track these metrics before and after review:

| Metric | Target | Measurement Method | Priority |
|--------|--------|-------------------|----------|
| **"When to Read" Coverage** | 100% | Count docs with metadata / total docs | ⭐ HIGHEST |
| **Discoverability** | >90% docs in index | Count docs in AGENTS.md / total docs | HIGH |
| **Architecture Accuracy** | 100% | Spot-check claims vs code | HIGH |
| **Broken References** | 0 | Check cross-refs exist | MEDIUM |
| **Orphaned Docs** | 0 | Find unreferenced docs | MEDIUM |
| **Focus** | >80% docs <2000 lines | Count focused docs / total docs | LOW |
| **Timeliness** | >70% updated recently | Count docs modified <3mo / total docs | LOW |
| **Completeness** | >95% features documented | Count documented features / total features | MEDIUM |

**Priority Guidance** (October 2025):
- **Must achieve**: "When to Read" coverage, Architecture accuracy
- **Should achieve**: Discoverability, Zero broken refs, Zero orphans
- **Nice to have**: Focus, Timeliness, Completeness

**Reality Check**: If baseline quality is already high, you may hit all targets in 2-3 hours. If baseline is poor, budget full 11-18 hours.

---

## Priority Guidance

When time is limited, prioritize in this order:

1. **Critical (Must Do)**:
   - Add orphaned docs to AGENTS.md index
   - Fix broken cross-references
   - Update status markers (OBSOLETE, COMPLETE)
   - Add "When to Read" to architecture docs

2. **High Priority (Should Do)**:
   - Create missing feature documentation
   - Update outdated architecture docs
   - Archive resolved investigation docs
   - Document common troubleshooting patterns

3. **Medium Priority (Nice to Have)**:
   - Split mega-docs into focused pieces
   - Create consolidated API reference
   - Add more diagrams and visual aids
   - Improve code example coverage

4. **Low Priority (Future)**:
   - Create configuration guide
   - Add video tutorials or screencasts
   - Build interactive documentation
   - Translate docs to other languages

---

## Phase 6 Integration with Other Phases

**CRITICAL**: Phase 6 (Process Self-Improvement) should influence future reviews:

- **During Phase 1**: Note which metrics were hard to collect → simplify in Phase 6
- **During Phase 2**: Note which docs were most helpful → create more like them (Phase 6)
- **During Phase 3**: Note common gap patterns → add checklist items (Phase 6)
- **During Phase 4**: Note which fixes had biggest impact → prioritize in future (Phase 6)
- **During Phase 5**: Note which scenarios revealed issues → add to standard tests (Phase 6)

Keep a running list of improvements throughout Phases 1-5, then batch-update the guide in Phase 6.

---

## Ongoing Maintenance

After completing review (including Phase 6), establish these practices:

**Documentation Update Rules** (add to AGENTS.md if not present):

1. **When Adding Features**:
   - Create feature doc OR update existing architecture doc
   - Add to AGENTS.md Topic Index
   - Include "When to Read" metadata
   - Add code examples with tests

2. **When Fixing Bugs**:
   - If debugging took >1 hour, document in troubleshooting guide
   - If architectural issue, update architecture docs
   - Add anti-pattern to AGENTS.md if applicable

3. **When Refactoring**:
   - Update affected architecture docs
   - Update code examples if patterns changed
   - Add migration guide if breaking changes

4. **Quarterly Reviews**:
   - Re-run Phase 1 metrics collection
   - Archive resolved investigation docs (>3 months old)
   - Update "When to Read" guidance based on usage patterns
   - Identify and fill new documentation gaps

---

## Templates and Standards

### Documentation File Template

```markdown
# [Feature/Component Name]

**Status**: [COMPLETE | IN PROGRESS | OBSOLETE | ARCHIVED]  
**Last Updated**: [Date]  
**When to Read**: [2-3 sentences about when this doc is relevant]

## Overview

[1-2 paragraphs explaining what this is and why it exists]

## Quick Start

[Minimal example showing most common use case]

## Architecture

[System design, components, interactions]

## Usage Examples

[More detailed examples covering common scenarios]

## API Reference

[If applicable: endpoints, parameters, responses]

## Testing

[How to test this feature/component]

## Troubleshooting

[Common issues and solutions]

## Related Documentation

- [Link to related doc 1]
- [Link to related doc 2]
```

### "When to Read" Template

Choose appropriate scenario(s):

```markdown
**When to Read**: 
- You're implementing [feature X]
- You're debugging [problem Y]
- You need to understand [concept Z]
- You're modifying [component W]
```

### Status Markers

Use consistent status markers at top of each doc:

- **COMPLETE**: Feature implemented, documentation current
- **IN PROGRESS**: Feature/docs actively being developed
- **OBSOLETE**: Superseded by newer approach, kept for reference
- **ARCHIVED**: Historical record, no longer relevant
- **DRAFT**: Initial documentation, needs review

---

## Anti-Patterns to Avoid

**❌ Don't:**
- Create mega-docs (>2000 lines) without clear sections
- Leave orphaned docs (not referenced from anywhere)
- Document every single function (focus on architecture)
- Copy-paste code without context
- Create docs without "When to Read" guidance
- Archive docs that are still relevant
- Document implementation details that change frequently

**✅ Do:**
- Create focused, single-purpose docs
- Link docs from AGENTS.md Topic Index
- Document architectural patterns and decisions
- Include working code examples with explanations
- Add clear usage guidance
- Archive only truly obsolete content
- Document stable interfaces and contracts

---

## Real-World Example

**Scenario**: Geography crawl not showing up in UI

**Before Improvements**:
- Time to find relevant docs: 30-40 minutes
- Agent read 8 files before finding answer
- No clear path from symptom to solution
- Architectural distinction unclear

**After Improvements**:
- Time to find relevant docs: 5 minutes
- Agent uses AGENTS.md Task-to-Doc Mapping table
- Finds ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md immediately
- Clear explanation of two systems and when to use each

**Improvement**: 6x faster, more confident solution.

---

## Questions This Guide Answers

1. ✅ "How do I review project documentation systematically?"
2. ✅ "What metrics should I track for documentation quality?"
3. ✅ "How do I identify orphaned or outdated docs?"
4. ✅ "What documentation is missing from my project?"
5. ✅ "How do I improve discoverability of existing docs?"
6. ✅ "How much time should documentation review take?"
7. ✅ "What are the priorities when time is limited?"
8. ✅ "How do I maintain documentation long-term?"
9. ✅ "What format should my documentation follow?"
10. ✅ "How do I measure documentation improvement?"

---

## Conclusion

This guide provides a comprehensive, systematic, **self-improving** approach to documentation review and improvement. Follow the phases in order, prioritize based on time available, and **always complete Phase 6** to make the next review cycle better.

**Key Takeaway**: Good documentation saves 6x time on common tasks. Investing 11-18 hours in review pays back quickly through faster development and debugging.

**Key Innovation**: Phase 6 (Process Self-Improvement) ensures this guide gets better with each use, making future reviews faster and more effective.

**Next Steps After Review**:
1. **Complete Phase 6** - Update this guide based on experience (CRITICAL)
2. Update AGENTS.md with any new patterns discovered
3. Share improvements with team (if applicable)
4. Schedule next quarterly review
5. Monitor metrics to track ongoing quality
6. Compare time/effort across review cycles (should decrease over time)

**Success Indicator**: Each documentation review cycle should be **faster** and **more effective** than the previous one, thanks to continuous process improvements captured in Phase 6.
