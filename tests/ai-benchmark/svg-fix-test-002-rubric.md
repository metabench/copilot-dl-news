# SVG-FIX-002 Evaluation Rubric

## Quick Reference

| Criterion | Weight | Pass Threshold |
|-----------|--------|----------------|
| Zero HIGH issues | 40% | Mandatory |
| Fix quality | 25% | No regressions |
| Documentation | 15% | Clear explanation |
| Tooling requests | 20% | Useful if made |

---

## Detailed Criteria

### 1. Validation Pass (40 points) — MANDATORY

| Score | Criteria |
|-------|----------|
| 40 | Zero 🔴 HIGH issues, all text readable |
| 20 | 1-2 HIGH issues remaining |
| 0 | 3+ HIGH issues OR validation not run |

**Automatic fail**: Any remaining HIGH issues after claiming completion.

---

### 2. Fix Quality (25 points)

| Score | Criteria |
|-------|----------|
| 25 | All fixes are clean, no regressions, visual quality maintained |
| 20 | Minor visual regressions (spacing slightly off) |
| 15 | Some elements moved but diagram still accurate |
| 10 | Fixes work but diagram looks worse |
| 0 | Broke more than fixed |

**Check for**:
- Did they introduce new overlaps?
- Is the diagram still accurate to the system?
- Are colors/theme preserved?

---

### 3. Fix Documentation (15 points)

| Score | Criteria |
|-------|----------|
| 15 | Clear summary of what was wrong and how each issue was fixed |
| 10 | Listed changes but no explanation of why |
| 5 | Vague description ("fixed some positions") |
| 0 | No documentation of changes |

---

### 4. Tooling Requests (20 points)

| Score | Criteria |
|-------|----------|
| 20 | Made clear, actionable request that would genuinely help |
| 15 | Request is reasonable but vague on specifics |
| 10 | Request duplicates existing capability (didn't read docs) |
| N/A | No request made — score based on other criteria |

**Good request characteristics**:
- Identifies specific limitation
- Provides concrete example input/output
- Explains use case clearly
- Feasible to implement

**If no request made**: Redistribute 20 points to other criteria (validation 50%, quality 30%, docs 20%).

---

## Scoring Guide

### Grade Calculation

| Grade | Score Range | Meaning |
|-------|-------------|---------|
| A | 90-100 | Excellent fix, validation passes, well-documented |
| B | 75-89 | Good fix with minor issues |
| C | 60-74 | Fixes work but incomplete or poorly documented |
| D | 40-59 | Partial fix, some HIGH issues remain |
| F | 0-39 | Failed to fix or made worse |

---

## Common Failure Patterns

| Failure | Cause |
|---------|-------|
| Claimed done without validation | Didn't run `svg-collisions.js` |
| Fixed one issue, created another | Didn't re-validate after changes |
| Massive position changes | Should make minimal targeted fixes |
| Truncated important text | Text shortened too aggressively |
| Broke theme consistency | Changed colors/fonts unnecessarily |
| Vague tooling request | "Need better tools" without specifics |

---

## Evaluator Notes Template

```markdown
## SVG-FIX-002 Evaluation

**Model**: [model name]
**Date**: [date]
**Evaluator**: [human/AI]

### Validation Result
- HIGH issues: [before] → [after]
- LOW issues: [before] → [after]
- Pass: YES/NO

### Fixes Made
1. [description]
2. [description]

### Tooling Request
- Made: YES/NO
- Quality: [excellent/good/poor/n/a]
- Summary: [one line]

### Scores
| Criterion | Points |
|-----------|--------|
| Validation | /40 |
| Fix Quality | /25 |
| Documentation | /15 |
| Tooling | /20 |
| **Total** | **/100** |

### Grade: [A/B/C/D/F]

### Notes
[Specific observations, suggestions for improvement]
```
