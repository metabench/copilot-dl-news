---
type: role-specific-guides
format: individual-perspectives
date: 2025-11-13
purpose: Tailored talking points and perspectives for each team member role
---

# Workflow Documentation: Individual Role Guides

_How each team member should think about the proposal + how they'll contribute_

---

## 👨‍💼 JAMES: Project Lead

### Your Core Job
Make the decision: Yes or No to Tier 1?

### What You Care About
- ✅ ROI (will this actually save time?)
- ✅ Timeline (can we do this without derailing other work?)
- ✅ Risk (what could go wrong?)
- ✅ Team morale (will this help or frustrate agents?)
- ✅ Long-term sustainability (is this a one-off or ongoing?)

### The Quick Sell (5 minutes)
"We have a documented problem: agents waste 20-30 minutes per task searching for workflows. We have a simple solution: central Registry + Contribution Guide. Cost: 4-6 hours. Benefit: 650+ hours/year saved at team level. Risk: minimal. This is a 100:1 ROI decision."

### Key Talking Points
**On ROI:**
> "Even if we only realize 50% of the projected benefit, that's still 300+ hours saved per year. For 4-6 hours of work, that's a 50:1 return."

**On Timeline:**
> "We're not asking for weeks. This is 4-6 hours, distributed Mon/Wed/Fri next week. Everyone keeps their regular work flowing."

**On Risk:**
> "Worst case: agents don't use it and we're back where we started. Best case: massive wins. There's no middle ground where this makes things worse."

**On Sustainability:**
> "The proposal includes maintenance (15 min/week, clear process). We're not creating a new maintenance burden, we're codifying what we should already be doing."

**On Team Reception:**
> "Talk to Sam (AI Agent) and Jordan (Docs Lead). They've been asking for something like this. The team wants this."

### Your Questions for the Team
1. "Does anyone think this won't work?"
2. "Are we willing to do Tier 1 next week?"
3. "Who wants to lead the technical implementation?"
4. "Do we want feedback before Tier 2-3, or commit to the full plan now?"

### Your Decision Framework
**YES if**: Team agrees, timeline is feasible, volunteers step forward  
**NO if**: Multiple team members have blockers, timeline is unrealistic  
**CONDITIONAL**: "Let's do Tier 1, gather feedback, decide on Tier 2-3 afterward"

### Expected Objections & Responses

**Objection**: "Will agents actually use this?"  
**Response**: "That's why we're collecting feedback after Week 1. But the problem (20-30 min waste) is real, and the solution (5-min lookup) is obvious. I expect adoption will be high."

**Objection**: "What if we get swamped and can't maintain the Registry?"  
**Response**: "The maintenance plan is 15 min per week. If that becomes a burden, we know it in Week 2 and adjust. But this is less work than answering Slack questions about workflows."

**Objection**: "This feels like gold-plating documentation."  
**Response**: "It's the opposite. We're not creating new docs, we're organizing existing ones. We have 182 docs already. This makes them discoverable."

### Your Role in Implementation
1. **Kickoff** (Monday AM): Brief team, assign Alex + Jordan
2. **Checkpoint** (Wednesday PM): Quick sync, confirm on track
3. **Announcement** (Friday EOD): "New Registry is live, please try it"
4. **Feedback** (Weeks 2-3): Collect agent responses
5. **Decision** (Week 2 Friday): "Do we do Tier 2-3?"

### Success Metrics for You
- ✅ Tier 1 delivered by Friday EOD
- ✅ All links working
- ✅ Team announcement sent
- ✅ Positive initial feedback from agents
- ✅ >70% of agents using Registry in first week

---

## 👨‍💻 ALEX: Senior Backend Engineer / Implementation Lead

### Your Core Job
Build Tier 1 on schedule without letting other work suffer

