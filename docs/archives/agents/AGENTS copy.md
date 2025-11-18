# Agents Hub

This file is a hub, not a manual. Detailed guidance lives in `docs/`.

> **Research-First Preflight**  
> 1) Open `docs/INDEX.md`. 2) Navigate to relevant topics. 3) Read the linked docs.  
> Do **not** rely on prompt snippets. If it’s in the docs, the docs win.

## Quick Links
- Policy & Preflight → `docs/agents/agent_policy.md`
- Docs Indexer Mode → `docs/agents/docs_indexer_and_agents_refactorer.md`
- Planning & Review Loop → `docs/workflows/planning_review_loop.md`
- Documentation Extraction → `docs/workflows/doc_extraction_playbook.md`
- Careful js-edit Refactor Agent → `.github/agents/Careful js-edit refactor.agent.md` (for JavaScript modularization/refactoring with phase tracking)
- Careful js-edit Builder → `.github/agents/Careful js-edit Builder.agent.md` (for net-new feature development with js-edit)
- Careful Refactor → `.github/agents/Careful Refactor.agent.md` (for non-JavaScript or mixed-language refactoring)
- js-edit Improve Static Analysis Agent → `.github/agents/js-edit Improve Static Analysis.agent.md`
- Modularisation Status → `docs/CHANGE_PLAN.md#modularisation-snapshot--november-6-2025`

## How to Use This Hub
1. Start at `docs/INDEX.md` and pick the topical docs for your task.
2. Read ⭐ priority docs first, then context-specific references.
3. Update canonical docs when new patterns emerge; keep this hub minimal.

## Command Discipline
- **Prefer Node.js commands over PowerShell-specific syntax.** Use `node <script>` directly for cross-platform compatibility.
- When PowerShell usage is required:
  - Set UTF-8 encoding first: `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`
  - Use proper PowerShell cmdlets and operators (avoid Unix-style pipes `|` with external commands that output Unicode)
  - Capture complex output to files rather than using inline pipelines
- Run repository scripts with absolute paths when possible.
- Never invoke `python`, `python3`, or inline Python snippets; rely on Node.js tooling or PowerShell-native commands for scripting needs.

## js-edit Workflow Expectations
- Default to `node tools/dev/js-edit.js` for JavaScript discovery, static analysis, and guarded edits before considering manual changes.
- During discovery, capture structure with `--list-functions`, `--list-variables`, and `--scan-targets --json` (function or variable modes) so plan payloads exist ahead of edits.
- Use `--context-function` / `--context-variable` with `--emit-plan` for span review, then batch replacements through `--locate`/`--replace` guarded by `--expect-hash`, `--expect-span`, and optional `--emit-digests` or `--digest-include-snippets`.
- Log every js-edit command in the tracker or change plan, including emitted plan paths, digest directories, and any guard-rail overrides (e.g., `--allow-multiple`).
- When js-edit cannot parse a construct, document the limitation, propose an enhancement, and only fall back to manual edits after the tracker notes the blocker.
- Reference `.github/agents/Careful js-edit refactor.agent.md` and the workflow docs in `docs/workflows/` for extended command primers and multi-file batching patterns.

---

*This refactoring transforms the codebase into a more idiomatic, maintainable state while preserving all existing functionality. Follow the workflow systematically, test continuously, and document progress transparently.*