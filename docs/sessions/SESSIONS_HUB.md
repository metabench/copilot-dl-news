# 📚 Session Documentation Hub

**Purpose**: Central index for all development sessions (short-term and long-term memory for AI agents)

---

## Memory Hierarchy

### 🟢 Current Session (Short-term Memory)
**Location**: `docs/sessions/[session-id]/`  
**Retention**: Active during development  
**Purpose**: Immediate context, current work, active tasks  
**Refresh Rate**: Real-time updates  
**For Agents**: Use this for immediate context when working on active tasks

### 🟡 Recent Sessions (Medium-term Memory)
**Location**: `docs/sessions/[session-id]/` (indexed)  
**Retention**: Last 4-8 weeks  
**Purpose**: Pattern recognition, decision continuity, approach validation  
**Refresh Rate**: Weekly archival  
**For Agents**: Reference these to understand project momentum and approach

### 🔵 Historical Sessions (Long-term Memory)
**Location**: `docs/sessions/archive/`  
**Retention**: Beyond 8 weeks  
**Purpose**: Lessons learned, architectural decisions, pattern evolution  
**Refresh Rate**: Quarterly archival  
**For Agents**: Search these for historical context and decision rationale

---

## Current Session

### Session 2025-11-14: Db View Implementation

**Duration**: Active
**Type**: db-migration
**Completion**: 🔄 In progress

**Focus**:
- Add articles and place hub views

**Location**: `docs/sessions/2025-11-14-db-view-implementation/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-14-db-view-implementation/INDEX.md)
- 🗺️ [Plan](./2025-11-14-db-view-implementation/PLAN.md)
- 📝 [Working Notes](./2025-11-14-db-view-implementation/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-14-db-view-implementation/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-14-db-view-implementation/FOLLOW_UPS.md)


### Session 2025-11-14: UI Controls Table Rendering

**Duration**: Active
**Type**: UI tooling & visualization
**Completion**: 🔄 In progress

**Focus**:
- Investigate `jsgui3-html` control patterns and dependencies
- Create `src/ui/controls` with reusable table, row, and cell controls
- Render the first 1000 crawler URLs into a styled HTML page via a new script

**Location**: `docs/sessions/2025-11-14-ui-controls-table/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-14-ui-controls-table/INDEX.md)
- 🗺️ [Plan](./2025-11-14-ui-controls-table/PLAN.md)
- 📝 [Working Notes](./2025-11-14-ui-controls-table/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-14-ui-controls-table/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-14-ui-controls-table/FOLLOW_UPS.md)


### Session 2025-11-14: Strategic Analysis Mode

**Duration**: Active
**Type**: Tooling analysis
**Completion**: 🔄 In progress

**Focus**:
- Assess additional JS tooling improvements for agents

**Location**: `docs/sessions/2025-11-14-strategic-analysis-mode/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-14-strategic-analysis-mode/INDEX.md)
- 🗺️ [Plan](./2025-11-14-strategic-analysis-mode/PLAN.md)
- 📝 [Working Notes](./2025-11-14-strategic-analysis-mode/WORKING_NOTES.md)
- 📘 [Session Summary](./2025-11-14-strategic-analysis-mode/SESSION_SUMMARY.md)
- ✅ [Follow Ups](./2025-11-14-strategic-analysis-mode/FOLLOW_UPS.md)


### Session 2025-11-18: Crawl Output Refresh

**Duration**: Active
**Type**: Crawl ergonomics & cache tuning
**Completion**: 🔄 In progress

**Focus**:
- Replace noisy crawl logs with one concise per-page line including download timing
- Reuse cached place/country hub seeds when available and fetch uncached hubs immediately
- Enforce a 10-minute hub freshness window via `maxAgeHubMs` defaults + CLI wiring

**Location**: `docs/sessions/2025-11-18-crawl-output-refresh/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-18-crawl-output-refresh/INDEX.md)
- 📝 [Working Notes](./2025-11-18-crawl-output-refresh/WORKING_NOTES.md)
- 🗺️ [Plan](./2025-11-18-crawl-output-refresh/PLAN.md)

