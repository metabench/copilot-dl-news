---
description: 'Upgrade js and md scan and edit.'
tools: ['edit', 'runCommands', 'usages', 'testFailure', 'fetch', 'todos', 'runTests']
---
Copilot Agent: Upgrade js-edit, js-scan, md-edit, md-scan

Purpose: Run a tight Sense → Model → Plan → Act loop to (1) understand this codebase, (2) improve js-scan views, (3) upgrade js-edit editing ergonomics & safety, and (4) persist working memory in markdown so later sessions resume instantly.

Allowed tools: codebase, usages, search, fetch, githubRepo, problems, changes, edits, terminal, tests
Memory files (create if missing):

/docs/agents/js-tools/STATE.md – rolling state & decisions

/docs/agents/js-tools/PLAN.md – current plan (single source of truth)

/docs/agents/js-tools/LOG.md – chronological execution log

/docs/agents/js-tools/MODEL.md – evolving model of the tools & key modules

0) What exists (quick model you can refine)

Scanner / workspace inventory: recursive walk, SWC-parse, dependency harvest, file stats.

Per-file context & metadata: module kind (esm/cjs/unknown), entry-point heuristics, dependency list, async/generator detection, snippet previews.

Filtering & matching: kind aliases, include/exclude paths, glob/regex-ish pattern matcher.

Function search & ranking: term normalization, hit counting, tie-break rules, star scoring.

Pattern search (name/canonicalName).

Index view: entry points, priority, simple scoring (+ totals).

Selection language (e.g., function:...@hash=@path=@bytes=..., --select): resolution & guards.

Context windows: enclosing class/function, byte/char ranges, localized/Chinese labels.

Edits pipeline: locate/extract/variable-locate, plan emit, before/after digests, unified diff, i18n labels.

Safety: newline normalization/guards; replacement source & syntax validation; rename token surgery.

Markdown AST helpers for md-edit/md-scan: sections, code blocks, hash/slug, replace/remove.

Append details to /docs/agents/js-tools/MODEL.md, one bullet per module (what it does & key exports), keeping citations inline.

1) Sense (discover what’s really there)

Before every task, sense the target scope and snapshot state:

# Inventory functions in a file (dense or table via env/style)
node js-edit.js --file <path> --list-functions --include-paths
# Scan selectors (multi-match) with guards captured to a plan
node js-edit.js --file <path> --scan-targets "function:Name@hash=*@path=*" --emit-plan ./out/plan.json
# Build repo index + stats (feeds MODEL/PLAN)
node js-scan.js --index --json > .cache/js-index.json


Why: the scanner already records module kind, entry-point heuristics, deps, async/generator, previews—use that to find high-impact refactors quickly.

If initial searches are too narrow/wide, rely on the guidance engine (auto tips on filters/scope/limits). Consider surfacing its messages in terminal output for newcomers.

Log the sensing commands & notable findings into LOG.md. Update MODEL.md with fresh totals from the index (files, functions, classes, exports, entry points).

2) Model (write down how we think it works)

Maintain a compact model the agent can trust:

Trees: directory → files → functions/classes (with canonicalName, pathSignature, span, hash).

Selectors: show examples that combine function:/variable: bases with @hash/@bytes/@path/@kind/@export/@replaceable.

Index priors: rank files by entryPoint/priority/exports/functions (explain the score).

Edit safety: newline guard, syntax guard, digest snapshots, unified diff.

Store this in /docs/agents/js-tools/MODEL.md and keep it in sync after each improvement.

3) Plan (task-first, tool-aware)

Always write or update /docs/agents/js-tools/PLAN.md before acting.

3.A Planned upgrades to js-scan (better “views of the codebase”)

Dependency Graph Export
Build a DOT/JSON graph from collectDependencies (ESM imports + CJS requires). Then offer:

“Top 20 most-imported modules”

“Subgraph by directory”

“Entry-point fan-in/out”
Rationale: deps already collected—just aggregate & emit.

Constructor/Heritage View (Class Atlas)
There’s already a constructors inventory with extends/implements capture; surface repo-wide tables and JSON, plus a --include-internals switch for non-exported classes.

Call-Site Slices (roadmap)
Extend SWC walker to record call edges (callee canonicalName + file/pos). Emit “call graph slices”: who calls X, what X calls. Start with same-file edges; later cross-file using the dependency map. (New feature; leverage existing span/byte indices & canonical names.)

Richer Search Facets
Expose the ranker/stars & term/occurrence counts in CLI output (+ histogram by function length). Already have relevance and tie-breakers; format them.

Index Dashboards
Current index totals are great—add per-directory rollups and “hot files” by score. Output JSON & pretty tables.

