---
status: strategic-assessment
date: 2025-11-13
owner: singularity-engineer
relates-to: AGENTS.md, INDEX.md, agent_policy.md
---

# Workflow Documentation & Agent Awareness Strategy

## Executive Summary

Your documentation ecosystem has **strong foundations** (INDEX.md, AGENTS.md, specialized guides) but suffers from **fragmentation, discovery gaps, and agent unawareness**. This document provides a prioritized roadmap to improve workflow documentation and ensure agents are aware of, maintain, and contribute to it.

**Key Findings:**
- ✅ Excellent specialized docs (CLI_TOOL_TESTING_GUIDE, DATABASE_QUICK_REFERENCE, etc.)
- ❌ 182 docs in /docs/ without clear categorization or discovery mechanism
- ❌ No agent-facing workflow discovery system (where do agents learn *new* workflows?)
- ❌ New workflows created ad-hoc, scattered across root and /docs
- ❌ Limited feedback loop: agents can't easily *contribute* back to workflows
- ❌ Document lifecycle unclear (when to archive, consolidate, or promote?)

---

## Problem Analysis

### 1. Documentation Fragmentation

**Current State**: 182 documents across multiple locations
```
Root (loose):
  - AGENTS.md (hub)
  - (Legacy planning/report docs formerly stored here were relocated to `docs/` on 2025-11-16 — see `docs/AGENT_TOOLING_ENHANCEMENTS_PROPOSAL.md` plus the `docs/root-migration/` folder for archival copies such as TOOLING_ENHANCEMENTS_SUMMARY.md, SESSION_SUMMARY_2025-11-13.md, and CLI_REFACTORING_TASKS.md.)

/docs/ (categorized):
  - /agents/ (11 agent guides)
  - /workflows/ (2 workflow playbooks)
  - /standards/ (4 standard docs)
  - /reference/ (7 reference docs)
  - /how_tos/ (2 how-to guides)
  - /checklists/ (3 checklists)
  - + 140+ uncategorized documents

/docs/ai-native-cli/ (emerging subsystem)
  - Specialized tooling documentation (new)
```

**Impact**: Agents don't know what workflows exist or where to find them. Discovery = trial and error.

### 2. No Workflow Discovery System

**Current State**: 
- INDEX.md is static (last updated 2025-11-04)
- Workflows scattered: some in /docs/workflows/, others in /docs/agents/, many in root
- New workflows created in session docs, never promoted to canonical form
- No "workflow catalog" showing what's available

**Real Problem**: 
When an agent needs to do a task, it reads AGENTS.md → checks INDEX.md → reads 2-3 docs. But what about workflows that *do exist* but aren't linked from INDEX.md? They're invisible.

### 3. Limited Agent Contribution Loop

**Current State**:
- Agents read docs (✅)
- Agents improve docs (via PR/edits) (✅)
- Agents *create new workflows* (❌ unclear where/how)
- Agents *promote session findings to canonical docs* (❌ manual, ad-hoc)
- Agents *notify other agents of new workflows* (❌ no mechanism)

**Result**: Agents learn patterns locally but don't systematically share them.

### 4. Document Lifecycle Unclear

**Examples of Unresolved Questions**:
- When does a `CHANGE_PLAN_*.md` become a canonical workflow?
- When should `SESSION_SUMMARY_*.md` be archived vs. kept as reference?
- When should detailed discovery docs (ARCHITECTURE_*.md) be consolidated?
- How do you deprecate a workflow without breaking agent muscle-memory?

---

## Recent Work Summary (November 2025)

### Phase 1: Tooling Assessment ✅
- **[AGENT_TOOLING_ENHANCEMENTS_PROPOSAL.md](./AGENT_TOOLING_ENHANCEMENTS_PROPOSAL.md)** (550 lines)
  - Strategic roadmap for js-scan/js-edit improvements
  - 10 feature proposals with effort estimates
  - Priority matrix + Phase plan

- **AGENT_CODE_EDITING_PATTERNS.md** (350 lines)
  - 6 copy-paste workflows for code edits
  - Selector patterns + safety guidelines
  - Ready for immediate agent use

