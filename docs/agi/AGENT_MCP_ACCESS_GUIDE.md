# Agent MCP Access Guide

> **TL;DR**: If MCP tools are present in your tool list, invoke them directly—no client setup required.
>
> If you *don’t* see the expected docs-memory tools (sessions/workflows/patterns), your environment may be exposing only a subset. In that case:
> - Use the relevant tool-category “activation” functions (if available), or
> - Fall back to the repo CLIs (`md-scan`, `what-next`).

---

## Overview

## Memory Retrieval Ritual (Skills → Sessions → Lessons)

Use this as your default “don’t reinvent it” sequence:

1. **Skills first**: Check the Skills registry at `docs/agi/SKILLS.md`. If a Skill matches the task, follow its SOP.
2. **Then sessions**: Find/continue a prior session on the topic and read the latest `PLAN.md` + `SESSION_SUMMARY.md` (avoid duplicating work).
3. **Then stable memory**: Pull relevant snippets from `docs/agi/LESSONS.md`, `PATTERNS.md`, and `ANTI_PATTERNS.md`.
4. **Write back**: When you learn something reusable, append 1–3 durable updates (Lesson/Pattern/Anti-Pattern) and record evidence in the active session’s `WORKING_NOTES.md`.

If you are about to **modify an MCP server that touches memory** (especially `tools/mcp/docs-memory/mcp-server.js`), consult the Skill:

- `docs/agi/skills/mcp-memory-server-surgery/SKILL.md`

## User-Visible Memory Load Feedback (required)

When you consult the memory system, emit a **short, emoji-based “memory loaded” summary** so the user can see what you accessed.

Rules:
- Keep it **1–2 lines max**.
- Include the **source** (docs-memory vs CLI fallback) and **what you loaded** (Skill names, session hits count, etc.).
- Avoid spam: emit the badge **once per distinct retrieval** (or when the source/loaded items change). Don’t repeat it every message.
- If MCP tools are missing/unhealthy, explicitly say you fell back.

Copy/paste templates:
- `🧠 MEMORY — Skills=<name1>, <name2> | Sessions=<n> hits | Lessons/Patterns=<skimmed|none>`
- `🧠 MEMORY — docs-memory: OK | Skills=<...> | Sessions=<...>`
- `🧠 MEMORY — docs-memory: unavailable → fallback md-scan (docs/agi: <n> hits, docs/sessions: <n> hits)`

## Instruction Adherence Loop (Snapshot → Task Ledger → Re-anchor)

This repo has a lot of instruction sources (system/developer/mode files, AGENTS.md, Skills, sessions). To avoid drift:

1. **Snapshot**: In the active session `WORKING_NOTES.md`, capture an “Instruction Snapshot” (objective, must-do, must-not, evidence).
2. **Task ledger**: Keep a small task list that separates the *parent objective* from *detours*.
3. **Re-anchor**: After each subtask (or every 3–5 tool calls), re-check the snapshot and confirm the next step still advances the parent objective.

Recommended Skill: `docs/agi/skills/instruction-adherence/SKILL.md`.

MCP (Model Context Protocol) servers run in the repo and expose tools that agents can invoke directly. If an agent has these tools in its function list, it can query and update the AGI documentation and session system without any additional setup or client.

### Current MCP Servers

| Server | Location | Transport | Purpose |
|--------|----------|-----------|---------|
| `docs-memory` | `tools/mcp/docs-memory/mcp-server.js` | stdio | Read/write AGI docs, sessions, lessons, patterns, workflows |
| `svg-editor` | `tools/mcp/svg-editor/mcp-server.js` | stdio | (Future) SVG generation and editing |

---

## How Agents Access MCP

### Direct Tool Invocation

If your toolset includes `mcp_docs-memory_*` functions, you can call them directly:

