# Project Documentation Index

_Last updated: 2026-02-12_

## Quick References
- [Command Execution Guide](COMMAND_EXECUTION_GUIDE.md)
- [Testing Quick Reference](TESTING_QUICK_REFERENCE.md)
- [Database Quick Reference](DATABASE_QUICK_REFERENCE.md)

## Path-Local Agent Guides (AGENT.md)

Every major subsystem directory has an `AGENT.md` file with context-specific workflows, essential reading, and critical knowledge. **Check for an AGENT.md in your working directory before starting any task.**

| Path | Scope |
|------|-------|
| [src/v4/AGENT.md](../src/v4/AGENT.md) | V4 distributed crawl system |
| [src/core/crawler/AGENT.md](../src/core/crawler/AGENT.md) | Core (V1/V3) crawler pipeline |
| [src/data/db/AGENT.md](../src/data/db/AGENT.md) | Database adapters + schema sync |
| [src/ui/AGENT.md](../src/ui/AGENT.md) | jsgui3 UI components |
| [deploy/AGENT.md](../deploy/AGENT.md) | Deployment infrastructure |
| [deploy/remote-crawler-v2/AGENT.md](../deploy/remote-crawler-v2/AGENT.md) | Content-storing crawler worker |
| [tools/crawl/AGENT.md](../tools/crawl/AGENT.md) | Crawl diagnostic instruments |
| [tools/dev/AGENT.md](../tools/dev/AGENT.md) | Developer CLI tools (js-scan, js-edit) |
| [tests/v4/AGENT.md](../tests/v4/AGENT.md) | V4 test suite |
| [docs/AGENT.md](AGENT.md) | Documentation hub navigation |
| [docs/sessions/AGENT.md](sessions/AGENT.md) | Session folder management (agent memory) |

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
- [Emoji Search in Markdown (Windows-safe)](workflows/emoji_search_markdown.md) - Find emojis in docs without relying on literal emoji input.
- [UI Inspection Workflow](workflows/ui-inspection-workflow.md) - Autonomous visual (MCP/Playwright) + numeric (Puppeteer) UI inspection loop.
- [Single UI App Cohesion](workflows/single-ui-app-cohesion.md) - No-retirement unified shell: add sub-apps + add `--check`.
- [V4 Production Crawl](workflows/v4-production-crawl.md) - End-to-end workflow for running v4 crawls, verifying integrity, and diagnosing issues.
- [Crawl Diagnostic Protocol](workflows/crawl-diagnostic-protocol.md) - 7-step protocol for investigating crawl failures using CLI diagnostic tools.
- [Continuous Crawl + Repair Loop](workflows/continuous-crawl-repair-loop.md) - Run crawls continuously while monitoring success metrics and shipping verified improvements.
- [Workflow Registry (Canonical)](workflows/WORKFLOW_REGISTRY.md) - One page showing all active workflows + how to find them.
- [Workflow Contribution Guide](workflows/WORKFLOW_CONTRIBUTION_GUIDE.md) - How to add/update workflows without doc sprawl.

## Standards
- [Commit & PR Standards](standards/commit_pr_standards.md)
- [Communication Standards](standards/communication.md)
- [Naming & Conventions](standards/naming_conventions.md)
- [Testing Output Standards](standards/testing_output.md)

## How-tos
- [Add a New Agent](how_tos/add_new_agent.md)
- [Update the Index](how_tos/update_index.md)

## Architecture

- [Architectural Contracts](arch/README.md) - Explicit, test-backed subsystem boundaries (crawler ↔ db ↔ ui).

## Crawling

High-signal entry points for the crawler subsystem. Start with the architecture doc, then use the CLI quick reference and the roadmap.