- **TOOLING_ENHANCEMENTS_SUMMARY.md** (now at `docs/root-migration/TOOLING_ENHANCEMENTS_SUMMARY.md`)
  - High-level overview + next steps

**Gap**: These live under `docs/` now, but still are not indexed in `docs/INDEX.md` or linked from AGENTS.md

### Phase 2: Test Runner Documentation ✅
- **CLI_TOOL_TESTING_GUIDE.md** (300 lines)
  - Test runners for js-scan, js-edit, md-scan, md-edit
  - Anti-patterns vs. best practices
  - Troubleshooting guide

- **BILINGUAL_AGENT_TEST_GUIDELINES.md** (200 lines)
  - Agent-specific validation patterns

**Gap**: CLI_TOOL_TESTING_GUIDE.md is in /docs but not prominently linked. Agents must stumble on it.

### Phase 3: AGENTS.md Updates ✅
- Added test runner requirement
- Updated batch operations examples
- Improved token passing patterns
- Added continuation token examples

**Gap**: Updates are there, but discovery mechanism still weak. Agents who read stale docs won't know about updates.

### What's Missing:
- **Workflow Registry**: Where to find all workflows (canonical + new)
- **Agent Onboarding**: How agents should start a session (discovery path)
- **Contribution Process**: How agents create/improve/promote workflows
- **Document Lifecycle Policy**: Rules for archival, consolidation, versioning
- **Discoverability**: How new workflows bubble up to awareness

---

## Strategic Improvements (Prioritized)

### Tier 1: Foundation (This Week) — 4-6 hours

#### 1.1 Create `/docs/workflows/WORKFLOW_REGISTRY.md` 
**Purpose**: Canonical index of all active workflows

**Content**:
```markdown
# Workflow Registry

## Active Workflows (Canonical)

| Name | Purpose | Last Updated | Status | Read Time |
|------|---------|--------------|--------|-----------|
| [Code Editing Patterns](../AGENT_CODE_EDITING_PATTERNS.md) | Copy-paste patterns for common code changes | 2025-11-13 | Active | 15 min |
| [Planning & Review Loop](planning_review_loop.md) | Standard plan-implement-verify cycle | 2025-10-15 | Active | 10 min |
| [Doc Extraction Playbook](doc_extraction_playbook.md) | Extracting decisions into docs | 2025-09-20 | Active | 8 min |
| [CLI Tool Testing Guide](../docs/CLI_TOOL_TESTING_GUIDE.md) | Using test runners for js-scan, js-edit | 2025-11-08 | Active | 12 min |
| [Database Adapter Modularization](db_adapter_modularization.md) | How to restructure db/ adapters | 2025-08-30 | Active | 20 min |
| ... |

## Emerging Workflows (Session-Based)
- Code pattern discovery (`docs/root-migration/SESSION_SUMMARY_2025-11-13.md`)
- Dependency graph analysis (`docs/root-migration/TOOLING_ENHANCEMENTS_SUMMARY.md` + [AGENT_TOOLING_ENHANCEMENTS_PROPOSAL.md](./AGENT_TOOLING_ENHANCEMENTS_PROPOSAL.md))

## Retired Workflows (Archive)
- Old crawl patterns (deprecated 2025-09-01) → see CRAWL_REFACTORING_TASKS.md

## Quick Navigation
- By phase: see AGENTS.md "The improvement loop"
- By role: see docs/agents/ directory
- By topic: see docs/INDEX.md
```

**Benefit**: 
- Agents see all workflows at a glance
- New workflows can be added with one-line entry
- Clear status (active/emerging/retired)
- Centralized discovery

**Effort**: 1-2 hours (audit existing docs, create table, test links)

---

#### 1.2 Update `/docs/INDEX.md` with Agent Entry Point
**Current**: Lists all docs (static, 20 entries)

**Proposed**: Add agent-specific discovery at top
```markdown
# Project Documentation Index

## 🚀 Agent Quick Start (Start Here!)

1. **First Time?** Read [Agent Policy](agents/agent_policy.md) (5 min)
2. **Know Your Task?** Check [Workflow Registry](workflows/WORKFLOW_REGISTRY.md) (3 min)
3. **Need Specific Help?** Use categories below
4. **Contributing?** See [Workflow Contribution Guide](#workflow-contribution-guide) (10 min)

---

## Workflow Registry (All Active Workflows)
See [workflows/WORKFLOW_REGISTRY.md](workflows/WORKFLOW_REGISTRY.md) for complete list

## Categories
- Agents (11 agent-specific guides)
- Workflows (2 canonical playbooks + registry)
- ... [rest of current index]
```