```javascript
// Example: Read SELF_MODEL
mcp_docs-memory_docs_memory_getSelfModel()

// Example: Search sessions for a keyword
mcp_docs-memory_docs_memory_searchSessions({ query: "activation", maxResults: 10 })

// Example: List available workflows
mcp_docs-memory_docs_memory_listWorkflows({ includeMetadata: true })

// Example: Get current session details
mcp_docs-memory_docs_memory_getSession({ slug: "2025-12-07-my-session" })

// Example: Append a lesson to LESSONS.md
mcp_docs-memory_docs_memory_appendLessons({ 
  lesson: "Event binding must happen after DOM is attached to control instance.",
  category: "jsgui3 Activation"
})
```

### Skills Discovery (recommended entry point)

If you’re not sure which workflow applies, start by looking for a Skill:

- List/search via docs-memory (recommended):
  - `mcp_docs-memory_docs_memory_listSkills`
  - `mcp_docs-memory_docs_memory_searchSkills`
  - `mcp_docs-memory_docs_memory_recommendSkills`
  - `mcp_docs-memory_docs_memory_getSkill`
  - `mcp_docs-memory_docs_memory_listTopics` (browse topics/keywords)
- Or open `docs/agi/SKILLS.md` and choose the closest match.

Skill SOPs intentionally link to checks/tests/scripts so you can verify quickly.

### Tool Naming Convention

All docs-memory tools follow the pattern:

```
mcp_docs-memory_docs_memory_<OPERATION>
```

Examples:
- `mcp_docs-memory_docs_memory_getSelfModel` — Read SELF_MODEL.md
- `mcp_docs-memory_docs_memory_getLessons` — Read LESSONS.md with stats/filtering
- `mcp_docs-memory_docs_memory_getSession` — Read session by slug or latest
- `mcp_docs-memory_docs_memory_searchSessions` — Full-text search across session files
- `mcp_docs-memory_docs_memory_listSkills` — List Skills from SKILLS.md
- `mcp_docs-memory_docs_memory_searchSkills` — Search skills + Skill docs
- `mcp_docs-memory_docs_memory_getSkill` — Read a specific Skill SOP
- `mcp_docs-memory_docs_memory_recommendSkills` — Recommend Skills for a topic (registry + session similarity)
- `mcp_docs-memory_docs_memory_listTopics` — List topics derived from skills/triggers
- `mcp_docs-memory_docs_memory_listWorkflows` — List available workflows
- `mcp_docs-memory_docs_memory_getWorkflow` — Read workflow content + parsed metadata
- `mcp_docs-memory_docs_memory_appendLessons` — Add lesson to LESSONS.md
- `mcp_docs-memory_docs_memory_appendToSession` — Append to WORKING_NOTES or FOLLOW_UPS
- `mcp_docs-memory_docs_memory_getObjectiveState` — Read session objective state (parent objective, detours, return step)
- `mcp_docs-memory_docs_memory_updateObjectiveState` — Update objective state (persisted per session)
- `mcp_docs-memory_docs_memory_updateKnowledgeMap` — Track refactoring status
- `mcp_docs-memory_docs_memory_proposeWorkflowImprovement` — Suggest workflow optimizations

---

## Read Operations (Queries)

### Get Self-Model

Retrieve the AGI self-identity document:

```
mcp_docs-memory_docs_memory_getSelfModel()
```

Returns: `{ type, path, updatedAt, content }`

### Get Lessons with Stats

Read LESSONS.md and optionally get statistics:

```
mcp_docs-memory_docs_memory_getLessons({ maxLines: 200, onlyStats: true })
```

Returns: `{ type, path, updatedAt, stats: { totalLines, sectionCount, dateRange }, ... }`

### Get Session (Latest or by Slug)

```
// Latest session (default)
mcp_docs-memory_docs_memory_getSession()

// Specific session by slug
mcp_docs-memory_docs_memory_getSession({ slug: "2025-12-07-memory-mcp-check" })

// With specific files
mcp_docs-memory_docs_memory_getSession({ 
  slug: "2025-12-07-ui-dashboard", 
  maxLinesPerFile: 100 
})
```

