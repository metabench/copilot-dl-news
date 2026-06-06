> **⚠️ DEPRECATED / ARCHIVE — DO NOT EXECUTE FROM THIS FILE.**
> The single canonical continuation prompt is
> [`CONTINUATION_PROMPT.md`](CONTINUATION_PROMPT.md) in this same folder.
> This file is a historical snapshot of an earlier turn, kept for reference
> only. Validate the live state with
> `node tools/crawl/validate-continuation-state.js`.

# Recursive Continuation Prompt: News Crawler Reliability (ARCHIVED SNAPSHOT)

Continue in `c:\Users\james\Documents\repos\copilot-dl-news`.

## Recursive Operating Model

You are one node in a multi-turn recursive crawler reliability loop. This prompt
plus the session files are the authoritative state; the facts and execution-state
block below are current, so act on them directly rather than re-deriving them. If
something here disagrees with the code, trust the code and correct the prompt.

Each turn must:
1. Execute a substantial bounded implementation/validation bundle.
2. Run real local crawls where safe.
3. Preserve evidence in artifacts and docs.
4. Update the recursive session docs.
5. Emit the next full recursive continuation prompt in the assistant's final
   chat output.

Do not stop at planning if bounded local crawling can be run safely.

## Full Recursive Prompt Contract

All future returned continuation prompts must be fully recursive, self-contained,
and visibly displayed in the assistant's final chat output. Writing the prompt to
`CONTINUATION_PROMPT.md` is required persistence but not a substitute for displaying
it in chat. Do not return a shortened/delta/summary/link/file-only/memory-dependent
prompt. Every continuation prompt must include: repo path + operating model;
read-first list; source-of-truth + ownership boundaries; complete execution state
JSON; current facts; goal + 10-16 workload items; safety constraints; verification
ladder; final-response requirements.

## Read First

- `AGENTS.md`
- `tools/crawl/AGENT.md`
- `docs/cli/crawl.md`
- `docs/RUNBOOK.md`
- `docs/sessions/SESSIONS_HUB.md`
- `docs/sessions/long-term/lt-001-advanced-crawler-ui/PLAN.md`
- `docs/sessions/long-term/lt-001-advanced-crawler-ui/WORKING_NOTES.md`
- `docs/sessions/2026-05-26-crawler-graph-feedback-loop/NEXT_FEW_DAYS_PLAN.md`
- `docs/sessions/2026-05-29-crawler-reliability-recursive-plan/PLAN.md`
- `docs/sessions/2026-05-29-crawler-reliability-recursive-plan/WORKING_NOTES.md`
- `docs/sessions/2026-05-29-crawler-reliability-recursive-plan/CRAWLER_RELIABILITY_RECURSIVE_PLAN.md`
- `docs/sessions/2026-05-29-crawler-reliability-recursive-plan/CONTINUATION_PROMPT.md`

## Source Of Truth

Treat the 2026-05-29 crawler reliability session, LT-001 notes, the 2026-05-26
graph-feedback next-days plan, crawler docs, current code, and saved local
artifacts as source of truth. Do not move crawler work into `jsgui3-ecosystem`.

Ownership boundaries:
- `copilot-dl-news`: operator workflow, CLI harnesses, local proofs, packet scorecards, docs/session state.
- `news-crawler-backend-core`: reusable crawler runtime behavior after proof.
- `news-crawler-db`: schema, persistence, DB-owned evidence APIs.
- `news-db-analysis`: graph and analysis read models.

## Execution State

