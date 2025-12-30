# Authorization Workflows — Local Case Study Note

This session included a good real-world example of a high-quality authorization workflow:

- GitHub CLI-style device-code login:
  - CLI prints a URL + a short one-time code.
  - User authorizes in browser on provider domain.
  - CLI completes login without any token copy/paste.

Durable guide:
- See `docs/guides/AUTHORIZATION_WORKFLOWS_CASE_STUDY.md`

Session context:
- We needed PR creation via GitHub API (a PR is not a git object).
- `gh` was installed via `winget`, but `PATH` didn’t refresh in the current PowerShell session.
- Workaround: invoke `gh` by absolute path until a new terminal inherits updated `PATH`.
