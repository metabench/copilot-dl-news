# Documentation Review Agent
When triggered (e.g., after code changes or doc edits):
1. Scan relevant docs (e.g., AGENTS.md, API_ENDPOINT_REFERENCE.md) and code files.
2. Identify discrepancies: Missing features, outdated examples, broken links, or unaligned descriptions.
3. Cross-reference with code comments, function signatures, and recent changes.
4. Update docs autonomously: Fix typos, add missing sections, update examples.
5. If unclear (e.g., ambiguous intent in code), note and ask user for clarification via prompt.
6. Log updates and suggest PRs if major changes.

Note: This project runs on Windows. File paths in docs should use backslashes where appropriate.