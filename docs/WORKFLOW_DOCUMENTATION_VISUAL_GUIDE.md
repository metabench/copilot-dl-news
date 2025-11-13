---
type: visual-guide
format: ascii-diagrams-and-tables
date: 2025-11-13
---

# Workflow Documentation System: Visual Guide

_Quick visual reference for how everything connects_

---

## Current State: The Problem

```
Agent says: "How do I extract a helper function?"

┌─────────────────────────────────────────┐
│  Agent starts searching...              │
├─────────────────────────────────────────┤
│  ❌ Check AGENTS.md?                    │
│     → Not there (too general)           │
│                                         │
│  ❌ Check INDEX.md?                     │
│     → 182 docs, no categories           │
│     → No "workflows" section            │
│                                         │
│  ❌ Search /docs/workflows/?            │
│     → 2 docs found (not specific enough)│
│                                         │
│  ❌ Check root directory?               │
│     → Found AGENT_CODE_EDITING_PATTERNS.md
│     → But is it canonical? Active? New? │
│     → No metadata!                      │
│                                         │
│  ❌ Ask another agent?                  │
│     → They don't know either            │
│                                         │
│  Result: 20-30 minutes wasted           │
└─────────────────────────────────────────┘
```

---

## Proposed Future State: The Solution

```
Agent says: "How do I extract a helper function?"

┌─────────────────────────────────────────────────┐
│  Agent starts searching...                      │
├─────────────────────────────────────────────────┤
│  ✅ Check docs/workflows/WORKFLOW_REGISTRY.md  │
│     → 8 active workflows listed                 │
│     → Search: "extract" → Found it!             │
│     → "Extract Helper Function" workflow        │
│     → Last tested: 2025-11-13                   │
│     → Time: 15 min                              │
│                                                 │
│  Click link → Extract-helper-workflow.md       │
│  Follow 6 steps → Complete in 10 minutes        │
│                                                 │
│  Result: 5-10 minutes total (SAVED 10-20 min!) │
└─────────────────────────────────────────────────┘
```

---

## Architecture: How It Connects

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENTS.md (Hub)                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Core directives + links to Registry + Contribution  │   │
│  │ "See Workflow Registry for complete list"           │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ Links to
                  ▼
┌─────────────────────────────────────────────────────────────┐
│         docs/INDEX.md (Navigation Hub)                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 🚀 AGENT QUICK START (NEW!)                         │   │
│  │   1. Read Agent Policy (5 min)                      │   │
│  │   2. Check Workflow Registry (3 min)                │   │
│  │   3. Read Core Directives (5 min)                   │   │
│  │                                                      │   │
│  │ By Category:                                         │   │
│  │ - Agents (11 guides)                                │   │
│  │ - Workflows (2 playbooks + REGISTRY)                │   │
│  │ - Standards, How-tos, Reference, Checklists        │   │
│  │                                                      │   │
│  │ Recent Updates (Last 2 weeks)                        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ Links to
                  ▼
┌─────────────────────────────────────────────────────────────┐
│      docs/workflows/WORKFLOW_REGISTRY.md (Central Hub)      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ TABLE: Active Workflows                             │   │
│  │ ┌──────────────────────────────────────────────┐    │   │
│  │ │ Name | Purpose | Category | Time | Status   │    │   │
│  │ ├──────────────────────────────────────────────┤    │   │
│  │ │ Planning & Review Loop | Discover-Plan-... | ... │    │   │
│  │ │ Code Editing Patterns | 6 patterns | Code | 15m │    │   │
│  │ │ Extract Helper Function | Move logic | Code | 15m │   │   │
│  │ │ ... (6 more) ...                             │    │   │
│  │ └──────────────────────────────────────────────┘    │   │
│  │                                                      │   │
│  │ Experimental Workflows                              │   │
│  │ Retired Workflows (with replacements)               │   │
│  │                                                      │   │
│  │ Contributing New Workflow? See CONTRIBUTION GUIDE   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────┬───────────────────────────────────────────┘
                  │
      ┌───────────┴──────────────┬─────────────┐
      │                          │             │
      │ Links to each workflow   │ Links to    │ Links to
      │                          │ contrib.    │
      ▼                          ▼             ▼