Guidance Surfacing
Print buildGuidance() suggestions when zero/high-match searches occur (with actionable flag lines to re-run).

New CLI flags

--graph <dot|json> (deps)

--class-atlas --include-internals

--calls --of <selector> (slice)

--length-histogram
These are thin wrappers around data already produced or easily derivable.

3.B Planned upgrades to js-edit (safer, faster edits)

Preflight Guard Bundle
Every write action runs: newline guard → syntax validate replacement (module/statement/expression) → hash match (or plan mismatch prompt) → digest snapshots. Most of this exists—just wire it as a standard preflight with a --strict default.

Smart Rename
Wrap applyRenameToSnippet() with selection guards; emit a dry-run diff first; abort on identifier span drift.

Plan-First Mode
Force --emit-plan before writes, save to /docs/agents/js-tools/last-plan.json, show a brief summary table (matches, char/byte ranges). (APIs for plan/digests already exist.)

Context-Aware Extract
Use context builder to store enclosingContexts with each operation; include localized span summaries in output.

Record any UX/flag changes in PLAN.md, then mirror to /docs/agents/js-tools/MODEL.md.

4) Act (do the work, with sub-tasks & memory)

Follow this loop for each improvement. Keep LOG.md updated after every step.

4.A Sub-task template

Sense: run js-scan or js-edit --scan-targets to collect affected spans/hashes and capture a plan (--emit-plan).

Model: append what you learned (counts, hot spots) to MODEL.md.

Plan: write the concrete steps (files, selectors, expected hashes) in PLAN.md.

Act: apply with js-edit using safety guards (newline, syntax validate, digests).

Verify: re-scan targets, compare spans/hashes, and note deltas in LOG.md.

4.B Example: surface Guidance in search CLI

Plan

In js-scan search flow, when totalMatches===0 or >displayed, call the guidance builder and print suggestions. Targets: search.js, guidance.js.

Act (sketch)

Add a post-compute block in runSearch() that builds a guidance payload using averages (exported/async/topDirectory already computed there). Then pass to formatter.

Guard

Validate edits with validateCodeSyntax and write digests for before/after snippets of the changed function.

4.C Example: dependency graph export

Plan

New module scan/graph.js that consumes file records’ dependencies and emits DOT/JSON. Inputs already exist from createFileRecord()->collectDependencies().

Act

Wire CLI flag --graph <fmt> to invoke the exporter after scanning.

Add repo-level stats (fan-in/fan-out leaders).

Verify

Save .cache/graph.dot & .json, then reference from MODEL.md.

5) Error handling & “getting unstuck”

Selection mismatches → Surface ensureSingleMatch() messages; suggest --allow-multiple/--select N automatically (from guidance).

Parse failures → Always run validateCodeSyntax() on replacements; if still failing, capture before/after digests and unified diff to inspect.

Newline churn → Use prepareNormalizedSnippet() and the newline guard summaries to normalize to repo policy.

Ambiguous kinds/patterns → fall back to expandKindAliases() and createPatternMatcher(); print how the alias expanded.

All incidents get a brief entry in LOG.md with a link to the digest files and the selector used.

6) How to use markdown as memory

STATE.md: bullet list of “current focus → rationale → status”.

PLAN.md: one plan at a time; agent must read & update this before acting.

LOG.md: timestamped steps + commands used + result hashes/spans.

MODEL.md: append or amend—never rewrite history; show totals (from index) and module-level notes.

7) Ready-to-run snippets (for the agent)
# Sense: repo index + top modules
node js-scan.js --index --json > .cache/js-index.json

# Sense: find test callbacks marked replaceable
node js-edit.js --file <path> --scan-targets "function:@replaceable=true"

# Plan-first: locate then extract
node js-edit.js --file <path> --locate "function:MyFn" --emit-plan .cache/locate.json
node js-edit.js --file <path> --extract "function:MyFn" --output ./out/MyFn.js --emit-digests --digest-dir ./.digests


(These flows lean on existing locate/extract/plan/digest machinery.)

8) Definition of Done (per improvement)

New/changed flags documented under /docs/agents/js-tools/PLAN.md.

Sensible CLI output (table + --json) with at least one repository-level summary.

Safety: syntax-validated edits, newline normalization respected, digests saved.

MODEL.md updated (what exists now), STATE.md updated (what’s next), LOG.md captures runs.

9) Stretch ideas (later)

Cross-file call graph (pair with dep graph).

Quality signals in ranker: tune stars with export density & directory depth weighting already present.

Markdown code-block refactors (md-edit): detect fenced code, hash, and apply code transformations in-place using section hashes for stability.

Operator note: Keep runs small and iterative. Always write the PLAN, then act with js-edit’s guards and emit digests. If anything surprises you, stop and append findings to LOG.md before proceeding.