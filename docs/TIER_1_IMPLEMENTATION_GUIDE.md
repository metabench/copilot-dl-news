---
type: implementation-guide
status: ready-to-execute
created: 2025-11-13
for-task: Workflow Documentation & Agent Awareness Improvement (Tier 1)
---

# Tier 1 Implementation Guide: Build the Foundation

This document provides copy-paste-ready templates and exact steps to implement the 3 Tier 1 improvements. **Effort: 4-6 hours total. ROI: Immediate agent productivity boost.**

---

## Task 1: Create `/docs/workflows/WORKFLOW_REGISTRY.md` (2h)

### Step 1.1: Audit Existing Workflows

Run these searches to identify canonical workflows:

```powershell
# Find all docs with "workflow" in name
Get-ChildItem -Path "docs" -Recurse -Filter "*workflow*" | Select-Object FullName

# Find docs in /workflows/ directory
Get-ChildItem -Path "docs/workflows" -Filter "*.md" | Select-Object Name

# Search for docs mentioning "workflow" or pattern descriptions
Select-String -Path "docs/*.md" -Pattern "workflow|playbook|pattern" -List | Select-Object Path
```

**Expected**: You'll find:
- docs/workflows/planning_review_loop.md ✅
- docs/workflows/doc_extraction_playbook.md ✅
- docs/agents/ (11 role-specific guides)
- AGENT_CODE_EDITING_PATTERNS.md (root)
- CLI_TOOL_TESTING_GUIDE.md (docs)
- Plus 140+ docs of mixed type (decisions, architecture, sessions, etc.)

### Step 1.2: Create Workflow Registry Template

Create file: `/docs/workflows/WORKFLOW_REGISTRY.md`

```markdown
---
type: reference
status: active
created: 2025-11-13
last-updated: 2025-11-13
owner: documentation-team
purpose: Central index of all active and experimental agent workflows
tags: registry, workflows, discovery
---

# Workflow Registry

_Central index of all agent workflows. Use this to find patterns for your task._

**Last updated**: 2025-11-13  
**Total active workflows**: 8  
**Total experimental**: 1  

---

## 🚀 Quick Navigation

- **By category**: [Workflows by Type](#workflows-by-type)
- **By phase**: See [AGENTS.md - Improvement Loop](../AGENTS.md)
- **By role**: See [docs/agents/](../agents/)
- **Contributing**: [Workflow Contribution Guide](#workflow-contribution-guide)

---

## Active Workflows

| Workflow | Purpose | Category | Time | Updated | Status |
|----------|---------|----------|------|---------|--------|
| [Planning & Review Loop](planning_review_loop.md) | Standard discover-plan-implement-verify cycle | Core | 10 min | 2025-10-15 | ✅ Active |
| [Doc Extraction Playbook](doc_extraction_playbook.md) | Extract decisions and findings into canonical docs | Docs | 8 min | 2025-09-20 | ✅ Active |
| [Code Editing Patterns](../AGENT_CODE_EDITING_PATTERNS.md) | Copy-paste workflows for common code edits (6 patterns) | Code | 15 min | 2025-11-13 | ✅ Active |
| [CLI Tool Testing Guide](../CLI_TOOL_TESTING_GUIDE.md) | Use test runners (npm test:*) for validation | Testing | 12 min | 2025-11-08 | ✅ Active |
| [Agent Onboarding](../agents/agent-onboarding.md) | New agent first session + ongoing setup | Onboarding | 15 min | 2025-11-13 | ✅ Active |
| [Workflow Contribution Guide](#workflow-contribution-guide) | How to create, test, promote, and register workflows | Docs | 10 min | 2025-11-13 | ✅ Active |

### By Type

#### Core Workflows (Do These Every Task)
- Planning & Review Loop
- Agent Onboarding (for new agents)

#### Code Workflows
- Code Editing Patterns (6 patterns for common refactors)
- CLI Tool Testing Guide (validate your changes)

#### Documentation Workflows
- Doc Extraction Playbook (turn discoveries into docs)
- Workflow Contribution Guide (add new workflows)

#### Reference
- All docs: [docs/INDEX.md](../INDEX.md)
- Agent roles: [docs/agents/](../agents/)

---

## Experimental Workflows

These workflows are new, being tested, and feedback is welcome. They'll promote to Active after 1 month of successful use.

| Workflow | Purpose | Time | Created | Feedback To |
|----------|---------|------|---------|-------------|
| [Tooling Enhancements Plan](./AGENT_TOOLING_ENHANCEMENTS_PROPOSAL.md) | Strategic improvements for js-scan/js-edit (10 features, priority matrix) | 20 min | 2025-11-13 | [GitHub Issue](link) |

_Have feedback? Open an issue or comment in the PR._

---

## Retired Workflows

_These workflows are no longer recommended. See replacement below._

| Workflow | Status | Replacement | Notes |
|----------|--------|-------------|-------|
| (none yet) | | | |

---

## Workflow Contribution Guide

**When you find a pattern you want to reuse**: Follow these steps.

### Phase 1: Document (While Working)
During your task, document promising patterns in `SESSION_SUMMARY_<date>.md`:

```markdown
## Workflow Discovery: [Pattern Name]