Returns: `{ slug, files: { PLAN.md, WORKING_NOTES.md, ... }, available: [...] }`

### Search Sessions

Full-text search across all session files:

```
mcp_docs-memory_docs_memory_searchSessions({ 
  query: "event binding activation",
  maxResults: 10 
})
```

Returns: `{ query, resultCount, results: [{ session, file, matches }] }`

### List Workflows

Get available workflows (optionally with metadata parsing):

```
mcp_docs-memory_docs_memory_listWorkflows({ includeMetadata: true })
```

Returns: `{ type, count, workflows: [{ name, path, title, audience, phaseCount }] }`

### Get Workflow Content

Read full workflow with structured metadata extraction:

```
mcp_docs-memory_docs_memory_getWorkflow({ 
  name: "tier1_tooling_loop",
  contentOnly: false 
})
```

Returns: `{ type, name, path, updatedAt, title, audience, prerequisites, phases, checklist, commands }`

### Search Workflows

Find workflows matching a keyword:

```
mcp_docs-memory_docs_memory_searchWorkflows({ 
  query: "refactor",
  maxResults: 5 
})
```

Returns: `{ query, resultCount, results: [{ name, snippet, context }] }`

### Find or Continue Session

Locate existing sessions on a topic (use this FIRST before creating new sessions):

```
mcp_docs-memory_docs_memory_findOrContinueSession({ 
  topic: "jsgui3 activation",
  maxResults: 5 
})
```

Returns: `{ sessionCount, sessions: [{ slug, status, taskCount, taskProgress: [...] }] }`

### Get Task Progress

Detailed task breakdown from a session PLAN.md:

```
mcp_docs-memory_docs_memory_getTaskProgress({ slug: "2025-12-07-my-session" })
```

Returns: `{ slug, taskCount, completedCount, inProgressCount, tasks: [{ id, title, status }] }`

### Get Patterns Catalog

Read refactoring patterns collected across sessions:

```
mcp_docs-memory_docs_memory_getPatterns({ maxLines: 200 })
```

Returns: `{ type, path, updatedAt, patternCount, content }`

### Get Anti-Patterns Catalog

Read anti-patterns to avoid:

```
mcp_docs-memory_docs_memory_getAntiPatterns({ maxLines: 200 })
```

Returns: `{ type, path, updatedAt, antiPatternCount, content }`

### Get Knowledge Map

Track refactoring status across the codebase:

```
mcp_docs-memory_docs_memory_getKnowledgeMap()
```

Returns: `{ type, path, updatedAt, stats: { total, planned, inProgress, completed, needsReview }, content }`

---

## Write Operations (Updates)

### Append a Lesson

Add a new lesson to LESSONS.md (use when you discover something worth remembering):

```
mcp_docs-memory_docs_memory_appendLessons({ 
  lesson: "Always bind events AFTER attaching control.dom.el to the DOM.",
  category: "## jsgui3 Activation Patterns"
})
```

Returns: `{ success, updatedAt }`

### Append to Session

Add notes to a session's WORKING_NOTES or FOLLOW_UPS:

```
mcp_docs-memory_docs_memory_appendToSession({ 
  file: "WORKING_NOTES.md",
  slug: "2025-12-07-my-session",
  content: "\n- Investigated control activation; found race condition in event binding.\n"
})
```

Returns: `{ success, updatedAt }`

### Update Knowledge Map

Track refactoring progress across the codebase:

```
mcp_docs-memory_docs_memory_updateKnowledgeMap({ 
  area: "src/ui/controls/DataExplorerDashboard.js",
  status: "completed",
  session: "2025-12-07-ui-dashboard",
  notes: "Refactored to extract MetricTile as separate control."
})
```

Returns: `{ success, area, status, action }`

### Add Refactoring Pattern

Document a reusable pattern you discover:

```
mcp_docs-memory_docs_memory_addPattern({ 
  name: "Extract Control from Inline DOM",
  whenToUse: "When a jsgui3 component has >100 lines of compose logic or multiple concerns.",
  steps: [
    "Identify the DOM building logic (compose method).",
    "Extract into a dedicated Control class.",
    "Move state management into the control.",
    "Wire activation/event binding in the new control."
  ],
  context: "jsgui3 architecture",
  example: "DataExplorerDashboardControl extraction"
})
```

Returns: `{ success, pattern, savedTo }`

### Add Anti-Pattern

Document a pattern to avoid:

```
mcp_docs-memory_docs_memory_addAntiPattern({ 
  name: "Binding Events Before DOM Attachment",
  symptoms: "Events don't fire; listeners silently fail to attach.",
  whyBad: "The control's DOM element is not yet in the live document tree, so event listeners attach to a detached node.",
  better: "Always call activate() AFTER attaching control.dom.el to a parent node in the document.",
  context: "jsgui3 activation flow"
})
```

Returns: `{ success, antiPattern, savedTo }`

### Propose Workflow Improvement

Suggest optimizations to existing workflows (AGI self-improvement):

```
mcp_docs-memory_docs_memory_proposeWorkflowImprovement({ 
  workflowName: "tier1_tooling_loop",
  summary: "Add ripple-analysis step before making function renames",
  issues: [
    "Agents sometimes rename functions without checking all callers.",
    "Renaming without ripple analysis can break dependent modules."
  ],
  changes: [
    "Add 'ripple-analysis' as a pre-step in the Discover phase.",
    "If RED risk detected, show recommendation to break refactor into smaller steps."
  ],
  benefits: [
    "Prevents accidental breakage of dependent code.",
    "Alerts agents to architectural coupling."
  ],
  validation: [
    "Run ripple-analysis on a known high-risk file (e.g., src/db/adapters/*).",
    "Verify risk score is displayed and recommendations are actionable."
  ]
})
```

Returns: `{ success, workflowName, summary, savedTo: "docs/agi/workflow-improvements/..." }`

---

## Example Workflow: Session-Based Knowledge Gathering

Here's how an agent uses MCP tools in a typical workflow:

```javascript
// 1. Check if a session exists on this topic
const existing = await mcp_docs-memory_docs_memory_findOrContinueSession({ 
  topic: "event binding",
  maxResults: 3 
});

if (existing.sessionCount > 0) {
  console.log("Found existing sessions:", existing.sessions);
} else {
  console.log("No prior sessions on this topic.");
}

// 2. Get current session to add notes
const session = await mcp_docs-memory_docs_memory_getSession();
console.log("Current session:", session.slug);

// 3. Search for related lessons
const lessons = await mcp_docs-memory_docs_memory_getLessons({ maxLines: 500 });
console.log("Lessons on file:", lessons.stats);

// 4. Look for activation patterns in workflows
const workflows = await mcp_docs-memory_docs_memory_listWorkflows();
const layoutWf = workflows.workflows.find(w => w.name.includes("LAYOUT"));
if (layoutWf) {
  const details = await mcp_docs-memory_docs_memory_getWorkflow({ name: layoutWf.name });
  console.log("Layout workflow phases:", details.phases);
}

// 5. If you discover something, add it
await mcp_docs-memory_docs_memory_appendLessons({
  lesson: "Event binding must happen post-activation, after control.dom.el is attached.",
  category: "## jsgui3 Activation"
});

// 6. Update session notes with findings
await mcp_docs-memory_docs_memory_appendToSession({
  file: "WORKING_NOTES.md",
  slug: session.slug,
  content: "\n- Confirmed: Activation order matters. Binding before DOM attachment causes silent failures.\n"
});
```

---

## Limitations & Notes