**Benefit**:
- New agents know exactly where to start
- Clear path: Policy → Registry → Specific docs
- Self-serve discovery

**Effort**: 30 minutes (restructure INDEX.md, add pointers)

---

#### 1.3 Add `/docs/workflows/WORKFLOW_CONTRIBUTION_GUIDE.md`
**Purpose**: How agents create and promote workflows

**Content**:
```markdown
# How to Create & Contribute Workflows

## When to Document a Workflow

You've found a pattern worth reusing if:
- [ ] You repeated the same steps 2+ times
- [ ] Other agents would benefit from it
- [ ] It's a multi-step process (not a one-liner)
- [ ] It crosses module/domain boundaries

## Process: Create → Test → Promote → Register

### Phase 1: Create (Local Documentation)
1. During work, document steps in `SESSION_SUMMARY_<date>.md`
   ```markdown
   ## Workflow Discovery: Extract Helper Function
   1. Use js-scan --locate to find references
   2. Create new file in /src/utils
   3. Update imports in 3 places
   4. Run tests to verify
   ```

2. Test the workflow on your next similar task
   - Does it work? Does it make sense?
   - Refine the steps based on real use

### Phase 2: Promote (Create Canonical Form)
When the workflow is proven (used 2-3 times):

1. Create `/docs/workflows/extract-<SUBJECT>-workflow.md`
   ```markdown
   ---
   status: active
   created: 2025-11-13
   last-tested: 2025-11-13
   author: [your-role]
   related-to: AGENTS.md, other-doc.md
   ---
   
   # Extract Helper Function Workflow
   
   ## When to Use
   - Moving logic from one file to a reusable utility
   - Reducing duplication across modules
   
   ## Prerequisites
   - [other workflow] completed
   - Understanding of module boundaries
   
   ## Steps
   1. Scan for all uses: `node js-scan.js --search functionName`
   2. Create new file: `/src/utils/new-helper.js`
   3. Update 3 imports using batch edit
   4. Run: `npm run test:by-path tests/...`
   
   ## Validation Checklist
   - [ ] All tests pass
   - [ ] No unused imports left
   - [ ] JSDoc added to new function
   
   ## Common Pitfalls
   - Forgetting to update /src/index.js exports
   ```

2. Test on a new task (validation pass)

3. Add to [Workflow Registry](WORKFLOW_REGISTRY.md)
   ```markdown
   | [Extract Helper Function](extract-helper-workflow.md) | Moving logic to reusable utility | 2025-11-13 | Active | 8 min |
   ```

4. Link from AGENTS.md if it's core
   ```markdown
   ## Key Workflows
   - [Planning & Review](docs/workflows/planning_review_loop.md)
   - [Extract Helper](docs/workflows/extract-helper-workflow.md)
   - [Code Editing Patterns](docs/AGENT_CODE_EDITING_PATTERNS.md)
   ```

### Phase 3: Maintain
- Update workflow if you discover improvements
- Add to [Workflow Registry](WORKFLOW_REGISTRY.md) as "Last Updated"
- Archive if it becomes outdated (link to replacement)

## Example: Complete Workflow Creation

**Step 1: Session discovery**
```
SESSION_SUMMARY_2025-11-14.md
## New Workflow: Batch Rename Variables
Discovered when refactoring modules. Pattern:
1. Use js-scan --search oldName
2. Create changes.json with { file, line, oldString, newString }
3. Apply with js-edit --batch-mode
4. Run tests
Tested on 2 refactoring tasks. Works well!
```

**Step 2: Promote to canonical**
```
/docs/workflows/batch-rename-variables-workflow.md
(see template above)
```

**Step 3: Register**
```
WORKFLOW_REGISTRY.md: Add row
"Batch Rename Variables | Rename across multiple files | 2025-11-14 | Active | 6 min"
```

**Step 4: Link from AGENTS.md**
```
## CLI Tooling & Agent Workflows
See Workflow Registry. Key example: [Batch Rename Variables](docs/workflows/batch-rename-variables-workflow.md)
```

Result: ✅ Workflow discovered, documented, tested, registered, and linked. Other agents find it automatically.
```