- [Architecture: Crawls vs Background Tasks](ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md)
- [Crawler Runbook (Ops)](RUNBOOK.md)
- [Debugging Child Processes](DEBUGGING_CHILD_PROCESSES.md)
- [Crawl CLI Quick Reference](cli/crawl.md)
- [DB Queries During Crawls](DB_QUERIES_DURING_CRAWLS.md)
- [Enhanced Features](ENHANCED_FEATURES.md)
- [Geography Crawl Type](GEOGRAPHY_CRAWL_TYPE.md)
- [Reliable Crawler Roadmap](goals/RELIABLE_CRAWLER_ROADMAP.md)
- [Intelligent Crawl Startup](agents/intelligent-crawl-startup.md) - Agent workflow for iterating on startup output and preflight.
- [Crawl System Problems Catalogue](designs/CRAWL_SYSTEM_PROBLEMS_AND_RESEARCH.md) - 8 diagnosed problems with severity ratings, root causes, and fix plan.

### V4 Distributed Crawl System

- [V4 Architecture Book](guides/V4_ARCHITECTURE_BOOK.md) - Comprehensive 18-chapter guide to the v4 distributed system.
- [V4 Warm-Up Validation Process](guides/V4_WARMUP_VALIDATION_PROCESS.md) - Pre-production validation harness (6 stages).
- [V4 100-Page Production Crawl](sessions/2025-07-14-v4-100-page-crawl/SESSION_SUMMARY.md) - Real-world 116-page crawl results + 3 bugs found.
- [Distributed Crawl Architecture Book (v3)](guides/DISTRIBUTED_CRAWL_ARCHITECTURE_BOOK.md) - V1→V2→V3 evolution (read before V4 book).

## Guides

**Comprehensive AI-generated references** for complex subsystems. These in-depth documents (500–1000+ lines) capture architecture, patterns, gotchas, and working examples discovered through hands-on implementation. Consult before working on an unfamiliar subsystem.

### jsgui3 Satellite Guides (Domain-Specific Knowledge)

These guides are **authoritative sources** for their domains. When working in these areas, **read the relevant guide first** — they take precedence over general agent instructions.

