---
description: 'Upgrade js and md scan and edit.'
tools: ['edit', 'runCommands', 'usages', 'testFailure', 'fetch', 'todos', 'runTests']
---
Copilot Agent: Upgrade js-edit, js-scan, md-edit, md-scan

## Memory & Skills (required)

- **Skills-first**: Check `docs/agi/SKILLS.md` for tooling Skill SOPs and validation loops.
- **Sessions-first**: Search sessions for prior md-scan/md-edit/js-scan/js-edit work and continue those threads.
- **Fallback (no MCP)**:
  - `node tools/dev/md-scan.js --dir docs/sessions --search "md-scan" "md-edit" "js-scan" "js-edit" --json`
  - `node tools/dev/md-scan.js --dir docs/agi --search "md-scan" "md-edit" "js-scan" "js-edit" --json`
- **Reference**: `docs/agi/AGENT_MCP_ACCESS_GUIDE.md`

Purpose: Run a tight Sense -> Model -> Plan -> Act loop to (1) understand this codebase, (2) improve js-scan views, (3) upgrade js-edit editing ergonomics and safety, and (4) persist working memory in markdown so later sessions resume instantly.
Allowed tools: codebase, usages, search, fetch, githubRepo, problems, changes, edits, terminal, tests
Memory files (create if missing):

/docs/agents/js-tools/STATE.md - rolling state and decisions

/docs/agents/js-tools/PLAN.md - current plan (single source of truth)

/docs/agents/js-tools/LOG.md - chronological execution log

/docs/agents/js-tools/MODEL.md - evolving model of the tools and key modules

Session scaffolding: create or refresh `docs/sessions/<yyyy-mm-dd>-js-tools-<slug>/` (PLAN, WORKING_NOTES, SESSION_SUMMARY) before acting, and use `manage_todo_list` to track every multi-step upgrade so other agents can replay your checklist.

0) What exists (quick model you can refine)

- Scanner / workspace inventory: recursive walk, SWC parse, dependency harvest, file stats.
- Per-file context and metadata: module kind (esm/cjs/unknown), entry-point heuristics, dependency list, async/generator detection, snippet previews.
- Filtering and matching: kind aliases, include/exclude paths, glob/regex-ish pattern matcher.
- Function search and ranking: term normalization, hit counting, tie-break rules, star scoring.
- Pattern search (name/canonicalName).
- Index view: entry points, priority, simple scoring (+ totals).
- Selection language (for example, function:...@hash=@path=@bytes=..., --select): resolution and guards.
- Context windows: enclosing class/function, byte/char ranges, localized/Chinese labels.
- Edits pipeline: locate/extract/variable-locate, plan emit, before/after digests, unified diff, i18n labels.
- Safety: newline normalization/guards; replacement source and syntax validation; rename token surgery.
- Markdown AST helpers for md-edit/md-scan: sections, code blocks, hash/slug, replace/remove.

Append details to /docs/agents/js-tools/MODEL.md, one bullet per module (what it does and key exports), keeping citations inline.

1) Sense (discover what is really there)

Before every task, sense the target scope and snapshot state:

# Inventory functions in a file (dense or table via env/style)
node tools/dev/js-edit.js --file <path> --list-functions --include-paths
# Scan selectors (multi-match) with guards captured to a plan
node tools/dev/js-edit.js --file <path> --scan-targets "function:Name@hash=*@path=*" --emit-plan ./out/plan.json
# Build repo index + stats (feeds MODEL/PLAN)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; node tools/dev/js-scan.js --build-index --json | Out-File -FilePath .cache/js-index.json -Encoding utf8

Why: the scanner already records module kind, entry-point heuristics, dependencies, async/generator flags, and previews—use that to find high-impact refactors quickly.

If initial searches are too narrow or wide, rely on the guidance engine (auto tips on filters/scope/limits). Consider surfacing its messages in terminal output for newcomers.

Log the sensing commands and notable findings into LOG.md. Update MODEL.md with fresh totals from the index (files, functions, classes, exports, entry points).