**Benefit**:
- Clear entry point for workflow creation
- Process ensures workflows are tested before promoted
- Agents know when to create vs. improve
- Reduces duplicated effort

**Effort**: 1.5-2 hours (write guide + examples + validation checklist)

---

### Tier 2: Integration (Next 2 Weeks) — 2-3 hours

#### 2.1 Consolidate Tooling Docs
**Current**: 
- AGENT_TOOLING_ENHANCEMENTS_PROPOSAL.md (`docs/` root)
- AGENT_CODE_EDITING_PATTERNS.md (`docs/` root)
- TOOLING_ENHANCEMENTS_SUMMARY.md (`docs/root-migration/`)
- CLI_TOOL_TESTING_GUIDE.md (`/docs`)

**Action**: Move to `/docs/reference/cli-tools-for-agents.md`
```markdown
# CLI Tools for Agents (Complete Reference)

## Quick Start
- [Code Editing Patterns](#code-editing-patterns) ← Copy-paste workflows
- [Testing Guide](#testing-guide) ← Test runners
- [Enhancements Roadmap](#roadmap) ← Future features

## Code Editing Patterns
[6 workflows from AGENT_CODE_EDITING_PATTERNS.md]

## Testing Guide
[Content from CLI_TOOL_TESTING_GUIDE.md]

## Roadmap
[Summary from AGENT_TOOLING_ENHANCEMENTS_PROPOSAL.md]

## Reference
- Full enhancement proposal: [link]
- js-scan docs: [link]
- js-edit docs: [link]
```

**Benefit**: 
- Agents go to one place for all CLI knowledge
- Reduces duplication
- Easier to maintain

**Effort**: 1-2 hours (consolidate + relink)

---

#### 2.2 Create Agent Onboarding Path
**Purpose**: Structured journey for new/returning agents

**File**: `/docs/agents/agent-onboarding.md`
```markdown
# Agent Onboarding Workflow

## First Session (30 min)
1. Read AGENTS.md (core directives)
2. Read docs/agents/agent_policy.md
3. Browse docs/INDEX.md (3 min scan)
4. Book a favorite workflow from Workflow Registry

## Before Each Session (5 min)
1. Check docs/INDEX.md "Recent Updates" section
2. Open AGENTS.md "The improvement loop"
3. Look up relevant workflow in Workflow Registry
4. Review AGENTS.md plan template

## When Stuck
1. Check docs/agents/core-workflow-rules.md
2. Search Workflow Registry for related patterns
3. Review decision notes in docs/decisions/

## When Done with a Task
1. Update relevant workflow docs if you learned something new
2. Add discovery to SESSION_SUMMARY_<date>.md
3. Link from Workflow Registry if creating something new
4. Tell team if creating a full workflow (add to Registry + AGENTS.md)

## Anti-Patterns
- [ ] Don't create ad-hoc .md files; use sessions or workflows
- [ ] Don't skip the Workflow Registry; use it to find existing patterns
- [ ] Don't ignore docs/agents/ guides; they're role-specific
```

**Benefit**:
- New agents have clear path
- Reduces "I don't know where to start" friction
- Encourages workflow discovery

**Effort**: 1 hour (write onboarding path)

---

#### 2.3 Archive Session Documents
**Action**: Create `/docs/archives/sessions/` directory
- Move SESSION_SUMMARY_*.md files
- Keep last 3 months in /docs/reports/ for reference
- Archive older ones
- Update INDEX.md with archive link

**Benefit**: 
- Reduces /docs clutter
- Preserves history
- Clear current vs. archive status

**Effort**: 30 minutes (organize + move)

---

### Tier 3: Automation (Ongoing) — 2-4 hours

#### 3.1 Add Workflow Status Tracking to Frontmatter
**Current**: Some docs have frontmatter, inconsistently formatted

