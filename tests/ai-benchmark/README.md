# AI Benchmark Tests

This directory contains benchmark tests for evaluating AI model capabilities on tasks specific to this codebase.

## Purpose

These tests serve multiple goals:

1. **Evaluate AI models** - Compare how different models perform on structured tasks
2. **Improve instructions** - Learn what makes instructions clear and actionable
3. **Document systems** - The artifacts produced (SVGs, docs) become project documentation
4. **Research methodology** - Understand how AIs research and synthesize information

---

## Test Catalog

| ID | Type | Difficulty | Subject | Status |
|----|------|------------|---------|--------|
| [SVG-GEN-001](svg-generation-test-001.md) | SVG Generation | Moderate | Fact-Based Classification System | Active |
| [SVG-FIX-002](svg-fix-test-002.md) | SVG Debugging/Repair | Moderate | Fix broken layout in existing SVG | Active |

---

## Tooling Request Protocol

Tests may include the ability for agents to **request tooling improvements**. This is tracked in:
- `tooling-requests/README.md` — Request log and status
- Individual request files with timestamps

When an agent submits a tooling request:
1. It's logged in `tooling-requests/`
2. A specialist agent (CLI Tooling or Brain) reviews
3. Approved requests are implemented
4. The requesting agent can continue with available tools

---

## Running a Test

### For the AI being tested:

1. Read the test file (e.g., `svg-generation-test-001.md`)
2. Follow the Research Phase instructions
3. Generate the requested artifact
4. Self-validate if tools are available

### For the evaluator:

1. Use the rubric file (e.g., `svg-generation-test-001-rubric.md`)
2. Score each criterion
3. Note specific successes and failures
4. Provide feedback for improvement

---

## Test Categories

### SVG Generation Tests (SVG-GEN-xxx)
- Input: Design docs + source code
- Output: Valid SVG diagram
- Evaluates: Research ability, visual design, technical accuracy

### SVG Fix/Repair Tests (SVG-FIX-xxx)
- Input: Broken SVG + validation tool output
- Output: Fixed SVG passing validation
- Evaluates: Debugging ability, spatial reasoning, tool usage, tooling request clarity

### Documentation Tests (DOC-xxx)
- Input: Code + existing partial docs
- Output: Comprehensive documentation
- Evaluates: Code comprehension, writing clarity, completeness

### Refactoring Tests (REF-xxx)
- Input: Code needing improvement
- Output: Refactored code + explanation
- Evaluates: Pattern recognition, code quality, risk awareness

---

## Adding New Tests

When creating a new benchmark test:

1. **Choose an under-documented area** - More value in testing novel synthesis
2. **Create test file** - Clear instructions, specific requirements
3. **Create rubric** - Objective scoring criteria, common failure modes
4. **Add to catalog** - Update this README with the new test
5. **Validate difficulty** - Have a human or strong AI attempt it first

### Test File Template

```markdown
# AI [Type] Benchmark Test #[XXX]

**Test ID:** [TYPE]-XXX
**Difficulty:** Easy | Moderate | Hard
**Time Budget:** X-Y minutes
**Subject:** [What's being tested]

---

## Your Task
[Clear statement of what to produce]

---

## Research Phase (X minutes)
[Files to read, concepts to understand]

---

## Requirements
[Specific deliverables and constraints]

---

## Evaluation Criteria
[How the output will be judged]

---

## Hints
[Optional guidance]
```

---

## Results Archive

Results from running these tests will be stored in subdirectories:

```
tests/ai-benchmark/
├── README.md (this file)
├── svg-generation-test-001.md
├── svg-generation-test-001-rubric.md
└── results/
    └── svg-gen-001/
        ├── claude-opus-4-2025-01-03.svg
        ├── claude-opus-4-2025-01-03-score.md
        ├── gpt-4-2025-01-03.svg
        └── gpt-4-2025-01-03-score.md
```

---

## Learnings

After running tests, document learnings here:

### Instruction Clarity
- [What made instructions effective?]
- [What caused confusion?]

### AI Capabilities
- [Which models excelled at which tasks?]
- [Common failure patterns?]

### Process Improvements
- [How to make tests more useful?]
