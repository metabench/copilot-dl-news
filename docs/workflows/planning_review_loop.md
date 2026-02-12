---
type: workflow
id: planning-review-loop
status: canonical
source: AGENTS.md
last_migrated: 2025-11-04
owner: docs-indexer
audience: agents
tags:
	- planning
	- process
	- workflow
last-reviewed: 2026-02-12
---

# Planning & Review Loop

This workflow governs how agents plan work, execute tasks, and validate results without pausing mid-plan.

## Core Workflow Rules

- Once a task list exists, execute items sequentially without seeking intermediate approval.
- When a step blocks, attempt remediation; if unresolved, document the blocker and pivot immediately to the next actionable task.
- Provide summaries only when every task is complete or all remaining items are explicitly blocked.

## Careful Refactor Engagements

1. **Deep Discovery** – Read the topic index, relevant docs, and `.github/agents/Careful Refactor.agent.md` before coding.
2. **Planning** – Enumerate every task for the refactor in a single phase; track sub-phases internally (discovery → plan → implementation → validation).
3. **Implementation** – Route all database access through adapters; expand or author adapters rather than embedding SQL.
4. **Validation** – Run the appropriate test suites and record outcomes alongside any blockers.

## Continuous Execution Mandate

- Maintain context of the active sub-phase in the living tracker.
- If tooling fails, attempt fixes before escalating; only raise blockers when remediation is exhausted.
- Avoid analysis paralysis: once you have read the key docs, move directly to execution.

## js-edit Integration Checklist

- **Discovery (α):** Run `node tools/dev/js-edit.js --list-functions --json` and `--list-variables --json` for each target file, then capture guard metadata with `--scan-targets --scan-target-kind function|variable --json`. Attach emitted plan/digest paths to the tracker.
- **Planning (β):** Use `--context-function` / `--context-variable` with `--emit-plan tmp/<task>.plan.json` so spans, hashes, and padding are recorded before edits. Note required guard expectations (hash/span counts) inside the change plan.
- **Implementation (γ):** Apply replacements via `--replace` or `--extract` using `--expect-hash`/`--expect-span` and enable `--emit-digests --emit-digest-dir tmp/js-edit-digests` when mutating. Prefer batch plans (`--plan <file> --fix`) for multi-file updates and record any `--allow-multiple` usage.
- **Validation (δ):** Re-run the discovery commands to confirm selector counts match expectations, then execute the scoped Jest suite. Archive digest snapshots or plan files referenced in the summary for peer review.
- When js-edit fails to cover a construct, log the limitation (command + error) in both the tracker and `docs/CHANGE_PLAN.md`, propose a follow-up enhancement, and only bypass js-edit after documenting the fallback.

## Documentation Duties

- Add newly discovered patterns to canonical docs rather than the hub.
- Keep `AGENTS.md` as a routing surface; surface deep instructions here only in summarized form with links to full docs.
