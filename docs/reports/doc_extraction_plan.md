---
status: draft
source: AGENTS.md
created: 2025-11-04
owner: docs-indexer
---

# Doc Extraction Plan

## Section Inventory (AGENTS.md)

- AI Agent Documentation Strategy → policy, doc navigation guidance
- Index of Operational Docs → outdated index content
- When to Read Which Docs → doc navigation guidance
- Critical Command Rules → command execution policy (already in docs/agents/command-rules.md)
- OS Awareness & Command Line Best Practices → command execution policy (expand existing doc)
- Core Workflow Rules → workflow guidance
- Project Structure → architecture reference
- Crawls vs Background Tasks → pointer to existing architecture docs
- UI Module Pattern (Deprecated) → reference only (archive)
- Tools and Correction Scripts → existing agent doc
- Test Log Migration and Management → existing agent doc
- Database Schema Tools → existing agent doc
- How to Get a Database Handle → database quick reference
- CLI Tools & Commands → CLI reference
- Agentic CLI Workflows → workflow checklist
- Database Backup Policy → operational checklist
- Enhanced Database Adapter → optional reference
- Database Architecture (SQLite WAL Mode) → database reference
- Testing Guidelines → existing agent doc
- Build Process → build reference
- Architecture Documentation → index pointers
- Current Focus → roadmap pointer
- Communication & Documentation → policy
- Refactoring Guidelines → workflow guidance
- Jest Command Guidelines → testing standards
- Test Console Output → testing standards
- PowerShell Command Guidelines → command policy
- Database Schema Evolution → existing agent doc
- Intelligent Crawl Startup Analysis → existing agent doc

## Extraction Targets

| Source Section | Target Doc | Rationale |
| --- | --- | --- |
| AI Agent Documentation Strategy | docs/agents/agent_policy.md | Canonical policy for all agents |
| Documentation Discovery Pattern & When to Read | docs/workflows/doc_extraction_playbook.md | Step-by-step doc navigation workflow |
| Index of Operational Docs | docs/INDEX.md | Consolidated index replacing inline table |
| Core Workflow Rules & Refactoring Guidelines | docs/workflows/planning_review_loop.md | Capture execution workflows |
| CLI Tools & Commands, Agentic CLI Workflows | docs/reference/cli_tooling.md | Centralize CLI guidance |
| Database Backup Policy | docs/checklists/database_backup.md | Operational checklist |
| Enhanced Database Adapter | docs/reference/enhanced_database_adapter.md | Optional infrastructure reference |
| Build Process | docs/reference/build_process.md | Build pipeline reference |
| Communication & Documentation | docs/standards/communication.md | Standards for reporting |
| Jest Command Guidelines & Test Console Output | docs/standards/testing_output.md | Testing output standards |
| Project Structure overview | docs/reference/project_overview.md | High-level structure reference |

## Follow-Up Actions

1. Build `docs/INDEX.md` with canonical sections and links.
2. Extract mapped sections into the target docs with canonical front matter.
3. Trim `AGENTS.md` to hub format pointing to the index and key workflows.
4. Inject Research-First Preflight block into `AGENTS.md` and all agent docs.
5. Run link integrity sweep and record results in `docs/reports/link_check.md`.