- [UI Knowledge Sources (Consolidated)](guides/UI_KNOWLEDGE_SOURCES.md) - **START HERE for UI work**: Quick reference linking all jsgui3 guides with priority ratings.
- [jsgui3 SSR & Isomorphic Controls](guides/JSGUI3_SSR_ISOMORPHIC_CONTROLS.md) - **Composition model, SSR patterns, client activation** — The definitive guide to how controls work. Covers terminology (compose vs render), the golden rules, and troubleshooting.
- [jsgui3 SSR Activation Data Bridge](guides/JSGUI3_SSR_ISOMORPHIC_CONTROLS.md#76-ssr-activation-data-bridge-data-jsgui-fields--data-jsgui-ctrl-fields) - Persisted fields + ctrl_fields bridge from SSR markup into client activation, with validation steps.
- [jsgui3 UI Architecture Guide](guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md) - Isomorphic component architecture, control composition, SSR/activation patterns, **jsgui3-server experiments**, and verification scripts for jsgui3-html UIs.
- [jsgui3 Shared Controls Catalog](guides/JSGUI3_SHARED_CONTROLS_CATALOG.md) - **Complete inventory** of all reusable controls (Table, Sparkline, ProgressBar, UrlFilterToggle, etc.), usage examples, patterns, and check scripts. Consult before creating new controls.
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
- [Puppeteer UI Workflow Guide](guides/PUPPETEER_UI_WORKFLOW.md) - One-shot browser console/network capture for debugging UI routes without writing a full E2E.
- [Puppeteer Scenario Suites](guides/PUPPETEER_SCENARIO_SUITES.md) - Fast UI verification by running many scenarios per browser session (deterministic fixtures + artifacts on failure).
- [jsgui3 Activation Log Noise (Expected)](guides/JSGUI3_DEBUGGING_GUIDE.md#activation-log-noise-expected-warnings) - Interpreting `Missing context.map_Controls` and `&&& no corresponding control` without chasing false alarms.

### Authorization UX (CLI)

- [Authorization Workflows — Case Study + Patterns](guides/AUTHORIZATION_WORKFLOWS_CASE_STUDY.md) - Device-code OAuth case study (GitHub-style) + simpler high-quality CLI auth patterns.

### Distributed Crawling Architecture

- [Distributed Crawl Architecture Book](guides/DISTRIBUTED_CRAWL_ARCHITECTURE_BOOK.md) - **Comprehensive history and design**: v1 (disposable scout) → v2 (content-storing peer) → v3 (P2P orchestrator) → v4 (jsgui3-server) architecture evolution, lessons learned, and implementation blueprint.
- [V4 Architecture Book](guides/V4_ARCHITECTURE_BOOK.md) - **v4 deep dive**: Intelligence-at-the-edge architecture (CrawlerApp, FleetSupervisor, V4Orchestrator, V4SyncEngine), SSE-triggered sync, SSR dashboards, 82-test local validation, and staged deployment plan for Oracle Cloud VM.

### Server Telemetry

- [Server Telemetry Standard](guides/SERVER_TELEMETRY_STANDARD.md) - Standard JSONL events + `/api/status` for z-server ingestion and cross-server observability.

### Visualization & Diagrams

- [SVG Creation Methodology](guides/SVG_CREATION_METHODOLOGY.md) - **6-stage pipeline** for AI agents to create complex SVG diagrams. JSON-first structure, layout algorithms, component library, Industrial Luxury Obsidian theme.
- [WLILO Style Guide](guides/WLILO_STYLE_GUIDE.md) - White Leather + Industrial Luxury Obsidian aesthetic: palette, motifs, references, and validation steps.

## Designs

Architecture and system design documents for proposed or implemented features.

- [NPM Link Development Nexus](designs/NPM_LINK_DEVELOPMENT_NEXUS.md) - Using npm link for cross-module AI agent development across jsgui3 stack.
- [Crawler Improvement Strategies](designs/CRAWLER_IMPROVEMENT_STRATEGIES.md) - Deep research on 7 improvement opportunities with lab experiment proposals (Puppeteer Teacher, Confidence Scoring, Rate Learning, SkeletonHash integration)

## Reference
- [Adapters Overview](reference/adapters_overview.md)
- [Build Process](reference/build_process.md)
- [CLI Tooling](reference/cli_tooling.md)
- [CLI Tool Testing Guide](CLI_TOOL_TESTING_GUIDE.md) - Test runners for js-scan, js-edit, md-scan, md-edit
- [Agent Tooling Enhancements Proposal](AGENT_TOOLING_ENHANCEMENTS_PROPOSAL.md) - js-scan/js-edit roadmap + priority matrix
- [Database Schemas](reference/db_schemas.md)
- [Enhanced Database Adapter](reference/enhanced_database_adapter.md)
- [Task Events API](database/task-events-api.md) - Unified event storage for crawls and background tasks, with AI query helpers and REST endpoints.
- [Project Overview](reference/project_overview.md)

## Workspace Orientation
- [Workspace Structure & Navigation](organization/WORKSPACE_STRUCTURE.md)

## AGI Memory & Observability
- [docs-memory MCP Server](../tools/mcp/docs-memory/README.md) - AGI memory layer: sessions, skills, lessons, patterns, and app logging.
- [MCP Logger Client](../src/utils/mcpLogger.js) - Client library for apps to write logs that AI agents can read.
- [Log Storage](../docs/agi/logs/README.md) - NDJSON log files for app telemetry.

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
- [Crawler State Report (Dec 15, 2025)](reports/2025-12-15-CRAWLER_STATE_REPORT.md) - Comprehensive overview of the crawler subsystem: 259 files, 4-phase roadmap, Phase 1 complete, 7+ improvement opportunities identified.
- [20-Session Retrospective (Nov 29, 2025)](reports/20-SESSION-RETROSPECTIVE-2025-11-29.md) - **REQUIRED READING**: Analysis of 20 recent sessions with patterns, solutions, and agent instruction improvements. Covers UI hydration fixes, tooling enhancements, and workflow violations.
- [OpenClaw (MoldBot/Moltbot) Research Brief (Feb 2, 2026)](reports/2026-02-02-OPENCLAW_MOLDBOT_RESEARCH.md) - Naming history, architecture, capabilities, setup, and security risks.

## Legacy Collections
- [Root Migration Collection](root-migration/README.md) - Former root-level docs awaiting categorization.
- [AGENTS Archives](archives/agents/) - Historical copies of AGENTS.md variants for reference.