**Proposed**: Standard frontmatter for all workflow docs
```markdown
---
type: workflow            # workflow | guide | reference | decision
status: active            # active | experimental | deprecated
created: 2025-11-13       # creation date
last-tested: 2025-11-13   # when last validated
author: singularity-engineer
relates-to: AGENTS.md, other-workflow.md
tags: cli, code-editing, batch-operations
---
```

**Benefit**:
- Can generate Workflow Registry automatically
- Easy to find workflows by status/tag
- Clear deprecation path

**Effort**: 1 hour (add to templates, update existing docs)

---

#### 3.2 Add Workflow Discovery Queries
**Purpose**: Tools for agents to search workflows

**Ideas**:
```bash
# Find workflows by tag
node tools/grep_search.js --query "tags:.*cli.*" --path docs/workflows

# Find active workflows
node tools/grep_search.js --query "status: active" --path docs/workflows

# Find related workflows
node tools/grep_search.js --query "relates-to:.*batch.*" --path docs/workflows
```

**Benefit**:
- Agents can find workflows programmatically
- Future: build autocomplete/suggestions

**Effort**: 2-3 hours (if building new tooling; otherwise 30 min if using existing search)

---

#### 3.3 Update AGENTS.md with Workflow Discovery Section
**Add** (after "CLI Tooling & Agent Workflows"):
```markdown
## Workflow Discovery & Contribution

Every agent should know:

1. **Find a workflow**: Check [Workflow Registry](docs/workflows/WORKFLOW_REGISTRY.md)
2. **Contribute a workflow**: Follow [Workflow Contribution Guide](docs/workflows/WORKFLOW_CONTRIBUTION_GUIDE.md)
3. **First time?**: [Agent Onboarding](docs/agents/agent-onboarding.md)

When you create a workflow:
- Document it in SESSION_SUMMARY_<date>.md
- Test it 2-3 times
- Promote to /docs/workflows/<name>.md (see contribution guide)
- Add to Workflow Registry
- Link from AGENTS.md if core to many agents
- Archive old versions in docs/archives/

When you improve existing workflows:
- Update the workflow doc + Workflow Registry
- Note what changed + why in frontmatter
- Run validation checklist
```

**Benefit**:
- Every agent knows they're responsible for workflows
- Clear contribution path
- Encourages continuous improvement

**Effort**: 30 minutes (add section + link)

---

## Implementation Roadmap

### Week 1 (Nov 13-20): Foundation
- **Mon**: Create WORKFLOW_REGISTRY.md (2h)
- **Tue**: Update INDEX.md + add agent entry (1h)
- **Wed**: Write WORKFLOW_CONTRIBUTION_GUIDE.md (2h)
- **Thu**: Test onboarding path with new agent (1h)
- **Fri**: Update AGENTS.md with discovery section (1h)

**Deliverable**: Agents can discover, use, and contribute workflows

### Week 2 (Nov 20-27): Integration
- Consolidate tooling docs (1.5h)
- Create agent onboarding guide (1h)
- Archive session docs (0.5h)
- Update INDEX.md with recent links (0.5h)

**Deliverable**: Cleaner doc structure, easier navigation

### Week 3+ (Nov 27+): Automation
- Add frontmatter to workflow docs (1h)
- Build workflow discovery tooling (2-3h, optional)
- Periodic review of Workflow Registry (15 min/week)

**Deliverable**: Scalable, self-maintaining system

---

## Success Metrics

### Before Implementation
- 182 docs with no clear categories
- Agents discover workflows through trial/error
- No workflow contribution process
- No registry of what's active

### After Implementation
- ✅ Workflow Registry shows all active workflows (one page)
- ✅ New agents onboarded in 30 minutes (clear path)
- ✅ Workflows created + promoted systematically
- ✅ Discovery questions answerable in <5 minutes
- ✅ Agents contribute back to workflows
- ✅ Document lifecycle clear (active → deprecated → archived)

---

## Recommended Immediate Actions

### For James (Project Lead)
1. **Review** this strategy (30 min)
2. **Approve** Tier 1 changes (or request modifications)
3. **Assign** Workflow Registry creation to team (2-3h task)
4. **Schedule** architecture review after Week 1 implementation

