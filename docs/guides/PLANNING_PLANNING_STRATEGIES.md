# Planning Planning Strategies

_Last Updated: 2025-12-01_
_Author: GitHub Copilot (Claude Opus 4.5)_

> **Meta-Level**: This document is about how to plan planning systems.
> It is itself a product of planning-planning-planning.

---

## The Planning Hierarchy

```
Level 0: DOING
   └── Execute tasks, write code, run commands
   
Level 1: PLANNING
   └── Create plans for doing (sessions, task lists)
   
Level 2: PLANNING PLANNING (this document)
   └── Design systems that create plans
   └── Define how agents should approach planning
   └── Establish review/approval workflows
   
Level 3: PLANNING PLANNING PLANNING
   └── Strategize about how to design planning systems
   └── Meta-analysis of planning effectiveness
   └── Evolution of planning methodologies
```

**Key Insight**: Each level requires different cognitive modes:
- Level 0: Tactical execution
- Level 1: Strategic sequencing  
- Level 2: System design
- Level 3: Philosophical reflection

---

## Why Planning Planning Matters

### The Complexity Trap

When building a planning system (like the AI Project Planner), you face:

1. **Premature optimization** — Designing elaborate workflows before understanding needs
2. **Under-planning** — Building ad-hoc and accumulating technical debt
3. **Analysis paralysis** — Spending more time planning than building
4. **Scope creep** — Plans that grow unboundedly

### The Solution: Explicit Meta-Planning