### Session 2025-11-17: Hub Eligibility Refresh

**Duration**: Active
**Type**: Crawl behavior improvements
**Completion**: 🔄 In progress

**Focus**:
- Allow QueueManager to re-enqueue navigation/front-page URLs when `maxAgeHubMs` demands fresh hubs
- Update UrlEligibilityService to treat stale hubs based on SQLite fetch recency instead of skipping them outright
- Capture documentation, tests, and follow-ups that keep hub reseeding reliable

**Location**: `docs/sessions/2025-11-17-hub-eligibility-refresh/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-17-hub-eligibility-refresh/INDEX.md)
- 🗺️ [Roadmap](./2025-11-17-hub-eligibility-refresh/ROADMAP.md)
- 📝 [Working Notes](./2025-11-17-hub-eligibility-refresh/WORKING_NOTES.md)

### Session 2025-11-13: Gap 5 Scouting & Feasibility

**Duration**: Active
**Type**: Tooling assessment, roadmap execution
**Completion**: 🔄 In progress

**Focus**:
- Assess feasibility of Gap 5 & Gap 6 js-scan/js-edit enhancements
- Capture blockers, scope, and required effort refinements
- Produce implementation recommendations and next actions

**Location**: `docs/sessions/2025-11-13-gap5-scouting/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-13-gap5-scouting/INDEX.md)
- 🗺️ [Roadmap](./2025-11-13-gap5-scouting/ROADMAP.md)
- 📝 [Working Notes](./2025-11-13-gap5-scouting/WORKING_NOTES.md)

### Session 2025-11-13: Agent Docs Improvements

**Duration**: Active
**Type**: Documentation analysis
**Completion**: 🟡 In progress

**Focus**:
- Inventory `.agent.md` personas and capture current coverage
- Identify inconsistencies or outdated guidance vs. current tooling
- Produce prioritized recommendations for updates

**Location**: `docs/sessions/2025-11-13-agent-docs-improvements/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-13-agent-docs-improvements/INDEX.md)
- 🗺️ [Roadmap](./2025-11-13-agent-docs-improvements/ROADMAP.md)
- 📝 [Working Notes](./2025-11-13-agent-docs-improvements/WORKING_NOTES.md)

### Session 2025-11-13: Basic Crawl Health

**Duration**: Active
**Type**: Operational health check
**Completion**: 🔄 In progress

**Focus**:
- Determine whether the "basic crawl" workflow is functioning as expected
- Surface existing telemetry/tests covering crawl health
- Recommend remediation steps if issues are detected

**Location**: `docs/sessions/2025-11-13-basic-crawl-health/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-13-basic-crawl-health/INDEX.md)
- 🗺️ [Roadmap](./2025-11-13-basic-crawl-health/ROADMAP.md)
- 📝 [Working Notes](./2025-11-13-basic-crawl-health/WORKING_NOTES.md)

### Session 2025-11-13: Crawl Config Runner

**Duration**: Active
**Type**: Crawl tooling enablement
**Completion**: 🔄 In progress

**Focus**:
- Make `crawl.js` load crawler options from reusable config manifests
- Support zero-argument runs with file-driven defaults plus CLI overrides
- Document operator workflow for storing and invoking configs