### For AI Agents (Starting Today)
1. **Use** Workflow Registry (when available) as single source of truth
2. **Create** new workflows following Contribution Guide (when available)
3. **Link** discoveries back to canonical docs
4. **Help** with INDEX.md + WORKFLOW_REGISTRY.md creation

### For Developers
1. **Review** Agent Onboarding path (ensure it works)
2. **Test** workflow discovery (does it help?)
3. **Feedback**: Is documentation structure working?

---

## Document Lifecycle Policy (Draft)

### Workflow Statuses

**Active**: Currently used, tested, maintained
- Location: `/docs/workflows/`
- Frontmatter: `status: active`
- Linked from: AGENTS.md, Workflow Registry, INDEX.md
- TTL: Indefinite (updated as needed)

**Experimental**: New, being tested, feedback wanted
- Location: `/docs/workflows/` (with note in Registry)
- Frontmatter: `status: experimental`
- Linked from: Workflow Registry only
- TTL: 1 month (promote to active or deprecate)

**Deprecated**: Still valid but replaced by better workflow
- Location: Still in `/docs/workflows/`
- Frontmatter: `status: deprecated, see [replacement-workflow.md]`
- Linked from: Workflow Registry (marked as deprecated)
- TTL: 3 months, then move to `/docs/archives/workflows/`

**Archived**: Historical reference only, don't use
- Location: `/docs/archives/workflows/`
- Frontmatter: `status: archived, deprecated on YYYY-MM-DD`
- Linked from: Only docs/archives/INDEX.md
- TTL: 6 months, then delete (keep git history)

### Decision Notes

**Location**: `/docs/decisions/`
**Format**: `YYYY-MM-DD-<slug>.md`
**TTL**: Keep as long as decision is relevant; move to archives if superseded

### Session Notes

**Location**: `/docs/reports/` (last 3 months) + `/docs/archives/sessions/` (older)
**Format**: `SESSION_SUMMARY_YYYY-MM-DD.md`
**TTL**: Keep active for 3 months; archive after; delete after 1 year

### Reference Docs

**Location**: `/docs/reference/`
**Format**: Comprehensive guides (e.g., `cli-tools-for-agents.md`)
**TTL**: Keep until major version change or tool deprecated

---

## Anti-Patterns to Avoid Going Forward

❌ **Don't**: Create workflows only in session notes  
✅ **Do**: Graduate promising patterns to /docs/workflows/ within 1 month

❌ **Don't**: Leave new docs in root forever  
✅ **Do**: Move to /docs/<category> or /docs/archives/ within 3 months

❌ **Don't**: Update INDEX.md sporadically  
✅ **Do**: Review + update every month (or after major changes)

❌ **Don't**: Assume agents know about new workflows  
✅ **Do**: Add to Workflow Registry + link from AGENTS.md

❌ **Don't**: Have 182 flat docs  
✅ **Do**: Categorize by type (agent, workflow, reference, decision, archive)

---

## Questions for Prioritization

1. **Phasing**: Want to do Tier 1 this week, or spread over 2 weeks?
2. **Automation**: Should we build workflow discovery tooling (Tier 3.2) now or later?
3. **Archive**: How far back should we archive session notes? (Recommend: 6 months)
4. **Frontmatter**: Should all docs use standard frontmatter or just workflows?
5. **Links**: Should AGENTS.md link to every workflow or just highlight key ones?

---

## Summary: What Changes?

### For Agents
- **New entry point**: docs/agents/agent-onboarding.md
- **Workflow discovery**: Use Workflow Registry (not trial-and-error)
- **Contribution path**: Follow Workflow Contribution Guide
- **Regular updates**: Frontmatter keeps workflows findable

### For Project
- **Clearer structure**: Categorized, linked, maintained
- **Scalable**: New workflows fit into system automatically
- **Self-documenting**: Workflow Registry auto-generates from frontmatter
- **Professional**: Clear lifecycle (active → deprecated → archived)

### For Documentation
- **From**: 182 scattered docs with unclear purpose
- **To**: Categorized docs + active Workflow Registry + clear contribution path
- **Benefit**: Agents find what they need in <5 min instead of 20+ min

---

**Next Step**: Review this strategy, approve Tier 1, and let's build it out!