By documenting HOW we plan, we:
- Reduce cognitive load (don't re-invent the wheel each time)
- Enable delegation (other agents can follow the methodology)
- Create accountability (decisions are traceable)
- Allow improvement (we can iterate on the process itself)

---

## Core Planning Strategies

### Strategy 1: Fractal Decomposition

**Principle**: Every plan can be decomposed into smaller plans with the same structure.

```
Project Plan (weeks-months)
├── Phase Plan (days-weeks)
│   ├── Session Plan (hours-days)
│   │   ├── Task Plan (minutes-hours)
│   │   │   └── Step (seconds-minutes)
```

**Application**: When a plan feels too large, fracture it. When too small, aggregate upward.

**Anti-pattern**: Mixing granularities in the same document.

---

### Strategy 2: Confidence-Gated Detail

**Principle**: Detail should be proportional to confidence.

| Confidence | Detail Level | Example |
|------------|--------------|---------|
| High (>80%) | Full specification | "Create UserService.js with methods: create, update, delete" |
| Medium (50-80%) | Objectives + constraints | "Need user management, must integrate with existing auth" |
| Low (<50%) | Questions to answer | "How should users be modeled? Research existing patterns" |

**Application**: Don't over-specify uncertain work. Don't under-specify certain work.

**Anti-pattern**: Writing detailed plans for exploratory work.

---

### Strategy 3: Reversibility Awareness

**Principle**: Plan risky/irreversible decisions more carefully.

```
┌─────────────────────────────────────────────────────────────┐
│                    REVERSIBILITY MATRIX                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  HIGH EFFORT TO REVERSE                                     │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │    PLAN DEEPLY      │  │   PLAN DEEPLY +     │          │
│  │    Get approval     │  │   Multiple reviews  │          │
│  │                     │  │   Rollback strategy │          │
│  └─────────────────────┘  └─────────────────────┘          │
│        Low Impact              High Impact                  │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │    PLAN LIGHTLY     │  │   PLAN MODERATELY   │          │
│  │    Just do it       │  │   Document decision │          │
│  │                     │  │                     │          │
│  └─────────────────────┘  └─────────────────────┘          │
│  LOW EFFORT TO REVERSE                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Application**: Database schema changes need deep planning. CSS tweaks don't.

---

### Strategy 4: Stakeholder Mapping

**Principle**: Identify who cares about each part of the plan.

For the AI Project Planner:

| Component | Stakeholders | Their Concerns |
|-----------|--------------|----------------|
| File structure | Agents, Humans | Discoverability, simplicity |
| UI design | Humans | Usability, aesthetics |
| AI suggestions | Humans | Quality, actionability |
| Session linking | Agents | Automation, consistency |

**Application**: Consult stakeholders proportionally to their stake.

---

### Strategy 5: Time-Boxed Iteration

**Principle**: Plan in fixed time increments, then reassess.

```
Week 1: Minimal viable plan → Build → Learn
Week 2: Revised plan based on learnings → Build → Learn
Week 3: Refined plan → Build → Stabilize
```

**Application**: Never plan more than 2 weeks ahead in detail.

**Anti-pattern**: Creating 6-month detailed roadmaps.

---

## The Multi-Agent Planning Workflow

### Roles in the Planning Ecosystem

```
┌─────────────────────────────────────────────────────────────────┐
│                    PLANNING AUTHORITY HIERARCHY                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    HUMAN AUTHORITY                       │   │
│  │           (James - Final strategic decisions)            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   CENTRAL PLANNER                        │   │
│  │        (Claude Opus 4.5 - Plan review & approval)        │   │
│  │        Reviews proposals, makes final plan decisions     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│              ┌───────────────┼───────────────┐                  │
│              ▼               ▼               ▼                  │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │  Robot Planner  │ │  Robot Planner  │ │  Robot Planner  │   │
│  │  (GPT-4.1 Mini) │ │  (Claude 3.5)   │ │  (Codex)        │   │
│  │  Fast iteration │ │  Deep analysis  │ │  Code-focused   │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
│              │               │               │                  │
│              └───────────────┴───────────────┘                  │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 SPECIALIST AGENTS                        │   │
│  │   🧠 Research   💡 UI    🤖 Executor   📊 Database       │   │
│  │   Contribute domain expertise to plans                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Mandatory Attribution

**CRITICAL**: Every plan contribution MUST include:

```markdown
## Contribution Metadata
- **Agent**: 🤖 Robot Planner 🤖
- **Agent File**: `.github/agents/🤖 Robot Planner 🤖.agent.md`
- **AI Model**: GPT-4.1 Mini (or Claude 3.5 Sonnet, etc.)
- **Timestamp**: 2025-12-01T14:30:00Z
- **Confidence**: 75%
- **Dependencies**: [list of docs/files consulted]
```

This enables:
- Traceability of decisions
- Model performance comparison
- Debugging when plans fail
- Knowledge of agent capabilities

---

## Plan Proposal Protocol

### Step 1: Robot Planner Creates Proposal

```markdown
# Plan Proposal: [Title]

## Metadata
- Agent: 🤖 Robot Planner 🤖
- Agent File: .github/agents/🤖 Robot Planner 🤖.agent.md  
- Model: GPT-4.1 Mini
- Created: 2025-12-01

## Executive Summary
[2-3 sentences]

## Proposed Approach
[Detailed plan]

## Alternatives Considered
1. [Alternative A] - Why rejected
2. [Alternative B] - Why rejected

## Uncertainties
- [What I'm not sure about]

## Questions for Central Planner
1. [Specific question needing decision]

## Estimated Effort
- Planning: X hours
- Implementation: Y hours
- Review: Z hours
```

### Step 2: Central Planner Reviews

The Central Planner (Claude Opus 4.5) reviews and responds:

```markdown
## Central Planner Review

- Reviewer: GitHub Copilot (Claude Opus 4.5)
- Review Date: 2025-12-01

### Decision: APPROVED / APPROVED WITH CHANGES / NEEDS REVISION / REJECTED

### Feedback
[Specific feedback on the proposal]

### Required Changes (if any)
1. [Change 1]
2. [Change 2]

### Answers to Questions
1. [Answer to question 1]

### Next Steps
[What should happen now]
```

### Step 3: Iteration

If `NEEDS REVISION`:
- Robot Planner revises based on feedback
- Resubmits with change log
- Cycle continues until approved

---

## Plan Quality Criteria

### The CLEAR Framework

| Criterion | Question | Score 1-5 |
|-----------|----------|-----------|
| **C**oncrete | Are actions specific and measurable? | |
| **L**inked | Does it connect to sessions and existing work? | |
| **E**stimated | Are effort/time estimates included? | |
| **A**ssigned | Is it clear who does what? | |
| **R**eversible | Is there a rollback strategy? | |

**Minimum passing score**: 15/25

### Red Flags in Plans

- ❌ "We should think about..." (vague)
- ❌ No estimated effort
- ❌ No success criteria
- ❌ Missing dependencies
- ❌ No agent/model attribution
- ❌ Scope larger than 2 weeks
- ❌ No questions or uncertainties (overconfidence)

### Green Flags in Plans

- ✅ Specific, numbered steps
- ✅ Time-boxed phases
- ✅ Clear ownership
- ✅ Links to existing sessions
- ✅ Explicit uncertainties acknowledged
- ✅ Multiple alternatives considered
- ✅ Full attribution metadata

---

## When to Use Which Strategy

| Situation | Strategy | Rationale |
|-----------|----------|-----------|
| New feature | Fractal Decomposition | Break into manageable chunks |
| Uncertain requirements | Confidence-Gated Detail | Don't over-plan unknowns |
| Database changes | Reversibility Awareness | High cost of mistakes |
| Multi-stakeholder | Stakeholder Mapping | Align expectations early |
| Learning project | Time-Boxed Iteration | Adapt as you learn |

---

## The Planning-Planning Feedback Loop

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│   1. OBSERVE                          2. ANALYZE               │
│   ┌──────────────────┐               ┌──────────────────┐     │
│   │ How did plans    │ ───────────▶  │ What patterns    │     │
│   │ perform?         │               │ emerge?          │     │
│   └──────────────────┘               └──────────────────┘     │
│          ▲                                    │                │
│          │                                    ▼                │
│   ┌──────────────────┐               ┌──────────────────┐     │
│   │ Execute new      │ ◀───────────  │ Improve planning │     │
│   │ plans            │               │ strategies       │     │
│   └──────────────────┘               └──────────────────┘     │
│   4. APPLY                           3. ADAPT                  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

Every month, review:
1. Which plans succeeded? Why?
2. Which plans failed? Why?
3. What planning strategies worked?
4. How should this document evolve?

---

## Quick Reference: Planning Checklist

Before creating any plan:

- [ ] What level is this? (Doing / Planning / Planning-Planning)
- [ ] Who are the stakeholders?
- [ ] What's my confidence level?
- [ ] How reversible are the decisions?
- [ ] What's the time horizon?
- [ ] Have I included full attribution?
- [ ] Have I linked to relevant sessions?
- [ ] Have I stated my uncertainties?

---

## Appendix: Glossary

| Term | Definition |
|------|------------|
| **Central Planner** | The authority that reviews and approves plans (currently Claude Opus 4.5) |
| **Robot Planner** | An agent whose primary role is generating plan proposals |
| **Plan Proposal** | A structured document proposing a course of action |
| **Planning-Planning** | Designing systems and strategies for creating plans |
| **Meta-Planning** | Synonym for Planning-Planning |
| **Attribution** | Identifying which agent and model contributed to a plan |
| **Confidence-Gated** | Adjusting detail based on certainty level |
| **Fractal Decomposition** | Breaking plans into self-similar smaller plans |

---

_This document should be reviewed and updated quarterly, or whenever planning failures reveal gaps in the methodology._