**Location**: `docs/sessions/2025-11-13-crawl-config-runner/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-13-crawl-config-runner/INDEX.md)
- 🗺️ [Roadmap](./2025-11-13-crawl-config-runner/ROADMAP.md)
- 📝 [Working Notes](./2025-11-13-crawl-config-runner/WORKING_NOTES.md)

### Session 2025-11-13: Front Page Seeding

**Duration**: Active
**Type**: Crawl behavior improvements
**Completion**: 🔄 In progress

**Focus**:
- Guarantee each intelligent crawl run downloads the publication front page first
- Reseed hub/article queues automatically when existing work drains
- Persist all discovered links into the URLs table and enqueue them for follow-up

**Location**: `docs/sessions/2025-11-13-frontpage-seeding/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-13-frontpage-seeding/INDEX.md)
- 🗺️ [Roadmap](./2025-11-13-frontpage-seeding/ROADMAP.md)
- 📝 [Working Notes](./2025-11-13-frontpage-seeding/WORKING_NOTES.md)

### Session 2025-11-13: Cached Seed Refactor

**Duration**: Active
**Type**: Crawl cache enablement
**Completion**: 🔄 In progress

**Focus**:
- Make QueueManager/fetch pipeline respect `processCacheResult` hints end-to-end
- Hydrate seeds directly from ArticleCache when requested
- Add CLI toggles, docs, and tests covering cached seed workflows

**Location**: `docs/sessions/2025-11-13-cached-seed-refactor/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-13-cached-seed-refactor/INDEX.md)
- 🗺️ [Roadmap](./2025-11-13-cached-seed-refactor/ROADMAP.md)
- 📝 [Working Notes](./2025-11-13-cached-seed-refactor/WORKING_NOTES.md)

### Session 2025-11-13: Guardian Crawl Verification

**Duration**: Active
**Type**: Operational validation
**Completion**: 🔄 In progress

**Focus**:
- Run `basicArticleDiscovery` with `--max-downloads 100` after the CLI summary enhancements
- Capture telemetry proving the `Final stats` line reports accurate download counts
- Document any anomalies (queue exhaustion, HTTP errors) for follow-up actions

**Location**: `docs/sessions/2025-11-13-guardian-crawl-verification/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-13-guardian-crawl-verification/INDEX.md)
- 📝 [Working Notes](./2025-11-13-guardian-crawl-verification/WORKING_NOTES.md)
- 📋 [Session Summary](./2025-11-13-guardian-crawl-verification/SESSION_SUMMARY.md)

### Session 2025-11-14: Place-Focused CLI Enablement

**Duration**: Active
**Type**: Tooling enhancement
**Completion**: 🔄 In progress

**Focus**:
- Expose place discovery workflows (GuessPlaceHubs, place exploration) via `crawl.js`
- Provide agent-friendly defaults and help text for new commands
- Capture follow-ups for additional place-hub automation

**Location**: `docs/sessions/2025-11-14-place-cli/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-14-place-cli/INDEX.md)
- 📝 [Working Notes](./2025-11-14-place-cli/WORKING_NOTES.md)

### Session 2025-11-14: Page Log Resilience

**Duration**: Active
**Type**: Crawl telemetry
**Completion**: 🔄 In progress

**Focus**:
- Guarantee `_emitPageLog` fires for every crawl fetch outcome (success, cache, failure).
- Keep CLI per-page summaries accurate even when content acquisition aborts a URL.
- Document the logging expectations for future refactors.

**Location**: `docs/sessions/2025-11-14-page-log-resilience/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-14-page-log-resilience/INDEX.md)
- 📝 [Plan](./2025-11-14-page-log-resilience/PLAN.md)
- 🗒️ [Working Notes](./2025-11-14-page-log-resilience/WORKING_NOTES.md)

### Session 2025-11-14: Crawl Download Investigation

**Duration**: Active
**Type**: Crawl analysis
**Completion**: 🔄 In progress

**Focus**:
- Understand why `crawl.js` (basicArticleDiscovery) exited after 51 downloads.
- Inspect queue telemetry, prioritisation filters, and exit reasons for evidence.
- Recommend knobs to reach higher download counts when needed.

