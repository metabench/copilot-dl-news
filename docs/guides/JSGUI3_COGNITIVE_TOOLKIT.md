# jsgui3 Cognitive Toolkit

_Last Verified: 2025-01-09_

**Authority Level**: This is the **definitive reference** for research methods and cognitive strategies when working with jsgui3. Consult when stuck or starting new research.

**When to Read**:
- Starting a new jsgui3 research task
- Stuck on a problem for >10 minutes
- Choosing between research approaches
- After completing a task (for reflection)

---

## 🧠 Cognitive Strategy Selection

**Before starting ANY task**, consciously select the appropriate strategy:

| Situation | Strategy | Time Budget |
|-----------|----------|-------------|
| "I've seen this before" | Pattern matching → Execute | 2-5 min |
| "I know the area but not this specific thing" | Targeted search → Verify → Execute | 10-15 min |
| "This is new territory" | Deep research → Hypothesize → Test → Document | 30-60 min |
| "I'm stuck/confused" | Step back → Reformulate → Try different angle | 15 min reset |
| "I keep hitting walls" | Meta-analyze → Identify blockers → Change approach | Stop, reflect |

---

## ✅ Verified Effective Methods

| Method | When to Use | Success Rate | Notes |
|--------|-------------|--------------|-------|
| **Performance diagnostics** | Before ANY optimization | 100% | Create diagnostic script FIRST |
| **Control counting** | Slow renders | 95% | Walk `__ctrl_chain`, count total |
| **Terminal hypothesis testing** | Understanding runtime behavior | 95% | Create minimal `node -e` scripts |
| **Source grep + read** | Finding how something works | 90% | `grep_search` → `read_file` → understand |
| **Diagram before code** | Understanding complex flows | 85% | ASCII diagrams clarify thinking |
| **Compare to React/Vue** | Translating concepts | 80% | jsgui3 activation ≈ React hydration |
| **js-scan for dependencies** | Before refactoring | 95% | Always check `--what-imports` first |
| **md-scan for docs** | Finding relevant documentation | 90% | `node tools/dev/md-scan.js --search "<topic>"` |

---

## 🧪 Methods to Try (Experimental)

| Method | Hypothesis | Status |
|--------|------------|--------|
| LLM-assisted source reading | Ask targeted questions about code | Testing |
| Automated pattern detection | Find common idioms in codebase | Queued |
| Cross-session knowledge graphs | Link related discoveries | Concept |

---

## ❌ Methods That Failed (Anti-Patterns)

| Method | Why It Failed | Better Alternative |
|--------|---------------|-------------------|
| Reading entire source file | Too much noise, lost focus | Targeted search first |
| Guessing without testing | Wasted time on wrong paths | Always test hypotheses |
| Documenting after task complete | Forgot details, incomplete | Document as you discover |
| Assuming docs are complete | Missed undocumented behavior | Verify against source |

---

## 🔄 The OODA Loop for Research

```
    OBSERVE                 ORIENT
    ────────               ────────
    • Read source code     • Form mental model
    • Run test scripts     • Compare to known patterns
    • Check existing docs  • Identify gaps
         │                      │
         ▼                      ▼
    ┌─────────────────────────────────────┐
    │      DECISION GATE                  │
    │  ─────────────────────────────────  │
    │  Do I understand enough to act?     │
    │  YES → ACT                          │
    │  NO  → Loop back to OBSERVE         │
    │  STUCK → Escalate to metacognition  │
    └─────────────────────────────────────┘
         │                      │
         ▼                      ▼
      DECIDE                   ACT
      ──────                   ───
    • Choose approach        • Write code/docs
    • Set success criteria   • Run tests
    • Estimate confidence    • Validate understanding
```

---

## 🎯 Confidence Calibration

**Rate your confidence BEFORE acting**, then verify:

| Confidence | Meaning | Action |
|------------|---------|--------|
| 🟢 90%+ | "I've done this, I know it works" | Act directly, verify after |
| 🟡 60-90% | "I think I know, but should check" | Quick verification, then act |
| 🟠 30-60% | "I have a guess, uncertain" | Test hypothesis first |
| 🔴 <30% | "I don't know" | Research before acting |

**After acting**, check: Was my confidence calibrated correctly?
- If overconfident: Add to "Gotchas I Didn't Expect"
- If underconfident: Note the pattern for faster recognition

---

## 🔍 Using md-scan Effectively

```bash
# Search for topic across all docs
node tools/dev/md-scan.js --dir docs --search "lazy rendering" --json

# Search in specific directory
node tools/dev/md-scan.js --dir docs/guides --search "MVVM" --json

# Search session notes
node tools/dev/md-scan.js --dir docs/sessions --search "performance" --json
```

**md-scan returns**:
- Matching file paths
- Relevant excerpts with context
- Section headers for navigation

**When to use**:
- Starting any research task
- Looking for prior art
- Finding related session notes
- Checking if something is already documented

---

## 📋 Research Session Template

```markdown
# Session: jsgui3 Research - [Topic]

## Research Question
[What are you trying to understand?]

## Hypothesis
[Your prediction before investigation]

## Investigation Steps
1. [ ] Search existing docs: `node tools/dev/md-scan.js --search "<topic>"`
2. [ ] Read source code at [path]
3. [ ] Create test script
4. [ ] Run experiments
5. [ ] Document findings

## Findings
[What you discovered]

## Code Samples
[Working examples demonstrating the finding]

## Documentation Updates
- [ ] Updated relevant guide in `docs/guides/`
- [ ] Updated agent file if core pattern
- [ ] Created/updated lab experiment

## Open Questions
[What's still unclear?]
```

---

_Last updated: 2025-12-01_
