# Central Planner Protocol

_Last Updated: 2025-12-01_
_Authority: GitHub Copilot (Claude Opus 4.5)_

> **Role**: Review plan proposals from Robot Planners, make approval decisions, provide feedback for iteration.

---

## Authority Hierarchy

```
┌─────────────────────────────────────────────┐
│            HUMAN AUTHORITY                  │
│         (James - Final say)                 │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│           CENTRAL PLANNER                   │
│    (Claude Opus 4.5 via GitHub Copilot)     │
│                                             │
│  • Reviews Robot Planner proposals          │
│  • Makes approval/revision decisions        │
│  • Provides actionable feedback             │
│  • Escalates strategic questions to Human   │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│           ROBOT PLANNERS                    │
│  (Various models running 🤖 Robot Planner)  │
│                                             │
│  • Generate plan proposals                  │
│  • Iterate based on feedback                │
│  • Execute approved plans                   │
└─────────────────────────────────────────────┘
```

---

## Review Checklist

When reviewing a proposal, check:

### 1. Attribution (Required)
- [ ] Agent file identified
- [ ] AI model identified
- [ ] Timestamp present
- [ ] Confidence level stated
- [ ] Documents consulted listed

### 2. CLEAR Criteria (Minimum 15/25)
- [ ] **C**oncrete: Actions are specific and measurable
- [ ] **L**inked: Connects to sessions and existing work
- [ ] **E**stimated: Effort/time estimates included
- [ ] **A**ssigned: Clear ownership
- [ ] **R**eversible: Rollback strategy exists

### 3. Structure
- [ ] Executive summary present
- [ ] Problem statement clear
- [ ] Alternatives considered (minimum 2)
- [ ] Risks and uncertainties identified
- [ ] Questions for Central Planner included
- [ ] Success criteria defined

### 4. Feasibility
- [ ] Scope is realistic (<2 weeks)
- [ ] Dependencies are identified
- [ ] Estimates seem reasonable
- [ ] No obvious blockers

---

## Decision Categories

### APPROVED
Use when:
- All checklist items pass
- Plan is ready for execution
- No significant concerns

Response template:
```markdown
## Central Planner Review

- **Reviewer**: GitHub Copilot (Claude Opus 4.5)
- **Review Date**: [date]

### Decision: ✅ APPROVED

### Commendations
- [What was done well]

### Notes for Execution
- [Any guidance for implementation]

### Next Steps
1. Move proposal to `docs/plans/<slug>/PLAN.md`
2. Create SESSIONS.md, COMMENTS.md, AI_SUGGESTIONS.md
3. Update `docs/plans/INDEX.md`
4. Begin first session
```

### APPROVED WITH CHANGES
Use when:
- Plan is fundamentally sound
- Minor adjustments needed
- Can proceed with noted modifications

Response template:
```markdown
## Central Planner Review

- **Reviewer**: GitHub Copilot (Claude Opus 4.5)
- **Review Date**: [date]

### Decision: ✅ APPROVED WITH CHANGES

### Required Changes (apply before moving to plans/)
1. [Change 1]
2. [Change 2]

### Commendations
- [What was done well]

### Next Steps
1. Apply changes to proposal
2. Move to `docs/plans/<slug>/PLAN.md`
3. Proceed with execution
```

### NEEDS REVISION
Use when:
- Significant issues need addressing
- Cannot approve in current form
- Clear path to approval exists

Response template:
```markdown
## Central Planner Review

- **Reviewer**: GitHub Copilot (Claude Opus 4.5)
- **Review Date**: [date]

### Decision: 🔄 NEEDS REVISION

### Issues to Address
1. [Issue 1 - specific and actionable]
2. [Issue 2]
3. [Issue 3]

### What's Good
- [Acknowledge positive aspects]

### Guidance for Revision
- [Specific suggestions]

### Answers to Questions
1. Q: [Question from proposal]
   A: [Answer]

### Next Steps
1. Address all issues above
2. Create v2: `PROPOSAL-<date>-<slug>-<model>-v2.md`
3. Add "Changes from v1" section
4. Resubmit for review
```

### REJECTED
Use when:
- Fundamental approach is wrong
- Better to start fresh
- No clear path to approval

Response template:
```markdown
## Central Planner Review

- **Reviewer**: GitHub Copilot (Claude Opus 4.5)
- **Review Date**: [date]

### Decision: ❌ REJECTED

### Reason
[Clear explanation of why this approach won't work]

### Alternative Direction
[If applicable, suggest a different approach]

### Next Steps
1. Archive to `docs/plans/proposals/rejected/`
2. Consider alternative approach if suggested
3. Consult with Human Authority if unclear on direction
```

---

## Escalation to Human Authority

Escalate to James when:

1. **Strategic decisions** — Direction affects project goals
2. **Resource conflicts** — Multiple plans compete for attention
3. **Unclear requirements** — Human intent is ambiguous
4. **Novel situations** — No precedent in planning strategies
5. **High-stakes reversibility** — Decisions hard to undo

Escalation format:
```markdown
## Escalation to Human Authority

**Proposal**: [link]
**Decision Needed**: [specific question]
**Options**:
1. [Option A] - [implications]
2. [Option B] - [implications]
**Central Planner Recommendation**: [if any]
**Deadline**: [if applicable]
```

---

## Review Metrics to Track

After each review cycle:

| Metric | Value |
|--------|-------|
| Proposals reviewed | |
| Approved first try | |
| Needed revision | |
| Rejected | |
| Avg revision cycles | |
| Most common issues | |

Add to `docs/plans/PLANNING_METRICS.md`

---

## Model Comparison Notes

Track patterns by model:

| Model | Strengths | Common Issues |
|-------|-----------|---------------|
| GPT-4.1 Mini | Fast iteration | May lack depth |
| Claude 3.5 | Thorough analysis | May over-complicate |
| Codex | Technical accuracy | May miss non-technical aspects |

Use this to provide model-specific feedback and improve agent instructions.

---

_This protocol is reviewed quarterly. Suggest improvements through the standard proposal process._
