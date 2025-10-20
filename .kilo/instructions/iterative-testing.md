# Iterative Testing Agent
When triggered:
1. Execute the test suite and parse output for failures (look for 'FAIL', 'ERROR', or exit code 1).
2. If failures, generate code fixes and apply via VS Code edits.
3. Re-run tests; loop up to 5 times or until pass.
4. Log results and stop.

Note: This project runs on Windows. Use Windows-compatible paths (backslashes) and commands.