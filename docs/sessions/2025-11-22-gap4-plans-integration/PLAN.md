# Plan: Gap 4 Plans Integration

Objective: Enable `js-edit` to save and resume editing workflows safely using Guarded Plans.

Done when:
- `js-edit --emit-plan <file>` saves the calculated batch (edits + guards) to JSON.
- `js-edit --from-plan <file>` loads the batch, verifies file hashes/content match the guards, and applies the edits.
- Guard failures (file changed since plan creation) abort the process with a helpful error.
- `npm run test:by-path tests/tools/js-edit-plans.test.js` passes (new test suite).

Change set:
- `tools/dev/js-edit.js`: CLI wiring for `--emit-plan` and `--from-plan`.
- `tools/dev/js-edit/BatchDryRunner.js`: Logic to generate guards (hash/snapshot) and verify them.
- `tools/dev/js-edit/PlanCodec.js`: (New?) Utilities for reading/writing the plan schema.
- `tests/tools/js-edit-plans.test.js`: New test suite.

Risks/assumptions:
- Plan schema must be robust enough for multi-file batches.
- Hashing algorithm should be fast but reliable (likely SHA-256 or similar on file content).
- Line number shifts in the target file *between* plan creation and application are fatal (guards should catch this).

## Detailed Implementation Steps

1.  **Discovery & Schema Design**:
    - Analyze `BatchDryRunner` to see how it currently holds edits.
    - Define the JSON schema for a Plan (version, ops, guards).

2.  **Plan Generation (`--emit-plan`)**:
    - In `js-edit.js`, after calculating the batch (but before or during execution), serialize the batch to the Plan format.
    - Calculate hashes for all target files.

3.  **Plan Execution (`--from-plan`)**:
    - In `js-edit.js`, add a branch to load the JSON.
    - Rehydrate the batch object.
    - **Crucial**: Run a verification step. For each file in the plan, check if current disk content matches the guard hash.
    - If valid, proceed to `runner.apply()`.

4.  **Testing**:
    - Create a test that:
        1.  Generates a plan.
        2.  Modifies the target file (sabotage).
        3.  Tries to run the plan -> Expect Error.
        4.  Reverts target file.
        5.  Tries to run the plan -> Expect Success.

5.  **Documentation**:
    - Update `tools/dev/README.md` with the new flags.