### What You Care About
- ✅ Implementation complexity (is this actually doable in 4-6 hours?)
- ✅ Technical debt (are we creating something we'll regret?)
- ✅ Maintenance burden (am I signing up for forever?)
- ✅ Quality (will this actually work or just look good?)
- ✅ Team fit (does this align with how we work?)

### The Quick Sell (5 minutes)
"This is 4-6 hours of structured doc work (Registry, Contribution Guide, INDEX update). The implementation guide is templated. We're not building new tools, just organizing existing patterns. Low technical complexity, high team impact."

### Key Talking Points
**On Implementation:**
> "It's literally three files: WORKFLOW_REGISTRY.md (template + audit), WORKFLOW_CONTRIBUTION_GUIDE.md (detailed guide), updated INDEX.md (add section). Templates are provided."

**On Timeline:**
> "Mon-Tue: Registry (2h). Wed-Thu: Contribution Guide (2h). Fri: INDEX + testing (1h). That's 5 hours if we focus. I can do this without sacrificing other work."

**On Maintenance:**
> "15 min per week to check for new workflows + monthly review. That's not a burden. And we can rotate responsibility among Jordan, Sam, and Casey."

**On Quality:**
> "We're testing with Casey (new agent) Wednesday. If the Contribution Guide doesn't make sense to a fresh agent, we fix it before Friday."

**On Team Fit:**
> "This is how we should have been organizing workflows all along. We're not changing how agents work, we're making the invisible visible."

### Your Questions for the Team
1. "Does the 4-6 hour estimate feel realistic?"
2. "Jordan, can you own the INDEX.md piece?"
3. "Casey, are you willing to test the Contribution Guide Wednesday?"
4. "Morgan, any build/test/deploy concerns?"

### Your Decision Framework
**YES if**: Timeline is realistic, team owns maintenance, quality checks are in place  
**MAYBE if**: Need to bump non-critical work to make space  
**NO if**: This conflicts with critical deadlines or requires 20+ hours  

### Implementation Breakdown

**Monday-Tuesday (Registry)**
1. Read implementation guide (20 min)
2. Audit existing workflows (30 min)
   - Which are canonical? Which are scattered?
   - Make a list of 6-8 active workflows
3. Create WORKFLOW_REGISTRY.md structure (30 min)
   - Use template from guide
   - Add 6-8 workflows with metadata
4. Test all links (20 min)
5. Get Jordan's review (20 min)

**Wednesday-Thursday (Contribution Guide)**
1. Review existing guides (15 min)
   - Look at planning_review_loop.md for style
   - Look at doc_extraction_playbook.md for structure
2. Write comprehensive Contribution Guide (1h 15 min)
   - Follow template from implementation guide
   - Add 5-phase process + examples
3. Create 1-2 simple example workflows (30 min)
4. Get Casey's feedback on clarity (30 min)

**Friday (Polish & Test)**
1. Update INDEX.md with agent entry point (30 min)
2. Test all links across all files (20 min)
3. Get final review from Jordan (10 min)
4. Deploy to docs/

### Critical Success Factors
✅ Use templates from implementation guide (don't reinvent)  
✅ Test with Casey Wednesday (validation from new agent)  
✅ Keep Contribution Guide simple (agents need to understand it)  
✅ Maintain all links (nothing worse than broken docs)  

### Your Role Going Forward
- **Week 1**: Lead Tier 1 implementation
- **Week 2**: Help review agent feedback
- **Week 2+**: Help decide on Tier 2-3
- **Ongoing**: Rotate Registry maintenance (Jordan leads coordination)

### Success Metrics for You
- ✅ Tier 1 complete by Friday EOD
- ✅ All links tested and working
- ✅ Casey validates Contribution Guide Wednesday
- ✅ Zero technical issues
- ✅ Clear handoff to Jordan for maintenance

---

## 🤖 SAM: AI Agent / Automation Specialist

### Your Core Job
Validate this solves your problem + champion adoption

### What You Care About
- ✅ Discoverability (can I find workflows fast?)
- ✅ Usability (are they documented clearly?)
- ✅ Contribution (can I easily add new workflows?)
- ✅ Reliability (are workflows tested before Registry?)
- ✅ Time savings (do I actually save 15-25 min?)

### The Quick Sell (5 minutes)
"Stop searching Slack for 20 minutes. Start finding workflows in 5 minutes. Can contribute your own patterns systematically. This is designed for exactly what you do."

### Key Talking Points
**On Problem:**
> "Every week I ask 'Is there a pattern for X?' and either nobody knows or I find something in a 2-month-old Slack thread. This fixes that."

**On Solution:**
> "Central Registry means one place to look. Clear Contribution Guide means I can share patterns without 'Is this the right way to do it?'"

**On Impact:**
> "Conservative estimate: 15 min saved per task. I do 5 tasks/week. That's 1.25 hours/week saved for me alone. Multiply that across 10 agents and we're talking real time."

**On Quality:**
> "Love that workflows need to be tested 2-3 times before Registry. Means I trust them. No half-baked patterns."

**On Your Role:**
> "Honestly? This is designed for me. I'm the use case. Happy to help validate and champion adoption with other agents."

### Your Questions for the Team
1. "When's this live? Because I have a batch-rename workflow I want to add."
2. "Can we announce this Monday so I can start using it?"
3. "Should we collect metrics (how many times workflows are used) in the Registry?"

### Your Decision Framework
**YES**: Obviously. You've been waiting for this.  
**NO**: Only if it's so complex that new agents won't be able to use it (unlikely).

### Your Talking Points for Other Agents
**To experienced agents:**
> "Remember when you figured out [pattern]? Save 3 other agents from learning it the hard way. Add it to the Registry. Takes 20 minutes."

**To new agents:**
> "Lost? Check the Workflow Registry before asking Slack. 90% of your questions are answered there."

**To busy agents:**
> "I know you're slammed, but this saves time. 5 min lookup vs. 20 min searching. The math works."

### How You'll Use It (Day 1)
1. **Monday EOD**: Registry goes live
2. **Tuesday AM**: Look for "batch rename" workflow (should be there)
3. **Tuesday PM**: Try a batch rename task using the workflow
4. **Tuesday EOD**: Message team: "Saved 20 minutes. This works!"

### Your Role in Implementation
- **Wednesday**: Test Contribution Guide with Casey
  - Ask: "Is this clear enough for new agents?"
  - Offer: "I've written patterns before, here's what confused me"
- **Week 2**: Champion adoption
  - Use Registry publicly
  - Ask other agents "Have you seen the Registry?"
  - Share time-savings wins

### Success Metrics for You
- ✅ Registry live by Friday
- ✅ Can find "batch rename" workflow immediately
- ✅ Workflow is clear and works first time
- ✅ You save 15+ minutes on your next similar task
- ✅ At least 3 other agents adopt within Week 1

---

## 📚 JORDAN: Documentation Lead

### Your Core Job
Own Registry governance + ensure it stays maintained long-term

### What You Care About
- ✅ Governance (who owns what? Clear roles?)
- ✅ Consistency (all workflows follow same structure?)
- ✅ Sustainability (won't become abandoned doc?)
- ✅ Quality (are workflows tested before Registry?)
- ✅ Integration (how does this fit into existing doc structure?)

### The Quick Sell (5 minutes)
"This solves the doc fragmentation problem we've been struggling with. Clear governance model, maintenance schedule, quality gates. This is how documentation should work."

### Key Talking Points
**On Problem:**
> "We have 182 docs and agents are still lost. It's not about quantity, it's about discovery. Registry fixes this."

**On Governance:**
> "Clear: Registry owners rotate responsibility. Monday: we audit and populate. Going forward: 15 min/week maintenance, 1h/month deep review."

**On Sustainability:**
> "Lifecycle policy: Active (indefinite), Experimental (1 month), Deprecated (mark + archive), Archived (history only). This prevents stale docs."

**On Quality:**
> "Workflows must be tested 2-3 times before Registry entry. This isn't a dumping ground, it's a curated collection."

**On Integration:**
> "Fits perfectly with existing INDEX.md structure. Actually improves the hub. Makes it a real navigation center for agents."

### Your Questions for the Team
1. "Alex, can you own Registry creation? I'll own Contribution Guide + INDEX."
2. "Can we commit to 15 min/week maintenance rotation?"
3. "Casey, would you help validate the Contribution Guide Wednesday?"
4. "Morgan, any concerns about this from your end?"

### Your Implementation Plan

**Mon-Tue: INDEX.md Update**
1. Read current INDEX (15 min)
2. Design agent quick-start section (20 min)
3. Write new intro + quick-start (30 min)
4. Link to Registry + Contribution Guide (10 min)
5. Get James' review (15 min)

**Wed-Thu: Contribution Guide (Lead with Alex)**
1. Read implementation guide template (10 min)
2. Draft Contribution Guide (1h)
3. Add 5-phase process + examples (30 min)
4. Test with Casey: Is it clear? (30 min)
5. Revise based on feedback (15 min)

**Friday: Final Links + Review**
1. Ensure all links work (20 min)
2. Final governance document (20 min)
3. Maintenance schedule (10 min)
4. Team review & go-live (10 min)

### Governance Document (Create Friday)
```markdown
# Workflow Registry Governance

## Ownership
- Registry Editor: Jordan (can be rotated monthly)
- Registry Auditor: Alex
- Maintenance Coordinator: Sam

## Maintenance Schedule
- Weekly (15 min): Check for new workflows, add promising ones to experimental
- Monthly (1h): Deep review, promote experimental to active, archive old ones
- Quarterly (30 min): Full audit, consolidate duplicates, update lifecycle

## Quality Gates
- Workflows must be tested 2-3 times minimum
- Latest status must be within 6 months
- All links must be tested before Registry update

## Lifecycle
- Active: In use, tested, maintained
- Experimental: New, being validated (max 1 month)
- Deprecated: Superseded, link to replacement
- Archived: Historical only, no longer recommended
```

### Your Role Going Forward
- **Week 1**: Lead Tier 1 creation
- **Week 2+**: Coordinate maintenance rotation
- **Monthly**: Perform deep Registry review
- **Quarterly**: Full governance audit

### Success Metrics for You
- ✅ Tier 1 delivered on time
- ✅ INDEX.md redesign is clear and helpful
- ✅ Contribution Guide is comprehensive
- ✅ Governance model is clearly documented
- ✅ Maintenance schedule is established and followed

---

## 🆕 CASEY: New Onboarding Agent / Test Case

### Your Core Job
Validate this works for new agents + help design entry point

### What You Care About
- ✅ Learning curve (is it easy for new agents?)
- ✅ Discovery (can I find what I need?)
- ✅ Contribution (can I easily add my own workflows?)
- ✅ Entry point (where do I start as a new agent?)
- ✅ Clarity (are instructions clear or confusing?)

### The Quick Sell (5 minutes)
"You're the test case. Your job: try the Contribution Guide Wednesday and tell us if it makes sense. If it's confusing to you, it'll be confusing to future agents. We fix it before Friday."

### Key Talking Points
**On Why You're Important:**
> "You're 3 months in. You remember being lost. Perfect perspective for validating this. Your feedback is critical."

**On Your Role:**
> "Not major work. Wednesday afternoon: read the Contribution Guide, try to create a dummy workflow, tell us if it's clear."

**On Future Agents:**
> "Every agent coming after you benefits from this. If you find something confusing, we fix it now. That's huge."

### Your Testing Script (Wednesday Afternoon)

**Part 1: Read Contribution Guide (15 min)**
- Go through the 5 phases
- Ask: What's confusing?
- Note: What would help new agents?

**Part 2: Try to Create a Dummy Workflow (30 min)**
- Pick a task you did recently
- Document it as if you were following Phase 1
- Try to format it as Phase 3 (canonical workflow)
- Add it to a test Workflow Registry
- Ask: How hard was that?

**Part 3: Feedback (15 min)**
- What was clear?
- What was confusing?
- What would make this easier?
- Would you use this as a new agent?

### Your Feedback Questions for the Team
1. "Is the 5-phase process too many steps?"
2. "Were the templates helpful or overwhelming?"
3. "Would you have needed this 3 months ago?"
4. "What would have helped you onboard faster?"

### Expected Feedback (Helping Alex & Jordan)

**You might say:**
> "Phase 1 is great (I already document in session notes).
> Phase 2 is confusing (what does 'validate' mean exactly?).
> Phase 3 template is helpful (example workflow made sense).
> Phase 4 Registry entry is easy (just fill in the table row).
> Phase 5 linking is good (shows how it all connects)."

**Or:**
> "Actually, this is clearer than I expected.
> I was worried it would be complicated but the steps are logical.
> Love that there's a template to copy.
> Only thing: maybe add a flowchart showing the 5 phases?
> Also: what if I'm not sure if my workflow is 'ready'?"

### Your Role Going Forward
- **Wed**: Test Contribution Guide, provide feedback
- **Fri**: See it go live, celebrate with team
- **Week 2**: Use Registry as a new agent would
  - Try finding a workflow
  - Try following workflow steps
  - Report back: "Did it work?"
- **Week 2+**: Help onboard next agent
  - Show them the Registry
  - Walk them through quick-start
  - See if it's as helpful as intended

### Success Metrics for You
- ✅ Contribution Guide makes sense to you Wednesday
- ✅ Can follow 5-phase process without confusion
- ✅ Template is helpful and not overwhelming
- ✅ Registry entry is straightforward
- ✅ By Week 2: Registry has saved you time

---

## ⚡ MORGAN: DevOps / Infrastructure

### Your Core Job
Ensure this doesn't break anything + stay in the loop

### What You Care About
- ✅ Build impact (does this change CI/CD?)
- ✅ Test impact (does this affect test setup?)
- ✅ Deployment (do we need to deploy anything?)
- ✅ Monitoring (do we need to monitor this?)
- ✅ Rollback (if something breaks, how do we fix it?)

### The Quick Sell (5 minutes)
"This is pure documentation. No code changes, no build changes, no test runner changes. Your concern: none. Status: you can ignore this unless something breaks."

### Key Talking Points
**On Build:**
> "No build changes. This is markdown files in /docs. Git tracks it, but no deployment needed."

**On Tests:**
> "No test changes. We're not modifying test runners or adding test dependencies."

**On Deployment:**
> "No deployment. Just commit docs to git. Agents access them locally or via repo."

**On Monitoring:**
> "No monitoring needed. If links break, we find out when agents report it."

**On Rollback:**
> "If we need to rollback, just revert git commits. Literally 30 seconds."

### Your Questions for the Team
1. "Does this require any infrastructure changes? [No]"
2. "Will this affect CI/CD at all? [No]"
3. "Do I need to monitor anything? [No]"
4. "Can I proceed as normal? [Yes]"

### Your Role in This
**Minimal**:
1. Stay in Slack channel (FYI on progress)
2. If something breaks (unlikely), help investigate
3. Otherwise: nothing required

### Success Metrics for You
- ✅ No infrastructure changes needed
- ✅ No deployment issues
- ✅ No test runner issues
- ✅ Can proceed with other work normally

---

## Quick Role Summary Table

| Role | Effort | Impact | Key Concern | Go/No-Go |
|------|--------|--------|------------|----------|
| **James** | Decision (1h) | Strategic | ROI + Risk | GO if team agrees |
| **Alex** | Implementation (6h) | Technical | Timeline + Quality | GO if realistic |
| **Sam** | Champion (2h) | User | Solves problem? | YES (obvious) |
| **Jordan** | Ownership (5h) | Governance | Sustainability | GO if maintained |
| **Casey** | Validation (2h) | Feedback | Works for new agents? | GO (built-in test) |
| **Morgan** | Monitor (0h) | Oversight | Breaks anything? | YES (nothing breaks) |

---

## Team Consensus Prediction

**After real meeting, you can expect:**

✅ **James**: "Let's do this. Alex, Jordan, you lead. Be done by Friday."  
✅ **Alex**: "Timeline is realistic. I'm in. Jordan, let's sync Wednesday."  
✅ **Sam**: "Finally! I'll help with promotion once it's live."  
✅ **Jordan**: "Excited to own Registry governance. Tier 2-3 after feedback."  
✅ **Casey**: "Happy to test Wednesday. Hope this helps future agents!"  
✅ **Morgan**: "No concerns on my end. Proceed as planned."  

**Overall**: **Unanimous yes** to Tier 1, with enthusiasm from Sam and Jordan.

---

## How to Use These Role Guides

### Before the Meeting
- Share these with team members in advance
- Say: "Here's what we see as your perspective. Anything missing?"
- Lets people prepare thoughtful responses

### During the Meeting
- Reference these if discussion stalls
- "Sam, from your perspective as an agent..."
- Ensures all viewpoints are heard

### After the Meeting
- Use these to coordinate roles
- "Alex, you own tech. Jordan, you own docs. Casey, you validate."
- Clear accountability

### Ongoing
- Reference these as work progresses
- "Alex, how's the timeline looking?"
- "Casey, any issues with the Contribution Guide clarity?"

---

**These guides show: Different roles have different concerns, but all concerns are addressed by the proposal. Everyone can say yes with confidence.** ✅