### What I Did
1. Step 1 description
2. Step 2 description
3. Step 3 description

### When This Helps
- Situation 1
- Situation 2

### Key Commands
\`\`\`bash
# command example
\`\`\`

### Tested On
- This current task (first use)
\`\`\`
```

### Phase 2: Validate (Repeat 2-3 Times)
Use the same pattern on your next 2-3 similar tasks. Does it work? Is it clear?

### Phase 3: Promote (Create Canonical Workflow)
When validated, create `/docs/workflows/<name>-workflow.md`:

```markdown
---
type: workflow
status: active                   # or: experimental
created: 2025-11-13
last-tested: 2025-11-13
author: [your-role]
relates-to: AGENTS.md, planning_review_loop.md
tags: [tag1, tag2]
---

# [Workflow Name]

## Overview
One sentence: what does this workflow help you do?

## When to Use
- Situation 1
- Situation 2
- When you see: [specific trigger]

## Prerequisites
- Understanding of X
- Read: [link to related workflow]

## Steps

### Step 1: [Description]
\`\`\`bash
# command
\`\`\`

**Expected output**: Description of what you should see

### Step 2: [Description]
...

## Validation Checklist
- [ ] All tests pass (npm run test:by-path)
- [ ] [specific check]
- [ ] No new console errors

## Common Pitfalls
- Pitfall 1: Why it happens, how to avoid
- Pitfall 2: ...

## Next Steps
- If successful: [next workflow]
- If stuck: Check [related workflow]

## Related Workflows
- [Planning & Review Loop](planning_review_loop.md)
- [Doc Extraction Playbook](doc_extraction_playbook.md)
```

### Phase 4: Register (Add to Registry)
Add a row to the table in this file:

```markdown
| [Workflow Name](workflow-name-workflow.md) | Purpose | Category | 10 min | 2025-11-13 | ✅ Active |
```

### Phase 5: Link (Update Hub)
If it's core to many agents, add to [AGENTS.md](../AGENTS.md):

```markdown
## Key Workflows
- [Planning & Review](docs/workflows/planning_review_loop.md)
- [Code Editing Patterns](docs/AGENT_CODE_EDITING_PATTERNS.md)
- [Your New Workflow](docs/workflows/your-workflow.md)
```

**That's it!** Other agents will discover your workflow via Registry → Hub → docs.

---

## How to Use This Registry

### "I need to do X"
1. Search this page (Ctrl+F) for keywords: `edit`, `test`, `database`, etc.
2. Scan the relevant table row
3. Click the workflow link
4. Follow the steps

