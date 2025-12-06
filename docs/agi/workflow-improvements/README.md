# Workflow Improvement Proposals

This directory stores AGI-generated workflow improvement proposals.

## Purpose

When an AI agent identifies an opportunity to optimize a workflow in `docs/workflows/`, it uses the `proposeWorkflowImprovement` MCP tool to create a structured proposal here.

## Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│                  WORKFLOW IMPROVEMENT CYCLE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │  DETECT  │───▶│ PROPOSE  │───▶│  REVIEW  │───▶│  APPLY   │      │
│  │(agent)   │    │(agent)   │    │(human)   │    │(either)  │      │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘      │
│       │                │                │              │            │
│       ▼                ▼                ▼              ▼            │
│  getWorkflow     Proposal saved    Approve/Reject   Update         │
│  shows hooks     here with         with feedback    original       │
│                  status:pending                     workflow       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Proposal Structure

Each proposal file contains:

- **Summary**: One-sentence description of the improvement
- **Current Issues**: What problems were identified
- **Proposed Changes**: Specific modifications suggested
- **Expected Benefits**: Why this improves the workflow
- **Risk Assessment**: Potential downsides
- **Validation Criteria**: How to verify the improvement worked

## Status Values

| Status | Meaning |
|--------|---------|
| `pending-review` | New proposal awaiting review |
| `approved` | Reviewed and approved for implementation |
| `rejected` | Reviewed and rejected (reason in file) |
| `applied` | Changes have been applied to the workflow |

## AGI Singularity Alignment

This system enables **recursive self-improvement** of the agent knowledge base:

1. Agents follow workflows to complete tasks
2. During execution, agents identify inefficiencies
3. Agents propose improvements via MCP tools
4. Human review ensures quality control
5. Approved improvements benefit all future agents

## Files

Proposals are named: `{workflow-name}-{timestamp}.md`

Example: `tier1_tooling_loop-2025-12-03T10-30-45.md`