```json
{
  "track": "news-crawler-reliability",
  "phase": "terminal-wait-responsiveness-live-validation",
  "active_node": "resolve_better_sqlite3_env_and_run_terminal_wait_proof",
  "completed_nodes": [
    "...prior nodes through classify_terminal_wait_incomplete_warning...",
    "run_checks",
    "update_docs_and_next_prompt",
    "improve_job_endpoint_poll_responsiveness_after_terminal_wait",
    "add_terminal_wait_job_poll_timeout_flag",
    "add_three_state_terminal_wait_classifier",
    "add_terminal_wait_subtaxonomy_packet",
    "run_terminal_wait_responsiveness_focused_tests",
    "update_docs_and_next_prompt_2",
    "remove_reconstruct_state_language_from_continuation_prompt"
  ],
  "pending_nodes": [
    "resolve_better_sqlite3_env_and_run_terminal_wait_proof",
    "inspect_concurrent_launch_econnreset_under_batch_concurrency",
    "inspect_basic_article_crawl_parallel_local_runner_scheduling",
    "inspect_accepted_job_no_db_rows_for_127_0_0_2",
    "add_packet_cadence_compare_for_small_medium",
    "rerun_small_fixture_cadence",
    "add_dashboard_packet_comparison_card",
    "decide_fresh_internet_small_target_policy",
    "gate_internet_medium_on_sequential_and_explicit_approval",
    "promote_proven_runtime_changes_to_owner_repos_if_needed",
    "update_docs_and_next_prompt"
  ]
}
```
(The committed `CONTINUATION_PROMPT.md` holds the full ordered `completed_nodes` list.)

## Current Facts

- `tools/crawl/run.js` exposes `--watch-terminal-job-poll-timeout <ms>` (default
  5000, clamped 1500-5000) that raises the per-poll `/jobs/:jobId` budget ONLY
  during the terminal-wait phase, preventing the in-process CPU-bound crawl from
  starving the cheap job route. `terminalWait` records `jobPolls`,
  `jobPollErrors`, `endpointResponded`, `jobPollTimeoutMs`. Exported pure function
  `classifyTerminalWaitOutcome` returns exactly `terminal` / `timed-out` /
  `endpoint-unavailable`.
- `tools/crawl/lib/crawl-packet.js` serializes the four new terminalWait fields and
  emits sub-taxonomy `job-terminal-wait-timed-out` vs
  `job-terminal-wait-endpoint-unavailable` under the umbrella
  `job-terminal-wait-after-db-proof-incomplete`.
- `tools/crawl/lib/sequential-fixture-proof.js` plumbs the flag into per-step launch
  commands when `--wait-for-terminal` is set.
- Validated by `node --check` + 99 focused Jest tests across
  `tests/tools/crawl/run.test.js`, `crawl-packet.test.js`,
  `sequential-fixture-proof.test.js`. `git diff --check` clean on all six files.
- DONE last turn: removed the ambiguous/superfluous "reconstruct the current
  state" directive from `CONTINUATION_PROMPT.md` in three places (Recursive
  Operating Model, Full Recursive Prompt Contract, Required Workload item 1);
  Select-String scan confirms zero remaining "[Rr]econstruct" hits.
- BLOCKER (environment, not code): two fresh live sequential medium loopback
  proofs (tokens medium-tw-fixed-20260530-1528, medium-tw-fixed2-20260530-1530)
  crashed exit 1 with `news-crawler-db/.../better_sqlite3.node is not a valid
  Win32 application`. The binary loads via direct `require` under terminal node
  (v25.2.1 x64, execPath C:\nvm4w\nodejs\node.exe) but the spawned unified-app
  crawl process rejects it. copilot-dl-news has NO local better-sqlite3, so
  resolution climbs to the sibling news-crawler-db build. Both spawns use
  `process.execPath`. NOT rebuilt/reinstalled (install/build mutation requires
  explicit approval).
- Prior baseline `tmp/medium-sequential-terminal-wait-fixed-packet.json` scored
  26/28 `ready-for-medium-local`, DB delta 3 URLs/9 responses/3 content rows, all
  3 hosts covered.
- Concurrent medium remains blocked at 20/28; do NOT rerun. Reuters internet-target
  proof remains blocked. Remote contact + all remote mutation disallowed.

## Goal

Unblock and validate the terminal-wait job-poll responsiveness fix on the proven
sequential medium local rung. The longer per-poll budget and three-state
classifier are implemented and unit-proven; resolve the `better-sqlite3`
native-module environment regression that blocks live spawned crawls, then run a
fresh `--wait-for-terminal` sequential medium proof confirming terminalWait outcome
is now `terminal` (or precisely classified) with
`jobPolls`/`jobPollErrors`/`endpointResponded` populated, preserving the
DB-proof-first ladder.

## Required Workload