┌──────────────────┐   ┌──────────────────┐  ┌────────────────┐
│ Specific Workflow │   │ CONTRIBUTION     │  │ docs/agents/   │
│ e.g.              │   │ GUIDE            │  │ agent-         │
│ extract-helper-   │   │                  │  │ onboarding.md  │
│ function-         │   │ Phase 1-5:       │  │                │
│ workflow.md       │   │ Create → Test →  │  │ Agent Quick    │
│                   │   │ Promote → Reg. → │  │ Start (30 min) │
│ ✅ Active         │   │ Link             │  │                │
│ 📅 Updated: ...   │   │                  │  │ First-time     │
│ 🔖 Tags: ...      │   │ Templates +      │  │ onboarding     │
│ 📋 Steps 1-6      │   │ Examples         │  │                │
│ ✓ Validation      │   │                  │  │ Returning      │
│ 💡 Pitfalls       │   │ Copy-paste ready │  │ workflow: 5 min│
│                   │   │                  │  │                │
└──────────────────┘   └──────────────────┘  └────────────────┘
        │                       │
        │ Agent follows         │ Agent creates
        │ workflow steps        │ new workflow here
        │                       │
        ▼                       ▼
   Completes task          Eventually becomes
   (Saved 10+ min!)        Active workflow in Registry
```

---

## Agent Workflow: Tier 1 Implementation

```
Week 1: Monday - Friday (4-6 hours total)
───────────────────────────────────────────

┌─ MONDAY-TUESDAY (2-3 hours)
│
├─ Task 1: Create WORKFLOW_REGISTRY.md
│  ├─ Step 1: Audit existing workflows (1h)
│  ├─ Step 2: Create registry template (45 min)
│  ├─ Step 3: Test all links (20 min)
│  └─ Status: ✅ Complete
│
├─ Task 2: Update INDEX.md
│  ├─ Add "Agent Quick Start" section (20 min)
│  ├─ Add links to Registry + Contribution (10 min)
│  ├─ Test links (10 min)
│  └─ Status: ✅ Complete
│
└─ Status: Agents can now DISCOVER workflows ✅

┌─ WEDNESDAY-THURSDAY (1.5-2 hours)
│
├─ Task 3: Write WORKFLOW_CONTRIBUTION_GUIDE.md
│  ├─ Create comprehensive guide (60 min)
│  ├─ Add templates (30 min)
│  ├─ Create 1-2 example workflows (30 min)
│  ├─ Test the process (20 min)
│  └─ Status: ✅ Complete
│
└─ Status: Agents can now CREATE & CONTRIBUTE workflows ✅

┌─ FRIDAY (30-60 minutes)
│
├─ Task 4: Link from AGENTS.md
│  ├─ Add "Workflow Discovery" section (20 min)
│  ├─ Link to Registry + Contribution Guide (10 min)
│  └─ Status: ✅ Complete
│
├─ Task 5: Announce to team
│  ├─ Share WORKFLOW_DOCUMENTATION_EXECUTIVE_SUMMARY.md
│  ├─ Show Workflow Registry
│  ├─ Demo contribution process
│  └─ Request feedback
│
└─ Status: TIER 1 COMPLETE ✅

Result: Agents have centralized workflow discovery + contribution system
        5-10 minute savings per task × 100+ tasks/month = 500+ min saved!
