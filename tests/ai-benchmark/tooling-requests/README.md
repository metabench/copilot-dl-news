# Tooling Requests Log

This directory captures tooling improvement requests from AI agents during benchmark tests.

## Purpose

When an AI agent encounters a limitation in existing CLI tools, they can submit a formal request for improvements. This enables:
1. **Continuous improvement** — Tools evolve based on real usage
2. **Separation of concerns** — The fixing agent focuses on the fix; specialist agents handle tooling
3. **Knowledge capture** — We learn what capabilities are missing

## Request Format

Requests should follow this structure:

```markdown
## TOOLING REQUEST

**Tool**: [existing tool name or "NEW"]
**Current Limitation**: [what the tool doesn't do]
**Requested Feature**: [specific capability]
**Use Case**: [how it helps the task]
**Example Input/Output**: [concrete example]
```

## Processing Workflow

1. Agent submits request during test
2. Request logged here with timestamp and test ID
3. Specialist agent (CLI Tooling or Brain agent) reviews
4. If approved:
   - Tool improved/created
   - Request marked IMPLEMENTED
   - Linked to commit/PR
5. If rejected:
   - Reason documented
   - Alternative approach suggested

## Request Status

| Status | Meaning |
|--------|---------|
| 🆕 NEW | Just submitted, awaiting review |
| 🔍 REVIEWING | Under consideration |
| ✅ IMPLEMENTED | Tool updated, feature available |
| ❌ REJECTED | Not feasible or out of scope |
| 🔄 ALTERNATIVE | Different approach suggested |

## Requests

<!-- Add requests below this line -->