### "I found a pattern worth reusing"
1. Go to [Workflow Contribution Guide](#workflow-contribution-guide) (above)
2. Follow Phase 1-5
3. Come back and add a row to the table

### "This workflow doesn't work for me"
1. Open a GitHub issue or comment in PR
2. We'll investigate or update the workflow

### "I want to improve a workflow"
1. Open the workflow .md file
2. Make your changes
3. Update "last-tested" date in frontmatter
4. Update "last-updated" in Registry table
5. Open PR with your improvements

---

## Registry Maintenance (For Documentation Team)

### Weekly (5 min)
- Check for new workflows in SESSION_SUMMARY files
- Promote any that look stable to "Experimental"

### Monthly (15 min)
- Review "Experimental" workflows
  - Promote successful ones to "Active"
  - Archive unsuccessful ones
- Update "last-updated" dates for active workflows still being used
- Check for broken links (use [Doc Link Integrity](../checklists/doc_link_integrity.md) checklist)

### Quarterly (30 min)
- Review all workflows
- Consolidate duplicates
- Archive workflows not used in 3 months (move to docs/archives/workflows/)
- Update INDEX.md with new Registry link

---

## FAQ

**Q: Where do I document my first attempt at a workflow?**  
A: In `SESSION_SUMMARY_<date>.md`. Once you've used it 2-3 times and it works, promote to /docs/workflows/.

**Q: Can I edit a workflow in the Registry?**  
A: Yes! If you improve a workflow or find it doesn't work, update the workflow .md file and update the "last-tested" date in this Registry.

**Q: What if a workflow has a broken step?**  
A: Report it as a GitHub issue. Or fix it yourself and open a PR.

**Q: How do I know which workflows are new?**  
A: Check "Updated" column—workflows updated in the last week are fresh.

**Q: Do I have to contribute workflows?**  
A: No, but if you find a pattern you used 3+ times, please add it. It helps other agents!

---

## Links

- **Contributing Workflows**: See [Workflow Contribution Guide](#workflow-contribution-guide) (above)
- **All Documentation**: [docs/INDEX.md](../INDEX.md)
- **Agent Policy**: [docs/agents/agent_policy.md](../agents/agent_policy.md)
- **Core Directives**: [AGENTS.md](../AGENTS.md)
```

### Step 1.3: Test the Registry

**Action**: Open `/docs/workflows/WORKFLOW_REGISTRY.md` and verify:
- [ ] All links work (click each one)
- [ ] Table formatting is correct
- [ ] Categories make sense
- [ ] Status badges are consistent

**Estimate**: 20 minutes

### Step 1.4: Complete!

**Deliverable**: `/docs/workflows/WORKFLOW_REGISTRY.md` ✅

---

## Task 2: Update `/docs/INDEX.md` with Agent Entry Point (1h)

### Step 2.1: Read Current INDEX.md

```powershell
Get-Content -Path "docs/INDEX.md"
```

**Note**: It's a flat list. We're going to add agent navigation at the top.

### Step 2.2: Create New Agent Section

Prepend this to INDEX.md (before "## Agents"):

```markdown
# Project Documentation Index

_Last updated: 2025-11-13_

## 🚀 Agent Quick Start (Start Here!)

**New to this project?** Start here (30 min):
1. Read [Agent Policy](agents/agent_policy.md) — How agents work in this project
2. Check [Workflow Registry](workflows/WORKFLOW_REGISTRY.md) — Find patterns for your task
3. Browse [Core Directives](../AGENTS.md) — High-level principles

**Returning?** (5 min):
1. Check this index for recent additions
2. Pick your workflow from [Workflow Registry](workflows/WORKFLOW_REGISTRY.md)
3. Read the relevant doc and go

**Contributing?** (10 min):
- [Add a New Workflow](workflows/WORKFLOW_CONTRIBUTION_GUIDE.md)
- [Update This Index](how_tos/update_index.md)
- [Improve Agent Policy](agents/agent_policy.md)

---

## Browse by Category

```

### Step 2.3: Copy Full New INDEX.md Content

Create the complete updated INDEX.md:

```markdown
# Project Documentation Index

_Last updated: 2025-11-13_

## 🚀 Agent Quick Start (Start Here!)

**New to this project?** Start here (30 min):
1. Read [Agent Policy](agents/agent_policy.md) — How agents work in this project
2. Check [Workflow Registry](workflows/WORKFLOW_REGISTRY.md) — Find patterns for your task
3. Review [Core Directives](../AGENTS.md) — High-level principles

**Returning?** (5 min):
1. Check this index for recent additions
2. Pick your workflow from [Workflow Registry](workflows/WORKFLOW_REGISTRY.md)
3. Read the relevant doc and go

**Contributing?** (10 min):
- [Add a New Workflow](workflows/WORKFLOW_CONTRIBUTION_GUIDE.md)
- [Update This Index](how_tos/update_index.md)

---

## Browse by Category

## Agents
- [Agent Policy](agents/agent_policy.md)
- [Agent Onboarding](agents/agent-onboarding.md) ← Start here if new
- [Command Execution Rules](agents/command-rules.md)
- [Core Workflow Rules](agents/core-workflow-rules.md)
- [Database Schema Evolution](agents/database-schema-evolution.md)
- [Database Schema Tools](agents/database-schema-tools.md)
- [Docs Indexer & Agents Refactorer](agents/docs_indexer_and_agents_refactorer.md)
- [Intelligent Crawl Startup](agents/intelligent-crawl-startup.md)
- [TDD Guidelines](agents/tdd-guidelines.md)
- [Test Log Migration](agents/test-log-migration.md)
- [Testing Guidelines](agents/testing-guidelines.md)
- [Tools & Correction Scripts](agents/tools-correction-scripts.md)

## Workflows
**See [Workflow Registry](workflows/WORKFLOW_REGISTRY.md) for complete list** (this is the central hub)

- [Workflow Registry](workflows/WORKFLOW_REGISTRY.md) ← All active workflows in one place
- [Workflow Contribution Guide](workflows/WORKFLOW_CONTRIBUTION_GUIDE.md) — How to create & share workflows
- [Planning & Review Loop](workflows/planning_review_loop.md)
- [Documentation Extraction Playbook](workflows/doc_extraction_playbook.md)

## Standards
- [Commit & PR Standards](standards/commit_pr_standards.md)
- [Communication Standards](standards/communication.md)
- [Naming & Conventions](standards/naming_conventions.md)
- [Testing Output Standards](standards/testing_output.md)

## How-tos
- [Add a New Agent](how_tos/add_new_agent.md)
- [Update the Index](how_tos/update_index.md)

## Reference
- [Adapters Overview](reference/adapters_overview.md)
- [Build Process](reference/build_process.md)
- [CLI Tooling](reference/cli_tooling.md)
- [CLI Tool Testing Guide](CLI_TOOL_TESTING_GUIDE.md) ← Test runners for js-scan, js-edit, md-scan, md-edit
- [Database Schemas](reference/db_schemas.md)
- [Enhanced Database Adapter](reference/enhanced_database_adapter.md)
- [Project Overview](reference/project_overview.md)

## Checklists
- [Database Backup](checklists/database_backup.md)
- [Doc Link Integrity](checklists/doc_link_integrity.md)
- [Release Preflight](checklists/release_preflight.md)

---

## Recent Updates (Last 2 Weeks)

- ✨ [Workflow Registry](workflows/WORKFLOW_REGISTRY.md) — New central hub for all workflows (Nov 13)
- ✨ [Agent Onboarding](agents/agent-onboarding.md) — Structured path for new agents (Nov 13)
- ✨ [Workflow Contribution Guide](workflows/WORKFLOW_CONTRIBUTION_GUIDE.md) — How to add workflows (Nov 13)
- ✅ [CLI Tool Testing Guide](CLI_TOOL_TESTING_GUIDE.md) — Test runners documented (Nov 8)
- ✅ [Code Editing Patterns](../AGENT_CODE_EDITING_PATTERNS.md) — 6 copy-paste workflows (Nov 13)

---

## About This Index

This index is the map to all project documentation. Every new doc should be added here. To update:

1. Add your new doc entry above
2. Update "Recent Updates" section
3. Open PR with changes
4. See [Update the Index](how_tos/update_index.md) for detailed process

---

_Questions? Open an issue or check [Agent Policy](agents/agent_policy.md)._
```

### Step 2.4: Test Links

**Action**: Verify all links work
```powershell
# Open in browser or editor and spot-check links
# Expected: 15 links in main sections + 5 in recent updates
```

**Estimate**: 10 minutes

### Step 2.5: Complete!

**Deliverable**: Updated `/docs/INDEX.md` ✅

---

## Task 3: Write `/docs/workflows/WORKFLOW_CONTRIBUTION_GUIDE.md` (2h)

### Step 3.1: Create Contribution Guide

Create file: `/docs/workflows/WORKFLOW_CONTRIBUTION_GUIDE.md`

```markdown
---
type: workflow
status: active
created: 2025-11-13
last-tested: 2025-11-13
author: singularity-engineer
relates-to: AGENTS.md, WORKFLOW_REGISTRY.md, agent-onboarding.md
tags: workflows, documentation, contribution
---

# How to Create and Contribute Workflows

**Goal**: Turn your one-off task into a reusable pattern that helps other agents.

**When you find yourself repeating the same steps multiple times, it's time to document it as a workflow.**

---

## When to Create a Workflow

You should document a workflow when:

- [ ] You've done the same task **2+ times** in the last month
- [ ] You notice other agents would benefit from the same pattern
- [ ] It's a **multi-step process** (not a one-liner)
- [ ] It crosses **module/domain boundaries** (involves multiple files/services)
- [ ] You save **>10 minutes per use** by having written instructions

### Examples

✅ **Good candidates for workflows**:
- Extracting a helper function (multi-file refactor)
- Running end-to-end tests (involves setup + validation)
- Deploying to staging (multiple steps, easy to forget)
- Batch renaming variables (discovery + planning + apply + test)
- Creating a new database migration (schema + data + seed)

❌ **Not workflow material**:
- Running a single command
- Reading one file
- One-time setup that won't repeat

---

## 5-Phase Process: Create → Test → Promote → Register → Done

### Phase 1: Document (During Work)

**When**: As you work on your task

**Where**: In `SESSION_SUMMARY_<date>.md`

**What**: Write down the steps you followed

```markdown
## Workflow Discovery: Extract Helper Function

### What I Did
1. Used js-scan to find all references: `node js-scan.js --search myFunction`
2. Created new file `/src/utils/helper.js`
3. Copied function + JSDoc
4. Updated imports in 3 places (app.js, service.js, utils.js)
5. Ran tests: `npm run test:by-path tests/utils/**`
6. Fixed import order issue in barrel file

### When This Helps
- Moving duplicate logic to a shared utility
- Extracting code for testing/reusability
- Cleaning up fat modules

### Key Commands
\`\`\`bash
# Find all uses
node js-scan.js --search functionName --json > refs.json

# Batch update imports (if using js-edit)
node js-edit.js --batch-mode batch-edits.json
\`\`\`

### Tested On
- Task 1 (first extraction, Nov 13)
- Task 2 (similar extraction, Nov 14) ← Second validation
\`\`\`

**Effort**: 5-10 minutes (just write down what you did)

---

### Phase 2: Validate (Repeat 2-3 Times)

**When**: On your next 2-3 similar tasks

**Action**: Follow your documented steps again

**Questions to ask**:
- Does the process work? (or do you need to adjust it?)
- Are the steps clear? (or did you get confused?)
- Does it save time? (or is it unnecessary overhead?)
- Would other agents understand it?

**Outcome**: You know it works + you can improve the wording

**Effort**: 5-10 minutes per use (that's the point: your time is saved!)

---

### Phase 3: Promote (Create Canonical Workflow Doc)

**When**: After validating 2-3 times (or when 1+ other agent asks "how do I do this?")

**Where**: Create `/docs/workflows/<subject>-workflow.md`

**Naming Convention**:
- `extract-helper-function-workflow.md`
- `batch-rename-variables-workflow.md`
- `create-database-migration-workflow.md`
- Pattern: `<verb>-<subject>-workflow.md` (lowercase, hyphens)

**Template** (copy and fill in):

```markdown
---
type: workflow
status: active
created: 2025-11-13
last-tested: 2025-11-13
author: [your-agent-role]
relates-to: AGENTS.md, [related-workflow].md
tags: [tag1, tag2]
---

# [Workflow Title]

## Overview
One sentence describing what you'll accomplish:
> "Extract duplicate logic into a reusable utility function"

## When to Use

Use this workflow when:
- You have duplicate logic in 2+ places
- You want to create a shared utility
- You're cleaning up a fat module

**Signs you should use this**:
- You copy-pasted code between files
- Same logic in multiple places
- Function is too long

**Don't use this for**:
- One-time logic (leave it where it is)
- Callbacks/hooks (different workflow)

## Prerequisites

Before starting, you should:
- Understand module boundaries (/src/modules, /src/utils, /src/services)
- Have used js-scan or js-edit before
- Know how to run: `npm run test:by-path`

**Estimated time**: 15 minutes

## Step-by-Step Process

### Step 1: Discover All Uses

Find everywhere the logic appears:

\`\`\`bash
# Search for the function or pattern
node js-scan.js --search "myFunction\|duplicateLogic" --json > refs.json

# Review results to understand scope
cat refs.json | jq '.results[] | {file, line, preview}'
\`\`\`

**What to look for**:
- How many files have this code?
- Are the uses identical or do they vary?
- What parameters are passed in?

**Expected output**: 2-5 matches

### Step 2: Create New Utility File

Create the new file with the shared logic:

\`\`\`bash
# Create new utility
echo '/**
 * Helper function extracted from [original locations]
 * @param {type} param1 - Description
 * @returns {type} Description
 */
function myNewHelper(param1) {
  // extracted logic here
}

module.exports = { myNewHelper };
' > src/utils/my-new-helper.js
\`\`\`

**What to include**:
- JSDoc comment (param types, return type, purpose)
- Clear function name
- Export statement
- Comments explaining complex logic

### Step 3: Update All Imports

Find each reference and update to use the new utility:

\`\`\`bash
# Option A: Batch edit with js-edit
cat > edits.json <<EOF
[
  { "file": "src/app.js", "startLine": 42, "endLine": 45, "replacement": "const { myNewHelper } = require('../utils/my-new-helper');" },
  { "file": "src/service.js", "startLine": 100, "endLine": 103, "replacement": "const { myNewHelper } = require('../utils/my-new-helper');" }
]
EOF

node js-edit.js --batch-mode edits.json --atomic

# Option B: Manual edits for small changes
\`\`\`

**Validation**:
- [ ] Each file imports the new utility
- [ ] Old duplicated code is removed
- [ ] No syntax errors

### Step 4: Verify with Tests

Run all affected tests:

\`\`\`bash
# Run tests for modules you changed
npm run test:by-path "tests/**"

# Or be specific
npm run test:by-path "tests/utils/my-new-helper.test.js"
\`\`\`

**Expected**:
- All tests pass ✅
- No console errors

### Step 5: Update Barrel File (if needed)

If `/src/utils/index.js` exports utilities, add your new one:

\`\`\`javascript
// /src/utils/index.js
export { myNewHelper } from './my-new-helper.js';
\`\`\`

### Step 6: Commit

\`\`\`bash
git add src/utils/my-new-helper.js src/app.js src/service.js
git commit -m "Extract: myNewHelper utility function (used in 3 places)"
\`\`\`

**Commit message format**: `Extract: [what] (used in [N] places)`

---

## Validation Checklist

Before considering this workflow complete:

- [ ] All tests pass (`npm run test:by-path`)
- [ ] No console errors or warnings
- [ ] New function has JSDoc comment
- [ ] All duplicate code removed
- [ ] Imports are correct (no circular dependencies)
- [ ] Barrel file updated (if applicable)
- [ ] Code review complete

---

## Common Pitfalls & How to Avoid Them

### Pitfall 1: Forgetting to Update Barrel File
**Symptom**: Other modules can't import your new utility  
**Fix**: Check `/src/utils/index.js` and add your export  
**Prevention**: Add to checklist above

### Pitfall 2: Imports Have Circular Dependency
**Symptom**: Weird errors or imports fail  
**Fix**: Use `require()` for server-side, `import` for client-side. Check module boundaries  
**Prevention**: Review module boundaries before creating utility

### Pitfall 3: Not All References Updated
**Symptom**: Some code still has old duplicated logic  
**Fix**: Re-run `js-scan` to find any you missed  
**Prevention**: Use batch edits instead of manual edits

### Pitfall 4: Extracted Function Too Generic
**Symptom**: Function doesn't fit common use cases; each caller needs to modify it  
**Fix**: Keep it specific to the original use case. Create a separate utility if you need a generic version  
**Prevention**: Extract when code is identical, not "kind of similar"

---

## Alternative Approaches

### When to Use This Workflow
- **Code is identical** across files → Extract helper

### When to Use Different Approach
- **Code is similar but not identical** → Use template/factory pattern
- **Function is only used once** → Leave it where it is
- **Logic is complex business rule** → Create domain service instead

See [AGENTS.md - Code Editing Patterns](../AGENT_CODE_EDITING_PATTERNS.md) for related workflows.

---

## Performance Considerations

**N+1 Imports**: If you're creating many small utilities, avoid `require()` in a loop.

```javascript
// ❌ Avoid: requires inside loop
for (const item of items) {
  const helper = require('./helper');  // repeated require
  // use helper
}

// ✅ Better: require once, use multiple times
const helper = require('./helper');
for (const item of items) {
  // use helper
}
```

---

## When This Workflow Is Done

You're done when:
- ✅ New utility file created with JSDoc
- ✅ All duplicate code removed from original locations
- ✅ All imports updated (no old calls to removed code)
- ✅ All tests pass
- ✅ PR reviewed and merged
- ✅ Workflow documented for next agent (update [Workflow Registry](WORKFLOW_REGISTRY.md))

---

## Next Steps After Extraction

**If you want to reuse this logic further**:
- Add more test cases for edge cases
- Document the utility in code comments
- Create a decision note if this is a significant refactor

**If you found a better approach**:
- You can always refactor again
- Keep the utility if it has 2+ active users
- Archive if nobody uses it after 2 months

---

## Related Workflows
- [Planning & Review Loop](planning_review_loop.md) — Framework for any task
- [Code Editing Patterns](../AGENT_CODE_EDITING_PATTERNS.md) — 6 other code patterns
- [CLI Tool Testing Guide](../CLI_TOOL_TESTING_GUIDE.md) — Running validation tests

## Questions?
- Check [Agent Policy](../agents/agent_policy.md)
- Ask in #agents Slack channel
- Open GitHub issue

---

**Last tested**: 2025-11-13  
**Still works?** Update the date above or open an issue if something changed
```

**Estimate**: 60-90 minutes (thorough + examples)

### Step 3.2: Create 1-2 Additional Simple Workflows

**Choose 2 from this list** (pick ones that already exist informally):

**Option A: Simple Workflow Example** — Batch Rename Variables
```markdown
---
type: workflow
status: active
created: 2025-11-13
last-tested: 2025-11-13
author: singularity-engineer
relates-to: AGENT_CODE_EDITING_PATTERNS.md, js-scan, js-edit
tags: refactoring, batch-operations
---

# Batch Rename Variables Across Files

## Overview
> Rename a variable, function, or constant used in multiple files without manual find-and-replace

## When to Use
- Renaming a function used in 5+ places
- Renaming a class or constant
- Standardizing naming (camelCase → UPPER_CASE)

## Steps
1. Find all uses: `node js-scan.js --search oldName --json > refs.json`
2. Create changes.json with { file, startLine, endLine, replacement }
3. Validate: `node js-edit.js --batch-mode changes.json --validate-plan --json`
4. Apply: `node js-edit.js --batch-mode changes.json --atomic --json`
5. Test: `npm run test:by-path tests/**`

## Validation
- [ ] All tests pass
- [ ] Search for old name returns 0 results
- [ ] Code compiles/runs without errors

## See Also
- [Code Editing Patterns](../AGENT_CODE_EDITING_PATTERNS.md)
- [CLI Tool Testing Guide](../CLI_TOOL_TESTING_GUIDE.md)
```

**Option B: Testing Workflow Example** — Test a Specific Module
```markdown
---
type: workflow
status: active
created: 2025-11-13
author: singularity-engineer
relates-to: CLI_TOOL_TESTING_GUIDE.md, TESTING_QUICK_REFERENCE.md
tags: testing, validation
---

# Test a Specific Module

## Overview
> Run focused tests on one module or feature without running full suite

## Steps
1. Identify test file: `src/modules/mymodule.js` → `tests/modules/mymodule.test.js`
2. Run tests: `npm run test:by-path "tests/modules/mymodule.test.js"`
3. Watch mode: `npm run test:by-path "tests/modules/mymodule.test.js" -- --watch`
4. Single test: `npm run test:file tests/modules/mymodule.test.js -- --testNamePattern="specific test"`

## Expected Output
✅ All tests pass or [diagnostic errors shown]

## Common Issues
- Test file not found: Check naming convention
- Tests timeout: Add --testTimeout=10000
- Module not found: Check import paths

## See Also
- [CLI Tool Testing Guide](../CLI_TOOL_TESTING_GUIDE.md)
- [Testing Quick Reference](../TESTING_QUICK_REFERENCE.md)
```

**Effort**: 20-30 minutes (2 simple workflows)

### Step 3.3: Complete!

**Deliverable**: 
- ✅ `/docs/workflows/WORKFLOW_CONTRIBUTION_GUIDE.md` (comprehensive, detailed)
- ✅ 1-2 simple example workflows (can be separate files or embedded)

---

## Implementation Checklist

### Day 1 (2-3 hours)
- [ ] Create WORKFLOW_REGISTRY.md with initial 6-8 workflows
- [ ] Test all links in Registry
- [ ] Add agent entry point to INDEX.md
- [ ] Test INDEX.md links

**Status**: Agents can now discover workflows

### Day 2 (1.5-2 hours)
- [ ] Write WORKFLOW_CONTRIBUTION_GUIDE.md with templates
- [ ] Create 1-2 simple example workflows
- [ ] Test contribution process (create dummy workflow, add to Registry)

**Status**: Agents can now contribute workflows

### Day 3 (30 minutes)
- [ ] Link from AGENTS.md to Registry
- [ ] Announce to team (update Slack/email)
- [ ] Request feedback

**Status**: Complete Tier 1 ✅

---

## Files to Create/Update

| File | Action | Effort | Status |
|------|--------|--------|--------|
| `/docs/workflows/WORKFLOW_REGISTRY.md` | Create | 2h | Ready |
| `/docs/INDEX.md` | Update (add agent section) | 1h | Ready |
| `/docs/workflows/WORKFLOW_CONTRIBUTION_GUIDE.md` | Create | 2h | Ready |
| `AGENTS.md` | Update (add discovery section) | 30 min | Phase 2 |

---

## Success Criteria

After completing Tier 1, you should be able to answer:

✅ "What workflows are available?" → Check WORKFLOW_REGISTRY.md  
✅ "Where do I start?" → Check INDEX.md (agent section)  
✅ "How do I create a new workflow?" → Check WORKFLOW_CONTRIBUTION_GUIDE.md  
✅ "Are these workflows active?" → Check frontmatter + Registry status  

**Team Impact**:
- Agents save 5-10 minutes per task (find workflows faster)
- New agents onboard 2x faster (clear entry point)
- Workflows get maintained (contribution process clear)
- Documentation becomes self-sustaining (registry auto-updates)

---

## Next: Tier 2 (After Tier 1 Is Stable)

Once Tier 1 is done and agents are using it:
- Consolidate tooling docs (2h)
- Create agent onboarding guide (1h)
- Archive old session docs (30 min)

See [WORKFLOW_DOCUMENTATION_IMPROVEMENT_STRATEGY.md](WORKFLOW_DOCUMENTATION_IMPROVEMENT_STRATEGY.md) for full roadmap.

---

**Ready to start? Begin with Task 1 (Create WORKFLOW_REGISTRY.md).** Let us know if you hit any snags!