**Location**: `docs/sessions/2025-11-14-download-investigation/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-14-download-investigation/INDEX.md)
- 📝 [Plan](./2025-11-14-download-investigation/PLAN.md)
- 🗒️ [Working Notes](./2025-11-14-download-investigation/WORKING_NOTES.md)

### Session 2025-11-14: Basic Crawl Validation

**Duration**: Active
**Type**: Operational validation
**Completion**: 🔄 In progress

**Focus**:
- Run the default intelligent crawl with `--max-downloads 100` to confirm the cap is honored
- Capture runtime telemetry (downloads, articles saved, exit reason) for comparison with prior sessions
- Record observations and follow-ups inside the new session notes

**Location**: `docs/sessions/2025-11-14-basic-crawl-run/`

**Quick Links**:
- 📝 [Session Notes](./2025-11-14-basic-crawl-run/notes.md)

### Session 2025-11-14: Crawl Verbosity Controls

**Duration**: Active
**Type**: Crawl telemetry ergonomics
**Completion**: 🔄 In progress

**Focus**:
- Introduce an `outputVerbosity` option that defaults basic crawls to extra-terse per-page logs
- Format per-page output as `URL downloadMs completed/goal` while preserving CLI overrides for richer logs
- Ensure monitoring and telemetry still track max-download targets accurately under the new formatting

**Location**: `docs/sessions/2025-11-14-crawl-verbosity-controls/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-14-crawl-verbosity-controls/INDEX.md)
- 🗺️ [Plan](./2025-11-14-crawl-verbosity-controls/PLAN.md)
- 📝 [Working Notes](./2025-11-14-crawl-verbosity-controls/WORKING_NOTES.md)

### Session 2025-11-14: Session Bootstrap CLI & Micro Policy

**Duration**: Active
**Type**: Tooling + agent guidance
**Completion**: 🔄 In progress

**Focus**:
- Build a CLI helper to scaffold session directories and standard markdown templates automatically
- Document a decision tree for full sessions vs. lightweight sessions vs. micro tasks
- Introduce a shared micro-task log for tracing very small changes without per-task folders

