Living Agent Workflow (Plan → Improve → Document)

Purpose. This file is the hub for all agent work. Treat AGENTS.md as a concise, living playbook: it tells you what to do next, where to look, and how to improve this playbook itself as you learn. All source lives under /src (e.g., /src/modules, /src/db, /src/models, /src/utils), with /tests and /docs at the root. The north star: reduce tech debt, preserve reliability, and evolve a modular, high-performance data layer via swappable /src/db adapters (Postgres, Mongo, etc.) and clean service boundaries—documenting the why and how as you go with JSDoc and brief decision notes.

Doc topology. Keep this file focused and actionable. Heavier guidance lives in /docs and is indexed from /docs/INDEX.md. When you add or change workflows, first update AGENTS.md (short, prescriptive steps), then create/modify deeper guides:

/docs/INDEX.md – the table of contents the agents consult first.

/docs/agents/ – one page per agent persona or recurring task (Refactorer, DB-Perf, Tests, Docs).

/docs/workflows/ – durable how-to playbooks (e.g., “Modularising a DB adapter,” “Extracting a service from a module”).

/docs/decisions/ – ADR-lite notes: date, context, options, decision, consequences.
AGENTS.md should link to these pages and assign follow-ups (“If X arises, consult and improve Y.md”). Each time you learn something, push it down into the right doc and tighten the index.

Core directives (always-on)

Plan-first. Before edits, create/refresh a one-screen Plan (see template below). State scope, risks, success criteria, test/benchmark intent, and docs you’ll touch.

Prefer small, reversible steps. Sequence work into short, verifiable changes; keep deltas narrow across /src/modules ↔ /src/db ↔ /src/models.

Document the boundaries. Public functions/classes get JSDoc with parameters, returns, invariants, and side-effects. Record non-obvious trade-offs in a short ADR-lite.

Data layer through adapters. All persistence goes via /src/db/ adapters/repositories. No inline SQL/driver calls in services or modules.

Performance by design. Eliminate N+1, batch with joins/IN (...)/eager loading, use transactions/sessions for multi-step writes, and target indexed predicates (inspect plans with EXPLAIN or profilers). Prefer bulk ops over per-row loops.

Tests are non-negotiable. For every fix or feature: focused unit/integration tests + a regression test if you killed a bug. Add a tiny benchmark when DB-heavy behavior might shift.

Tight feedback. After each change: self-review the diff; run tests; update JSDoc + docs; capture a decision note if you chose between viable options.

The improvement loop (run this every task)

0) Sync the doc hub. Open AGENTS.md and /docs/INDEX.md. If your task is new or unclear, add a stub link under Workflows or Agents and note what you expect to fill in.

1) Discover. Read the smallest slice of code that reproduces the need (callers/callees, related modules, adapter methods). Sketch affected files under /src. Note current pain (duplication, coupling, slow query patterns) in your Plan.

2) Plan. Write/refresh a one-screen plan in your PR or /docs/reports/PLAN-<short-slug>.md. Keep it actionable:

Objective (single sentence) and Done when… (3–5 criteria).

Change set (files you’ll touch/create).

Risks/assumptions (e.g., schema expectations, concurrency).

Tests (which to add or adapt) and Benchmarks (if DB-heavy).

Docs to update (AGENTS.md section, specific guides, index).

3) Design quick review. Cross-check the plan against this file’s Core directives and the index. If you’re changing the DB boundary, read /docs/workflows/db-adapter-modularisation.md. If repeating a pattern, improve that pattern doc.

4) Implement in short hops. Modern JS (ES2020+), small functions, single responsibility, early returns, clear names. Keep services thin, push persistence into adapters, keep utils generic. Prefer extracting helpers to /src/utils over copy-paste.

5) Verify. Run focused tests. If behavior changes intentionally, update/append tests. For DB-heavy paths, add a tiny scenario benchmark (e.g., seed 1k rows; assert runtime bound and query count).

6) Document & decide.

Add/refresh JSDoc on public APIs you touched.

Record an ADR-lite in /docs/decisions/ when you trade off options (date, context, options, decision, consequences). Link it from your PR.

If you improved a reusable workflow, update or create a page under /docs/workflows/ and tighten /docs/INDEX.md.

7) Retrospect & improve AGENTS.md. Add a one-paragraph What changed in our process? to the PR. If steps here were unclear/redundant, improve AGENTS.md now (tighten wording, add a pointer, demote detail into a workflow page). Treat this file like code: small, focused improvements every task.

Templates you can paste as you work

Plan (≤1 screen)

# Plan: <short slug>
Objective: <one sentence>
Done when:
- <criterion 1>
- <criterion 2>
Change set: </src/... files + any /docs pages>
Risks/assumptions: <latency, schema, concurrency, rollout>
Tests: <new/updated unit/integration/regression>
Benchmark (if DB-heavy): <dataset size, target budget, query count>
Docs to update: <AGENTS.md section + workflow pages + INDEX.md>


ADR-lite (decisions/<yyyy-mm-dd>-<slug>.md)

Context: <what forced the choice>
Options: <A / B / C>
Decision: <chosen option + why>
Consequences: <trade-offs, migrations, follow-ups>
Links: <PR, benchmarks, related workflows>


Retrospective (append to PR)

What worked: <1–3 bullets>
What to change in our workflow/docs next time: <1–3 bullets + links you updated>

DB adapter checklist (performance-focused)

Boundary: No direct driver/ORM calls outside /src/db/. Services depend on adapter interfaces.

Query shape: Avoid SELECT *; return explicit columns/fields. Batch related reads (joins/IN (...)/eager loading).

N+1: Proactively search for per-row subqueries; replace with bulk fetches.

Transactions: Group multi-write operations; ensure atomicity and clear rollback behavior.

Indexes: Query by indexed predicates; review plans (EXPLAIN) for hot paths.

Throughput: Prefer bulk insert/update APIs. Avoid per-row loops; push work to the database where sane.

Docs: For non-trivial queries/migrations, add a comment block with intent, complexity, and expected row counts; link any micro-benchmarks.

How AGENTS.md stays small (and smart)

Keep AGENTS.md prescriptive and brief; move deep detail into /docs/workflows/ and /docs/agents/, and link them here.

Each task that surfaces a gap results in one improvement: a clarified step, a new pointer, or an index tweak. Avoid bloating this page—promote detail outward.

Use /docs/INDEX.md as your “map”: every time you add a guide, add or refine its entry with 1-line purpose and tags (e.g., db, refactor, tests).

If you find duplication across docs, consolidate under the most general workflow and replace others with pointers.

Quick start (what to do right now)

Open AGENTS.md and skim Core directives.

Create/refresh your Plan (template above).

Check /docs/INDEX.md; if your path lacks a workflow, add a stub and link it here.

Implement in short hops; keep adapters clean and measured.

Prove it with tests (and a tiny benchmark if DB-heavy).

Write/refresh JSDoc; add ADR-lite if you made a choice.

Update AGENTS.md and the index with exactly one small improvement you wish you had at step 2.

This loop keeps the code modular, the database fast, and the documentation self-healing—so each pass makes both the system and this playbook sharper.