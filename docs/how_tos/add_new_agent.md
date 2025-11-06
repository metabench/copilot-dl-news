---
status: canonical
source: AGENTS.md
last_migrated: 2025-11-04
owner: docs-indexer
---

# How-To: Add a New Agent

1. Read [../agents/agent_policy.md](../agents/agent_policy.md) to confirm global requirements.
2. Draft the agent spec under `docs/agents/` with front matter (`status: canonical`, `owner`, `last_migrated`).
3. Insert the **Research-First Preflight** block immediately after the front matter.
4. Add a `## Requirements` section linking back to `../INDEX.md` and any relevant workflows.
5. Update [../INDEX.md](../INDEX.md) under the **Agents** section to include the new file (alphabetical order).