- **Availability**: MCP tools are only available if your agent's toolset explicitly includes them. If you see these functions listed in your available tools, you can use them.
- **Tool gating (important)**: Some agent environments expose MCP tools in groups (e.g., sessions vs workflows). If you can’t call `getSession`/`searchSessions`/`appendToSession` even though MCP is configured, activate the relevant category (or use CLI fallbacks).
- **Performance**: Queries are synchronous file reads. Large LESSONS.md or session files may take a few milliseconds; consider filtering with `maxLines` if needed.
- **Consistency**: All writes append to files; there is no transactional update. Multiple agents writing simultaneously is safe (files use append-only semantics), but reads during writes may see partial updates.
- **Paths**: All paths are relative to the repo root (`docs/agi/`, `docs/sessions/`, etc.). Agents do not need to compute absolute paths.

---

## If you can’t see session/workflow tools

If your environment supports tool-category activation, you may need to enable these groups before the full docs-memory surface is available:

- Session tools: `activate_session_management_tools`
- Workflow tools: `activate_workflow_management_tools`
- Patterns/anti-patterns: `activate_refactoring_pattern_management`
- Knowledge map: `activate_knowledge_map_management`

If activation isn’t available, use the repo CLIs:

- Search sessions: `node tools/dev/md-scan.js --dir docs/sessions --search "<topic>" --json`
- Search AGI docs (workflows/skills/patterns): `node tools/dev/md-scan.js --dir docs/agi --search "<topic>" --json`
- Find active sessions / next steps: `node tools/dev/what-next.js --json`

If the task seems procedural (debugging a known class of issue), prefer Skills discovery before doing broad doc searches.


---

## Quick Reference: All MCP Tools

### Read
- `getSelfModel()` — AGI identity document
- `getLessons()` — Accumulated lessons with stats
- `getSession()` — Session files by slug or latest
- `listSessions()` — List available session directories
- `searchSessions()` — Full-text search across sessions
- `getWorkflow()` — Workflow content with metadata
- `listWorkflows()` — List available workflows
- `searchWorkflows()` — Search workflow content
- `findOrContinueSession()` — Find existing sessions by topic
- `getTaskProgress()` — Task breakdown from PLAN.md
- `getPatterns()` — Refactoring patterns catalog
- `getAntiPatterns()` — Anti-patterns catalog
- `getKnowledgeMap()` — Refactoring coverage tracker

### Write
- `appendLessons()` — Add lesson to LESSONS.md
- `appendToSession()` — Add notes to WORKING_NOTES or FOLLOW_UPS
- `addPattern()` — Add refactoring pattern
- `addAntiPattern()` — Add anti-pattern to avoid
- `updateKnowledgeMap()` — Track refactoring status
- `proposeWorkflowImprovement()` — Suggest workflow optimizations (AGI self-improvement)

---

## When to Use MCP vs. File Tools

| Situation | Tool | Why |
|-----------|------|-----|
| You want to read a doc or session quickly | MCP (e.g., `getSession()`) | Faster, cached paths, structured output |
| You need to search LESSONS or sessions | MCP `searchSessions()`, `searchWorkflows()` | Full-text search built-in |
| You want to update LESSONS with a finding | MCP `appendLessons()` | Appends safely, tracks timestamps |
| You need raw file access (e.g., `read_file`) | File tools | For inspection, regex matching, exact line numbers |
| You're editing code (not documentation) | `js-scan`, `js-edit` + file tools | Specialized for code refactoring |

---

## Summary

Agents with access to MCP tools can query and update the AGI documentation system directly. There's no setup required—just invoke the tools in your function list. Use them to:

- **Learn**: Read SELF_MODEL, LESSONS, workflows, and prior sessions.
- **Search**: Find patterns, anti-patterns, and session insights.
- **Record**: Append lessons and session notes so future agents benefit.
- **Track**: Update the knowledge map to record refactoring progress.
- **Improve**: Propose workflow optimizations that make the system smarter over time.

This is how agents participate in the AGI memory system.