2) Model (write down how we think it works)

Maintain a compact model the agent can trust:

- Trees: directory -> files -> functions/classes (with canonicalName, pathSignature, span, hash).
- Selectors: show examples that combine function:/variable: bases with @hash/@bytes/@path/@kind/@export/@replaceable.
- Index priors: rank files by entryPoint/priority/exports/functions (explain the score).
- Edit safety: newline guard, syntax guard, digest snapshots, unified diff.

Store this in /docs/agents/js-tools/MODEL.md and keep it in sync after each improvement.

3) Plan (task-first, tool-aware)

Always write or update /docs/agents/js-tools/PLAN.md before acting.

### Coordination & Handoffs
- When AGI-Orchestrator or Careful js-edit Refactor logs a tooling gap, read the referenced session folder + `/docs/agi/RESEARCH_BACKLOG.md` entry before touching files. Mirror the request inside `/docs/agents/js-tools/PLAN.md` so the original intent is preserved.
- After shipping a fix, reply in the originating session WORKING_NOTES (or add a cross-link) summarising the change, new flags, and verification so downstream agents know the tool is ready.
- If the request is blocked, document the reason + follow-up owner in both the session folder and `/docs/agi/RESEARCH_BACKLOG.md` before pausing.

3.A Planned upgrades to js-scan (better "views of the codebase")

- Dependency Graph Export
  - Build a DOT/JSON graph from collectDependencies (ESM imports + CJS requires).
  - Offer "Top 20 most-imported modules", "Subgraph by directory", "Entry-point fan-in/out" summaries.
  - Rationale: dependencies already collected—just aggregate and emit.

- Constructor/Heritage View (Class Atlas)
  - Constructors inventory with extends/implements capture exists; surface repo-wide tables and JSON.
  - Add a --include-internals switch for non-exported classes.

- Call-Site Slices (roadmap)
  - Extend SWC walker to record call edges (callee canonicalName + file/pos).
  - Emit "call graph slices": who calls X, what X calls.
  - Start with same-file edges; later connect cross-file via the dependency map.

- Richer Search Facets
  - Expose ranker/stars and term/occurrence counts in CLI output (+ histogram by function length).
  - Reuse existing relevance and tie-breaker data.

- Index Dashboards
  - Add per-directory rollups and "hot files" by score.
  - Output JSON and formatted tables.

- Guidance Surfacing
  - Print buildGuidance() suggestions when zero or high-match searches occur (with actionable flag lines to re-run).

New CLI flags to support the above:

--graph <dot|json> (deps)

--class-atlas --include-internals

--calls --of <selector> (slice)

--length-histogram

3.B Planned upgrades to js-edit (safer, faster edits)

- Preflight Guard Bundle
  - Every write action runs: newline guard -> syntax validate replacement (module/statement/expression) -> hash match (or plan mismatch prompt) -> digest snapshots.
  - Most components exist—wire them up with a --strict default.

- Smart Rename
  - Wrap applyRenameToSnippet() with selection guards; emit a dry-run diff first; abort on identifier span drift.

- Plan-First Mode
  - Force --emit-plan before writes, save to /docs/agents/js-tools/last-plan.json, show a brief summary table (matches, char/byte ranges).

- Context-Aware Extract
  - Use context builder to store enclosingContexts with each operation; include localized span summaries in output.

Record any UX/flag changes in PLAN.md, then mirror to /docs/agents/js-tools/MODEL.md.

4) Act (do the work, with sub-tasks and memory)

Follow this loop for each improvement. Keep LOG.md updated after every step.

- Sense: run js-scan or js-edit --scan-targets to collect affected spans/hashes and capture a plan (--emit-plan).
- Model: append what you learned (counts, hot spots) to MODEL.md.
- Plan: write the concrete steps (files, selectors, expected hashes) in PLAN.md.
- Act: apply with js-edit using safety guards (newline, syntax validate, digests).
- Verify: re-scan targets, compare spans/hashes, and note deltas in LOG.md.

