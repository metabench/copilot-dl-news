Batch Operation Improvements — js-edit/js-scan

Overview

This document collects ideas and concrete proposals to improve batch operation processing for `js-edit` and `js-scan`. Many of the improvements focus on making multi-file edits and copy operations safer, reproducible, easier to reason about for AI agents, and easier to audit.

Key goals

- Safety: avoid data loss; fail fast with useful diagnostics.
- Reproducibility: build deterministic plans with guard verification and stable hashes.
- Actionability: enable AI agents to reason about cross-file changes and produce reviewable plans.
- Scalability: support large codebases with incremental, batched, and parallel-safe operations.

Proposals (High-level)

1. Enhanced Plan Format
- Add `version` and `metadata` fields to plan files. Include the tool version, repository path, user, timestamp.
- Enrich plan `changes` with `type` (replace|insert|delete|copy|move), `context` (source file + selector details), and `guards` (sha256 hash or fallback digest & path signature) so verification is unambiguous.
- Optionally support `group`/`id` tags so multiple changes can be associated with a single logical step.

2. Multi-file Dependency-aware Batching
- When building a batch, trace imports/exports using `js-scan` and include a `dependsOn` list so the executor can ensure a safe order (e.g., update callee files before callers when moving a function).
- Support `dependencyDepth` and `followImports` options so agents can control scope.

3. Dry-run & Emulated Execution
- Simulate `apply` across all files and produce a preview with unified diffs and `guard` statuses without writing any file.
- Add `--dry-run --batch` to produce a single `plan.json` capturing the changes and an `audit/` directory with the diffs.

4. Guard Verification & Strategy
- Expand guards to include: pre-hash, path-signature, normalized span, and optionally AST canonicalization checks (e.g., ensure identifier renames do not conflict).
- Support multiple guard verification modes: `strict` (all checks pass), `lenient` (warn), `force` (bypass if user requests).
- Optionally compute `pre` & `post` AST checksums for each affected function/variable to detect structural drift.

5. Heuristics to Detect Duplication & Insertion Conflicts
- When adding a function that already exists, detect duplicates and optionally offer alternatives: skip, rename, or merge.
- For `copy` operations, if TS type annotations conflict with target file or the exported name, warn and then produce suggested changes (e.g., drop type annotations, adjust imports).

6. Transactional Application with Rollback
- Implement an atomic plan application that writes a backup of each changed file into a temporary folder before applying; if an error occurs, revert files by restoring from the backup.
- Offer `--dry-run`/`--apply` and a `--rollback` command to revert after a plan is partially applied.

7. Plan Signature and Approval Workflow
- Add `plan.hash` (cryptographic digest) to the plan file to sign the plan; allow `js-edit --from-plan` to verify signatures or require manual approval via `--approve-plan`.
- Integrate with `--emit-plan` to create an audit trail and plan review step.

8. Batch Operation Logging & Audit
- Add `logs/` per plan with granular entries of decision points and conflicts.
- Support `--verbose` and `--json` to produce machine-readable logs and attach them to the plan for review by agents.

9. Batch Retry & Deadlock Avoidance
- When applying in parallel across multiple files, implement a lock/ordering mechanism to avoid simultaneously editing the same file from different agents.
- Provide a `retryPolicy` (backoff and max attempts) for transient file system errors.

10. Integration with `js-scan`: discover-based batching
- Add `--copy-batch` to `js-edit` which accepts a JSON array of copy operations referencing selectors or `file:selector` pairs; `js-scan` can produce these candidate lists via `--what-imports` + `--what-calls` to help build the batch input.
- Provide `--plan-from-scan` to generate a starting plan from discovered relationships.

Concrete Additions (Implementation list)

- [ ] Add structured Plan schema with `version, toolVersion, createdBy, changes[]` (change type + guards + metadata).
- [ ] Enhance `BatchDryRunner` to: load plan file, verify guards, run AST-level conflict checks, apply changes with backups.
- [ ] Add `transactionLog` and `archive` for rollbacks and auditing.
- [ ] Implement `--copy-batch` and add `target-scan` tool to create batch plans from `js-scan` results.
- [x] Prototype `--copy-batch` plan loader that converts `copy` ops to insertion changes for `BatchDryRunner` (dry-run & apply). See `tools/dev/js-edit.js`.
	- Note: the prototype uses per-file `BatchDryRunner` instances so each target file is processed with its own source context. This avoids cross-file preview conflicts and produces file-scoped plan previews.
- [ ] Extend `mutationOperations.copyFunction` to support deep integration with plan & guard verification.
- [ ] Add unit tests that confirm atomicity, guard verification, and rollback behavior.

Testing & QA

- Unit tests for: plan creation (format), guard verification (matching & mismatching), `dryRun` previews, and `apply` with forced failure to confirm rollback.
- Integration tests for: `--copy-batch` across small repo fixtures with TS and JS to confirm correct ordering.
- Performance tests for large plans with many files (>1000) to identify bottlenecks and memory usage.

Usage examples (CLI)

```bash
# Create a plan interactively based on discovered functions
node tools/dev/js-scan.js --what-imports src/foo.js --json > importers.json
# Build a copy plan (tooling to produce this will be added)
node tools/dev/js-edit.js --file target.js --copy-batch plan.json --dry-run
# Verify plan and then apply
node tools/dev/js-edit.js --from-plan plan.json --fix
# Generate audit logs/preview
node tools/dev/js-edit.js --from-plan plan.json --dry-run --json > audit.json
```

Security and operational considerations

- Plan files may contain sensitive paths; ensure plan files have proper file permissions.
- If agents are executing `--fix` in automated environments, require an allowlist or RBAC check for risky operations.

Next steps

1. Implement structured plan schema and extend `BatchDryRunner`.
2. Add `--copy-batch` CLI option + `js-scan` support to generate candidate selectors.
3. Create tests & session notes for rollout.

---

Session summary: A new `BATCH_IMPROVEMENTS.md` was created to capture improvements. I can implement these incrementally; tell me which proposals you'd like prioritized and I'll add tests and plan application changes next.