**Location**: `docs/sessions/2025-11-14-session-bootstrap-cli/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-14-session-bootstrap-cli/INDEX.md)
- 🗺️ [Plan](./2025-11-14-session-bootstrap-cli/PLAN.md)
- 📝 [Working Notes](./2025-11-14-session-bootstrap-cli/WORKING_NOTES.md)

### Session 2025-11-15: API Server Bootstrap

**Duration**: Active
**Type**: Service bootstrap
**Completion**: 🔄 In progress

**Focus**:
- Ensure `src/api/server.js` initializes crawl job and background task infrastructure by default
- Preserve override hooks for custom dependency injection
- Identify validation steps or test coverage gaps introduced by the wiring

**Location**: `docs/sessions/2025-11-15-api-server-bootstrap/`

**Quick Links**:
- 🧭 [Session Index](./2025-11-15-api-server-bootstrap/INDEX.md)
- 🗺️ [Roadmap](./2025-11-15-api-server-bootstrap/ROADMAP.md)
- 📝 [Working Notes](./2025-11-15-api-server-bootstrap/WORKING_NOTES.md)

### Session 2025-11-15: Intelligent Crawl Defaults

**Duration**: Active
**Type**: Crawl tooling refinement
**Completion**: 🔄 In progress

**Focus**:
- Make the intelligent crawl helper download article content by default so max-download caps are meaningful
- Preserve the structure-only workflow behind an explicit `--hub-exclusive` switch
- Capture follow-ups for UI parity if operators need the toggle surfaced elsewhere

**Location**: `docs/sessions/2025-11-15-intelligent-crawl-defaults/`

**Quick Links**:
- 📝 [Session Notes](./2025-11-15-intelligent-crawl-defaults/notes.md)

### Session 2025-11-16: Intelligent Crawl Behavior Persistence

**Duration**: Active
**Type**: Crawl behavior analysis
**Completion**: 🔄 In progress

**Focus**:
- Capture the current intelligent crawl flow after the 404 resilience fixes
- Explain why capped runs terminate early despite healthy downloaders
- Propose planner/persistence tweaks that keep the crawl going without a new start URL

**Location**: `docs/sessions/2025-11-16-intelligent-crawl-behavior/`

**Quick Links**:
- 📝 [Session Notes](./2025-11-16-intelligent-crawl-behavior/notes.md)
- 🧪 [Exit Diagnostics](./2025-11-16-intelligent-crawl-behavior/diagnostic.md)
- 🛠️ [Persistence Fix Plan](./2025-11-16-intelligent-crawl-behavior/fix-plan.md)


---

### Session 2025-11-13: Strategic Planning & Documentation Completion

**Duration**: Full session  
**Type**: Strategic planning, documentation, roadmapping  
**Completion**: ✅ 100% Complete

**Key Deliverables**:
- 10 comprehensive strategic documents (~2,650 lines)
- Tier 1 implementation verification (34/34 tests passing)
- 13-gap roadmap with prioritization
- Agent guidance and training materials

**Location**: `docs/sessions/2025-11-13-strategic-planning/`

**Quick Links**:
- 📋 [Session Index](./2025-11-13-strategic-planning/INDEX.md)
- 🎯 [Session Summary](./2025-11-13-strategic-planning/SESSION_SUMMARY.md)
- 🗺️ [Roadmap & Future Gaps](./2025-11-13-strategic-planning/ROADMAP.md)
- 📚 [All Session Documents](./2025-11-13-strategic-planning/)

---

## How Agents Should Use Session Documentation

### For Active Development (Current Session)
1. **Start each task**: Read current session's INDEX.md for context
2. **During work**: Reference SESSION_SUMMARY.md for decisions and patterns
3. **Before major changes**: Check DECISIONS.md for precedents
4. **Update frequently**: Add notes to WORKING_NOTES.md as you progress

### For Pattern Recognition (Recent Sessions)
1. **Before new feature**: Search recent sessions for similar work
2. **For debugging**: Look for past issues and resolutions
3. **For decision-making**: Reference past options considered

### For Historical Context (Archive)
1. **When confused**: Why was X decided this way?
2. **For evolution**: How did our approach change over time?
3. **For lessons**: What did we learn that still applies?

---

## Session Structure

Each session directory contains:

```
docs/sessions/[YYYY-MM-DD]-[session-slug]/
├── INDEX.md                      ← Start here for session overview
├── SESSION_SUMMARY.md            ← Work completed, metrics, decisions
├── WORKING_NOTES.md              ← Live notes during session
├── DECISIONS.md                  ← Decisions made (ADR-lite format)
├── ROADMAP.md                    ← Tasks, priorities, next steps
├── AGENT_GUIDANCE.md             ← Instructions for agents on this domain
├── DELIVERABLES.md               ← What was created/modified
├── SEARCH_INDEX.md               ← Searchable content index (for agents)
├── FOLLOW_UPS.md                 ← Issues to address next session
└── archive/                      ← Session-specific archives
    ├── backup-docs/
    └── prior-context.md
```

---

## Session File Descriptions

### INDEX.md (Required)
- Quick overview of session objectives
- Status at a glance
- Links to key documents
- How to use this session's docs

### SESSION_SUMMARY.md (Required)
- What was accomplished
- Metrics and measurements
- Key decisions made
- Problems encountered
- Lessons learned
- Recommendations for next session

### WORKING_NOTES.md (Required)
- Live notes during development
- Decisions as they're made
- Blockers and solutions
- Questions to research
- Ideas for future work

### DECISIONS.md (Required)
- ADR-lite format entries
- One entry per major decision
- Context, options, decision, consequences
- Date and decision-maker

### ROADMAP.md (Required)
- Current session's tasks (done, in-progress, pending)
- Next session recommended priorities
- Effort estimates
- Dependencies and blockers

### AGENT_GUIDANCE.md (Conditional)
- Domain-specific guidance for agents
- How to approach problems in this area
- Tools and techniques available
- Common pitfalls and solutions
- Examples and patterns

### DELIVERABLES.md (Conditional)
- List of all files created/modified
- Brief description of each
- Links to implementation
- Test results and metrics

### SEARCH_INDEX.md (Required)
- Searchable keywords from session
- Function names, file paths, concepts
- Brief context snippets (for agents)
- Links to relevant sections

### FOLLOW_UPS.md (Required)
- Issues to address next session
- Questions that need research
- Incomplete tasks
- Blocked items and blockers
- Recommended next steps

---

## Example Session Usage

### Scenario: Starting New Task
```
1. Agent opens: docs/sessions/[CURRENT]/INDEX.md
   → Gets overview of current work
   
