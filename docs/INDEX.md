# Project Documentation Index

_Last updated: 2025-12-10_

## Agents
- [Agent Policy](agents/agent_policy.md)
- [Command Execution Rules](agents/command-rules.md)
- [Core Workflow Rules](agents/core-workflow-rules.md)
- [Database Schema Evolution](agents/database-schema-evolution.md)
- [Database Schema Tools](agents/database-schema-tools.md)
- [Docs Indexer & Agents Refactorer](agents/docs_indexer_and_agents_refactorer.md)
- [Intelligent Crawl Startup](agents/intelligent-crawl-startup.md)
- [TDD Guidelines](agents/tdd-guidelines.md)
- [Test Log Migration](agents/test-log-migration.md)
- [Testing Guidelines](agents/testing-guidelines.md)
- [Tools & Correction Scripts](agents/tools-correction-scripts.md)

## Workflows
- [Documentation Extraction Playbook](workflows/doc_extraction_playbook.md)
- [Planning & Review Loop](workflows/planning_review_loop.md)
- [Kilo Agent Handbook](workflows/kilo-agent-handbook.md) - Directory layout + workflow for running Kilo Code in this repo.
- [Session Bootstrap Workflow](workflows/session_bootstrap_workflow.md) - Step-by-step guide for creating session folders, plans, and hub links.
- [Tier 1 Tooling Loop](workflows/tier1_tooling_loop.md) - js-scan/js-edit discovery, dry-run, apply, and verification loop for JS changes.

## Standards
- [Commit & PR Standards](standards/commit_pr_standards.md)
- [Communication Standards](standards/communication.md)
- [Naming & Conventions](standards/naming_conventions.md)
- [Testing Output Standards](standards/testing_output.md)

## How-tos
- [Add a New Agent](how_tos/add_new_agent.md)
- [Update the Index](how_tos/update_index.md)

## Guides

**Comprehensive AI-generated references** for complex subsystems. These in-depth documents (500–1000+ lines) capture architecture, patterns, gotchas, and working examples discovered through hands-on implementation. Consult before working on an unfamiliar subsystem.

### jsgui3 Satellite Guides (Domain-Specific Knowledge)

These guides are **authoritative sources** for their domains. When working in these areas, **read the relevant guide first** — they take precedence over general agent instructions.

- [jsgui3 UI Architecture Guide](guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md) - Isomorphic component architecture, control composition, SSR/hydration patterns, **jsgui3-server experiments**, and verification scripts for jsgui3-html UIs.
- [jsgui3 Window Control Guide](guides/JSGUI3_WINDOW_CONTROL_GUIDE.md) - **Built-in floating window**: Draggable, resizable, minimize/maximize/close, z-index management. Use for tool panels, dialogs, result viewers.
- [jsgui3 Performance Patterns](guides/JSGUI3_PERFORMANCE_PATTERNS.md) - **🔴 CRITICAL for optimization**: Lazy rendering, control counting, performance diagnostics, decision matrix by dataset size.
- [jsgui3 MVVM Patterns](guides/JSGUI3_MVVM_PATTERNS.md) - Data binding, computed properties, validators, transformations. Use for forms and complex state.
- [jsgui3 Cognitive Toolkit](guides/JSGUI3_COGNITIVE_TOOLKIT.md) - Research methods, OODA loop, confidence calibration, anti-patterns. Consult when stuck.
- [Anti-Pattern Catalog](guides/ANTI_PATTERN_CATALOG.md) - **Quick lookup** for common mistakes across all domains. Searchable by symptom.

### Agent Hierarchy & Delegation

- [Brain-to-Robot Delegation](guides/BRAIN_TO_ROBOT_DELEGATION.md) - How 🧠 brain agents create plans for 🤖 robot agents. Plan templates, step formats, error handling.

### Meta-Planning (Planning-Planning)

- [Planning Planning Strategies](guides/PLANNING_PLANNING_STRATEGIES.md) - **Core meta-planning guide**: How to design planning systems, the CLEAR criteria, multi-agent planning hierarchy.
- [Central Planner Protocol](guides/CENTRAL_PLANNER_PROTOCOL.md) - Review process for plan proposals, decision categories, escalation rules.

### Testing Guides

- [Test Hanging Prevention Guide](guides/TEST_HANGING_PREVENTION_GUIDE.md) - **CRITICAL for E2E tests**: Preventing "Jest did not exit" warnings, server cleanup patterns, timeout strategies, and reliable async test structure.

### Server Telemetry

- [Server Telemetry Standard](guides/SERVER_TELEMETRY_STANDARD.md) - Standard JSONL events + `/api/status` for z-server ingestion and cross-server observability.

### Visualization & Diagrams

- [SVG Creation Methodology](guides/SVG_CREATION_METHODOLOGY.md) - **6-stage pipeline** for AI agents to create complex SVG diagrams. JSON-first structure, layout algorithms, component library, Industrial Luxury Obsidian theme.
- [WLILO Style Guide](guides/WLILO_STYLE_GUIDE.md) - White Leather + Industrial Luxury Obsidian aesthetic: palette, motifs, references, and validation steps.

## Designs

Architecture and system design documents for proposed or implemented features.

- [NPM Link Development Nexus](designs/NPM_LINK_DEVELOPMENT_NEXUS.md) - Using npm link for cross-module AI agent development across jsgui3 stack.

## Reference
- [Adapters Overview](reference/adapters_overview.md)
- [Build Process](reference/build_process.md)
- [CLI Tooling](reference/cli_tooling.md)
- [CLI Tool Testing Guide](CLI_TOOL_TESTING_GUIDE.md) - Test runners for js-scan, js-edit, md-scan, md-edit
- [Agent Tooling Enhancements Proposal](AGENT_TOOLING_ENHANCEMENTS_PROPOSAL.md) - js-scan/js-edit roadmap + priority matrix
- [Database Schemas](reference/db_schemas.md)
- [Enhanced Database Adapter](reference/enhanced_database_adapter.md)
- [Project Overview](reference/project_overview.md)

## Checklists
- [Database Backup](checklists/database_backup.md)
- [Doc Link Integrity](checklists/doc_link_integrity.md)
- [Release Preflight](checklists/release_preflight.md)

## Sessions
- [Session Documentation Hub](sessions/SESSIONS_HUB.md) - Entry point for current/archived session folders.
- [2025-11-18 Crawl Output Refresh](sessions/2025-11-18-crawl-output-refresh/INDEX.md) - Trim crawl output, cached seed handling, 10-minute hub refresh default.

## Plans
- [Project Plans Index](plans/INDEX.md) - AI-generated long-term plans for human review. File-based, links to sessions.
- [Plan Proposals](plans/proposals/README.md) - Pending proposals awaiting Central Planner review.

## Reports
- [20-Session Retrospective (Nov 29, 2025)](reports/20-SESSION-RETROSPECTIVE-2025-11-29.md) - **REQUIRED READING**: Analysis of 20 recent sessions with patterns, solutions, and agent instruction improvements. Covers UI hydration fixes, tooling enhancements, and workflow violations.

## Legacy Collections
- [Root Migration Collection](root-migration/README.md) - Former root-level docs awaiting categorization.
- [AGENTS Archives](archives/agents/) - Historical copies of AGENTS.md variants for reference.