```

---

## Document Structure After Tier 1

```
Project Root
├── AGENTS.md (Hub)
│   ├─ Core directives
│   ├─ Links to Workflow Registry ← NEW LINK
│   └─ Links to contribution guide ← NEW LINK
│
├── docs/
│   ├── INDEX.md (Updated)
│   │   ├─ 🚀 Agent Quick Start ← NEW SECTION
│   │   ├─ Workflow Registry link ← NEW
│   │   └─ Recent Updates ← NEW
│   │
│   ├── agents/
│   │   ├─ agent_policy.md (existing)
│   │   ├─ agent-onboarding.md ← NEW (Tier 2)
│   │   └─ ... (11 existing agent guides)
│   │
│   ├── workflows/
│   │   ├─ WORKFLOW_REGISTRY.md ← NEW (Tier 1)
│   │   ├─ WORKFLOW_CONTRIBUTION_GUIDE.md ← NEW (Tier 1)
│   │   ├─ planning_review_loop.md (existing)
│   │   ├─ doc_extraction_playbook.md (existing)
│   │   └─ extract-helper-function-workflow.md ← NEW example
│   │
│   ├── standards/ (existing)
│   ├── how_tos/ (existing)
│   ├── reference/ (existing)
│   ├── checklists/ (existing)
│   │
│   └── archives/ ← NEW (Tier 2)
│       └─ sessions/
│           └─ (old SESSION_SUMMARY files)
│
├── WORKFLOW_DOCUMENTATION_IMPROVEMENT_STRATEGY.md ← Strategic doc
├── TIER_1_IMPLEMENTATION_GUIDE.md ← Implementation steps
├── WORKFLOW_DOCUMENTATION_EXECUTIVE_SUMMARY.md ← This summary
└── TOOLING_ENHANCEMENTS_SUMMARY.md (existing)
```

---

## Agent Journey: Before vs. After

### BEFORE Tier 1

```
Day 1: New Agent Onboards

Agent: "I need to rename a variable across 5 files"
Lead: "Check the docs"
Agent: "Where?"

