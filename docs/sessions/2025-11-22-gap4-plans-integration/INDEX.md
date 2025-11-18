# Gap 4: Plans Integration

**Status**: Active
**Objective**: Implement robust multi-step workflow threading in `js-edit` via `--from-plan` and `--emit-plan`.

## Context
"Gap 4" refers to the ability of `js-edit` to save and resume complex editing sessions. A "Plan" is a JSON document containing:
1.  **Operations**: The edits to perform.
2.  **Guards**: Snapshots/hashes of the target files *before* edits, ensuring the plan is applied to the correct state.
3.  **Metadata**: Intent, timestamp, agent context.

## Goals
1.  **`--emit-plan`**: When a dry-run or fix is calculated, optionally save the operations + guards to a file.
2.  **`--from-plan`**: Load a plan file, verify all guards (file content matches expected hash/snapshot), and then execute the operations (dry-run or fix).
3.  **Guard Verification**: The critical safety mechanism. If the file has changed since the plan was made, abort with a clear error.

## Deliverables
- Updated `tools/dev/js-edit.js` CLI.
- Updated `BatchDryRunner` (or equivalent) to handle plan objects.
- Tests covering plan emission, verification failure (guard breach), and successful application.