1. Confirm the six touched files still carry the terminal-wait responsiveness
   changes via a targeted `git status`/`git diff`: `tools/crawl/run.js`,
   `tools/crawl/lib/crawl-packet.js`, `tools/crawl/lib/sequential-fixture-proof.js`,
   `tests/tools/crawl/run.test.js`, `tests/tools/crawl/crawl-packet.test.js`,
   `tests/tools/crawl/sequential-fixture-proof.test.js`.
2. Diagnose the `better-sqlite3` blocker precisely: check whether
   `copilot-dl-news/node_modules/better-sqlite3` exists, capture
   `process.version`/`process.arch` of terminal vs spawned node, reproduce
   spawned-process failure vs direct-`require` success, and decide whether the fix
   is a local install/rebuild in copilot-dl-news or rebuilding the sibling
   news-crawler-db binary.
3. Ask the user exactly one blocking question to approve the required
   install/rebuild (`npm install better-sqlite3` / `npm rebuild better-sqlite3` in
   copilot-dl-news, or `npm rebuild` in news-crawler-db). Do not run without approval.
4. Once the module loads in a spawned process, run a fresh tokenized sequential
   medium loopback proof with `--wait-for-terminal --terminal-wait-timeout 15`.
5. Verify: terminalWait outcome `terminal` or precisely-classified
   `timed-out`/`endpoint-unavailable` with `jobPolls`/`jobPollErrors`/
   `endpointResponded`/`jobPollTimeoutMs` populated; packet scores
   `ready-for-medium-local` (target 26/28), DB delta 3 URLs/9 responses/3 content
   rows across all three hosts.
6. Confirm correct taxonomy and compare the new packet vs baseline via
   `crawl-packet.js compare`.
7. Refresh no-contact checks: policy, local-smoke plan, small/medium fixture plans,
   packets, dry-runs, file-only comparison, cadence, packet comparison.
8. If env blocker is unresolved (approval withheld / rebuild fails), document it as
   a hard blocker and advance to the next backlog node rather than stalling.
9. Do NOT rerun concurrent medium live (20/28). Do NOT run internet-target live
   crawls without explicit approval. Keep remote contact + mutation disallowed.
10. Investigate the next backlog node
    (`inspect_concurrent_launch_econnreset_under_batch_concurrency` or
    `inspect_accepted_job_no_db_rows_for_127_0_0_2`) only after the proof is
    resolved or formally blocked.
11. Update `tools/crawl/AGENT.md`, `docs/cli/crawl.md`, `docs/RUNBOOK.md`,
    `PLAN.md`, `WORKING_NOTES.md`, `CRAWLER_RELIABILITY_RECURSIVE_PLAN.md`, and
    this continuation prompt.
12. Run syntax checks, focused Jest, cleanup checks, whitespace scan, targeted
    `git diff --check`.
13. Emit the next full recursive continuation prompt in chat as a visible, copyable
    Markdown block; also save it to `CONTINUATION_PROMPT.md`.

## Safety Constraints

- Avoid network-dependent checks unless explicitly approved.
- Do not contact remote services unless explicitly approved for read-only contact.
- Do not deploy/force-deploy/prune/drain/clear/seed/start remote crawls or run
  queue maintenance unless explicitly approved for that mutation class.
- `npm install`/`npm rebuild`/`Stop-Process` all require explicit user approval.
- Prefer local fixture servers and bounded local crawls. Keep caps tight, artifacts
  bounded, cleanup explicit. Do not hide real failures. Never revert unrelated changes.

## Verification

- Syntax checks for touched JS files.
- Focused Jest for touched crawler files via `npm run test:by-path`.
- No-contact policy/plan/packet/dry-run/comparison smokes.
- Bounded sequential medium loopback proof via
  `sequential-fixture-proof.js execute --wait-for-terminal` once env is unblocked.
- Process cleanup check for fixture/`run.js`/local UI/`crawl-batch` processes.
- Targeted whitespace scan + `git diff --check -- <touched files>`.

## Final Response Required

Return: (1) concise summary; (2) verification results + artifacts; (3) reliability
scorecard (policy, preflight, launch, watch, DB proof, artifacts, comparison,
safety, operator clarity); (4) next full recursive continuation prompt displayed
directly in chat with active/completed/pending nodes + 10-16 workload items;
(5) last 5 turns as dense single-line state items; (6) up to 10 backlog items from
`PLAN.md`; (7) horizon estimate.
