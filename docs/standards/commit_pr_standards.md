---
status: canonical
source: AGENTS.md
last_migrated: 2025-11-04
owner: engineering
---

# Commit & PR Standards

- Use conventional-style prefixes when possible (e.g., `docs:`, `feat:`, `fix:`).
- Summaries should be action-oriented and reference key files or modules.
- Include a brief testing note or verification plan in PR descriptions.

## PR creation (agent-friendly)

`git` can push branches, but a Pull Request is created on the GitHub server. Agents should use the compare-link helper to avoid stalls.

- Print the PR compare link: `npm run pr:link`
- If the branch has no upstream, run: `git push -u origin HEAD`

This keeps git usage seamless even when GitHub CLI (`gh`) is unavailable or unauthenticated.