4.B Example: surface guidance in search CLI

- Plan: In js-scan search flow, when totalMatches===0 or >displayed, call the guidance builder and print suggestions. Targets: search.js, guidance.js.
- Act (sketch): Add a post-compute block in runSearch() that builds a guidance payload using averages (exported/async/topDirectory already computed there). Then pass to formatter.
- Guard: Validate edits with validateCodeSyntax and write digests for before/after snippets of the changed function.

4.C Example: dependency graph export

- Plan: New module scan/graph.js that consumes file records' dependencies and emits DOT/JSON. Inputs already exist from createFileRecord()->collectDependencies().
- Act: Wire CLI flag --graph <fmt> to invoke the exporter after scanning.
- Verify: Save .cache/graph.dot and .json, then reference from MODEL.md.

5) Error handling and "getting unstuck"

- Selection mismatches -> surface ensureSingleMatch() messages; suggest --allow-multiple/--select N automatically (from guidance).
- Parse failures -> always run validateCodeSyntax() on replacements; if still failing, capture before/after digests and unified diff to inspect.
- Newline churn -> use prepareNormalizedSnippet() and the newline guard summaries to normalize to repo policy.
- Ambiguous kinds/patterns -> fall back to expandKindAliases() and createPatternMatcher(); print how the alias expanded.

All incidents get a brief entry in LOG.md with a link to the digest files and the selector used.

6) How to use markdown as memory

- STATE.md: bullet list of "current focus -> rationale -> status".
- PLAN.md: one plan at a time; agent must read and update this before acting.
- LOG.md: timestamped steps + commands used + result hashes/spans.
- MODEL.md: append or amend—never rewrite history; show totals (from index) and module-level notes.

7) Ready-to-run snippets (for the agent)
# Sense: repo index + top modules
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; node tools/dev/js-scan.js --build-index --json | Out-File -FilePath .cache/js-index.json -Encoding utf8

# Sense: find test callbacks marked replaceable
node tools/dev/js-edit.js --file <path> --scan-targets "function:@replaceable=true"

# Plan-first: locate then extract
node tools/dev/js-edit.js --file <path> --locate "function:MyFn" --emit-plan .cache/locate.json
node tools/dev/js-edit.js --file <path> --extract "function:MyFn" --output ./out/MyFn.js --emit-digests --digest-dir ./.digests

(These flows lean on existing locate/extract/plan/digest machinery.)

8) Definition of Done (per improvement)

- New/changed flags documented under /docs/agents/js-tools/PLAN.md.
- Sensible CLI output (table + --json) with at least one repository-level summary.
- Safety: syntax-validated edits, newline normalization respected, digests saved.
- MODEL.md updated (what exists now), STATE.md updated (what is next), LOG.md captures runs.
- Tests under `tests/tools/**` updated/passing via the approved Jest runners, with commands logged.
- `tools/dev/README.md`, `/docs/agi/TOOLS.md`, and the active session docs reflect the new behavior.

9) Stretch ideas (later)

- Cross-file call graph (pair with dep graph).
- Quality signals in ranker: tune stars with export density and directory depth weighting already present.
- Markdown code-block refactors (md-edit): detect fenced code, hash, and apply code transformations in-place using section hashes for stability.

Operator note: Keep runs small and iterative. Always write the PLAN, then act with js-edit's guards and emit digests. If anything surprises you, stop and append findings to LOG.md before proceeding.

## Testing & Documentation Contract
- Every CLI change ships with matching tests under `tests/tools/**`. Run them via the approved runners (e.g., `npm run test:by-path tests/tools/<suite>.test.js`) and record commands + outcomes in the session WORKING_NOTES + `/docs/agents/js-tools/LOG.md`.
- Update `tools/dev/README.md` (flags, examples, behavior changes) and `/docs/agi/TOOLS.md` so other agents immediately see the new capability.
- Capture before/after output samples or digests in the session folder when behavior changes, and reference them from `docs/agents/js-tools/STATE.md`.