Agent tries:
  → AGENTS.md (too high-level)
  → INDEX.md (182 docs, no categories)
  → /docs/workflows/ (only 2 generic docs)
  → /docs/agents/ (agent roles, not patterns)
  → Slack history (buried in old messages)
  → Asks another agent (they don't know either)

Result: 30-45 minutes lost, agent frustrated 😞

Task completed manually without knowing a pattern existed.
```

### AFTER Tier 1

```
Day 1: New Agent Onboards

Agent: "I need to rename a variable across 5 files"
Lead: "Check the Workflow Registry"
Agent: Opens docs/workflows/WORKFLOW_REGISTRY.md

Agent sees:
  → Table of 8 active workflows
  → Search: "rename"
  → Found: "Batch Rename Variables" (6 min read)
  → Follows 6 steps
  → Completes in 10 minutes

Result: 5 minutes total, agent happy 😊
        Same task done 5-6x faster with confidence

Agent learns a workflow they'll reuse 10+ times.
```

---

## Effort vs. Benefit Analysis

```
┌────────────────────────────────────────────────┐
│          TIER 1 ROI CALCULATION               │
├────────────────────────────────────────────────┤
│                                                │
│  Implementation Time: 4-6 hours               │
│  ├─ Registry creation: 2h                     │
│  ├─ INDEX.md update: 1h                       │
│  ├─ Contribution guide: 2h                    │
│  └─ Testing + links: 30-60 min                │
│                                                │
│  Benefit Per Agent Per Task:                  │
│  ├─ Time saved: 10-15 minutes                 │
│  ├─ Confidence boost: +50%                    │
│  ├─ Knowledge reuse: +3 future tasks           │
│  └─ Documentation contribution: +5 workflows   │
│                                                │
│  TEAM IMPACT (Conservative):                  │
│  ├─ 10 agents × 5 tasks/week                  │
│  ├─ 10 min saved × 50 tasks = 500 min/week   │
│  ├─ 500 min ÷ 60 = 8.3 hours SAVED/week      │
│  ├─ 8.3 hours × 50 weeks = 415 hours/year    │
│  ├─ Cost of 4-6 hours: priceless investment  │
│  └─ ROI: 70x or higher                        │
│                                                │
│  BREAK-EVEN: 24-36 hours of agent use         │
│  (3-6 days of project work)                   │
│                                                │
└────────────────────────────────────────────────┘
```

---

## Success Metrics: Measuring Impact

### Before Implementation

```
Metrics (Baseline):
├─ Time to find a workflow: ~20-30 min (trial-and-error)
├─ Workflows in use: ~2-3 (discovered accidentally)
├─ New workflows created: ~0-1/month (no process)
├─ Agent frustration: "Where is the documentation?"
└─ Documentation maintenance: Ad-hoc, inconsistent
```

### After Tier 1 (1 month)

```
Metrics (Expected):
├─ Time to find a workflow: ~2-5 min (Registry lookup)
├─ Workflows in use: ~6-8 (discovered systematically)
├─ New workflows created: ~2-3/month (clear process)
├─ Agent satisfaction: "The Registry saved me so much time!"
└─ Documentation maintenance: Systematic, consistent
```

### After Tier 1 + 2 (2 months)

```
Metrics (Ambitious):
├─ Time to find a workflow: <2 min (muscle memory)
├─ Workflows in use: ~10+ (well-organized)
├─ New workflows created: ~4-5/month (culture shift)
├─ Agent satisfaction: "This is how we work now"
└─ Documentation maintenance: Self-sustaining
```

---

## Quick Decision Tree: Which Tier for You?

```
START HERE: Do you want to improve agent workflow discovery?
│
├─ "YES! Start this week"
│  └─→ Implement TIER 1 (4-6 hours)
│      Result: Agents find workflows in 5 min instead of 20 min ✅
│
├─ "YES, but we need it perfect"
│  └─→ Implement TIER 1 + TIER 2 (6-9 hours total)
│      Result: Perfect system + cleaner docs ✅✅
│
├─ "YES, we want full automation"
│  └─→ Implement TIER 1 + TIER 2 + TIER 3 (10-13 hours total)
│      Result: Self-maintaining, auto-discovery system ✅✅✅
│
├─ "Not sure, let me review first"
│  └─→ Read EXECUTIVE_SUMMARY (10 min) + STRATEGY (30 min)
│      Then: Decide which tier
│
└─ "No thanks"
   └─→ Status quo: Agents continue trial-and-error workflow discovery
       (Opportunity cost: ~400+ hours/year in lost time)
```

---

## Files to Review in Order

```
If you have 5 minutes:
├─ This file (you're reading it!)
└─ Done. You understand the concept.

If you have 20 minutes:
├─ This file ✓
├─ WORKFLOW_DOCUMENTATION_EXECUTIVE_SUMMARY.md
└─ Decision: Tier 1, Tier 2, or all 3?

If you have 1 hour (Recommended):
├─ This file ✓
├─ EXECUTIVE_SUMMARY (20 min)
├─ WORKFLOW_DOCUMENTATION_IMPROVEMENT_STRATEGY.md (30 min)
└─ Decision: Ready to implement

If you have 2 hours:
├─ All docs above ✓
├─ TIER_1_IMPLEMENTATION_GUIDE.md (30 min)
└─ Ready to start implementation Monday
```

---

## Next: Your Decision

```
┌─────────────────────────────────────────┐
│  What's Your Next Move?                 │
├─────────────────────────────────────────┤
│                                         │
│  [ ] Review the 3 strategy documents   │
│      (EXECUTIVE_SUMMARY + STRATEGY +   │
│       TIER_1_GUIDE) - 1 hour            │
│                                         │
│  [ ] Decide: Tier 1, 1+2, or 1+2+3?   │
│                                         │
│  [ ] Start Monday with Tier 1          │
│      (4-6 hours)                        │
│                                         │
│  [ ] Get agent feedback after Week 1   │
│                                         │
│  [ ] Proceed to Tier 2 (if good        │
│      feedback) next week                │
│                                         │
└─────────────────────────────────────────┘

Contact: Reach out if you have questions or need clarification
Timeline: Can be done this week if prioritized
Support: All templates + guides provided, ready to implement
```

---

**That's the full picture! Use this visual guide + the 3 detailed docs to move forward with confidence.** 🚀