2. Agent reads: docs/sessions/[CURRENT]/SESSION_SUMMARY.md
   → Understands decisions and context
   
3. Agent searches: docs/sessions/[CURRENT]/SEARCH_INDEX.md
   → Finds relevant prior work
   
4. Agent reads: docs/sessions/[CURRENT]/AGENT_GUIDANCE.md
   → Learns domain-specific approaches
   
5. Agent executes with informed context
```

### Scenario: Debugging Unknown Issue
```
1. Agent searches: Current session's SEARCH_INDEX.md
   → No match found
   
2. Agent searches: Recent sessions (last 4 weeks)
   → Finds similar issue reported 2 weeks ago
   
3. Agent reads: Prior session's DECISIONS.md
   → Learns why that approach was rejected
   
4. Agent reads: Archive for historical context
   → Understands architectural evolution
   
5. Agent makes informed decision based on full history
```

---

## Agent Memory Operations

### Quick Memory (Current Session)
**Operation**: `grep -r "keyword" docs/sessions/[CURRENT]/`  
**Use Case**: Find what was done today/this session  
**Speed**: <100ms  
**Accuracy**: 95%+

### Medium Memory (Last 4 weeks)
**Operation**: `grep -r "keyword" docs/sessions/` (exclude archive)  
**Use Case**: Find patterns from recent work  
**Speed**: <500ms  
**Accuracy**: 90%+

### Long Memory (All history)
**Operation**: `grep -r "keyword" docs/sessions/` (include archive)  
**Use Case**: Historical context and evolution  
**Speed**: 1-2s  
**Accuracy**: 85%+ (may need filtering)

---

## Tools for Agents (Recommended)

### Search Current Session
```bash
# Find all mentions of "payment" in current session
node tools/dev/js-scan.js --search "payment" docs/sessions/2025-11-13-strategic-planning/

# Find decisions related to refactoring
grep -n "refactor" docs/sessions/2025-11-13-strategic-planning/DECISIONS.md
```

### Search Recent Sessions
```bash
# Find similar issues from last month
find docs/sessions -type f -mtime -30 | xargs grep "issue-type"

# Get context from 3 weeks ago
grep -r "feature-name" docs/sessions --include="*.md" | head -20
```

### Build Agent Context
```bash
# Create a quick context file for new agent
cat docs/sessions/[CURRENT]/INDEX.md
cat docs/sessions/[CURRENT]/ROADMAP.md
cat docs/sessions/[CURRENT]/SEARCH_INDEX.md
# → Ready to work with full context
```

### Tooling References
- `docs/COMMAND_EXECUTION_GUIDE.md` — approved shell usage, encoding setup, and the repository’s no-Python rule.
- `docs/TESTING_QUICK_REFERENCE.md` — sanctioned Jest runners (`npm run test:by-path`, `npm run test:file`) and when to run them.
- `docs/AGENT_REFACTORING_PLAYBOOK.md` — end-to-end examples for `tools/dev/js-scan.js` and `tools/dev/js-edit.js`, including Gap 2/3/5/6 workflows.
- `tools/dev/README.md` — CLI flag reference for js-scan/js-edit/md-scan/md-edit.

### Workflow Playbooks
- Start at `docs/INDEX.md` for the curated map of workflow, agent, and standards documents.
- `docs/workflows/planning_review_loop.md` explains the plan → implement → verify cadence expected in session folders.
- `docs/AI_AGENT_DOCUMENTATION_GUIDE.md` outlines how session folders, summaries, and follow-ups fit together.
- `docs/agents/` contains persona-specific guides; cross-check the relevant `.agent.md` when taking over work from another agent.

---

## Session Lifecycle

### Active Session (Days 1-3)
- Live updates to WORKING_NOTES.md
- Frequent DECISIONS.md additions
- Regular ROADMAP.md updates
- End-of-day updates to SESSION_SUMMARY.md

### Wrapping Session (Day 4)
- Finalize SESSION_SUMMARY.md
- Archive WORKING_NOTES.md
- Complete DELIVERABLES.md
- Create SEARCH_INDEX.md
- Document FOLLOW_UPS.md

### Archiving (Day 5+)
- Move to recent sessions index
- Update parent INDEX.md with link
- After 8 weeks: move to archive/
- Maintain SEARCH_INDEX.md for searching

---

## Best Practices for Sessions

### For Humans/Teams
- **Update daily**: Keep WORKING_NOTES.md current
- **Decide clearly**: Document in DECISIONS.md when choices are made
- **Plan ahead**: Use ROADMAP.md to guide each day
- **Archive properly**: Complete SESSION_SUMMARY.md before moving on

### For Agents
- **Search first**: Check SEARCH_INDEX.md before asking humans
- **Read context**: Session overview before diving into details
- **Respect history**: Consider past decisions (in DECISIONS.md)
- **Add notes**: Update WORKING_NOTES.md with key findings
- **Report back**: Document results in DELIVERABLES.md

---

## Session Naming Convention

```
YYYY-MM-DD-session-slug

Examples:
- 2025-11-13-strategic-planning
- 2025-11-06-tier1-implementation
- 2025-10-29-performance-optimization
- 2025-10-15-refactor-database-adapters
```

---

## Accessing Session Documentation

### From Any Location
```bash
# Navigate to session hub
cd docs/sessions

# List active sessions
ls -la

# View current session
cat docs/sessions/2025-11-13-strategic-planning/INDEX.md

# Search across all sessions
grep -r "search-term" docs/sessions/
```

### From Agent Code
```javascript
// Load current session context
const currentSession = require('./docs/sessions/current.json');
const summary = fs.readFileSync(currentSession.path + '/SESSION_SUMMARY.md', 'utf8');

// Search for related work
const searchIndex = JSON.parse(fs.readFileSync('./docs/sessions/SEARCH_INDEX.md', 'utf8'));
const matches = searchIndex.find(item => item.keywords.includes('refactor'));
```

---

## Session Index

### 2025 Sessions
- [2025-11-13: Strategic Planning & Documentation](./2025-11-13-strategic-planning/INDEX.md)
- [2025-11-14: Place-Focused CLI Enablement](./2025-11-14-place-cli/INDEX.md)

### Previous Sessions Archive
- Location: `docs/sessions/archive/`
- Access: By date or topic
- Search: Full-text search across all sessions

---

## Next Steps

1. **Review**: Read the current session's INDEX.md
2. **Understand**: Check SESSION_SUMMARY.md for context
3. **Plan**: Reference ROADMAP.md for next tasks
4. **Execute**: Use AGENT_GUIDANCE.md for domain knowledge
5. **Update**: Add findings to WORKING_NOTES.md
6. **Decide**: Document choices in DECISIONS.md

---

**Last Updated**: November 15, 2025  
**Current Session**: 2025-11-15-intelligent-crawl-defaults  
**Maintenance**: Add new sessions as they complete  
**For Agents**: This is your memory system. Use it!

