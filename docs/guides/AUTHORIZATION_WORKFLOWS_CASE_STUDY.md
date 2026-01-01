# Authorization Workflows — Case Study + Patterns (CLI-first)

## Why this doc exists
Authorization UX is one of the highest-leverage parts of developer tooling:
- Done well: secure, low-friction, and works across headless automation.
- Done poorly: people paste tokens into terminals, leak secrets into logs, or abandon the tool.

This document captures:
1) A case study of a high-quality workflow we used in this repo (GitHub CLI device-code style login).
2) Other high-quality (and sometimes simpler) authorization workflows you can apply in CLI tools.

Scope: **authorization UX and operational patterns** (not cryptographic protocol design).

---

## Case study: GitHub CLI-style device-code login (excellent UX)

### What happened (real-world narrative)
We needed to create a GitHub Pull Request from the terminal.
- Plain `git` can push branches, but a Pull Request is a **GitHub server object**, so it requires GitHub API access.
- `gh` (GitHub CLI) wasn’t installed initially.
- We installed it via `winget`.
- After install, `gh` existed on disk but wasn’t on the current shell’s `PATH` yet.
- We invoked it by absolute path and used an auth flow that does **not** require copying a token.

This highlights two product-quality details:
- The auth flow is safe and easy.
- The tool behaves predictably in “real Windows shells” where `PATH` refresh can lag.

### Why the device-code flow is so good
Device-code auth is great when the user:
- Is in a terminal, possibly on a machine without a convenient browser.
- Should not paste tokens into terminals.
- Needs a short, auditable step that can be safely completed without exposing secrets.

Key properties:
- The CLI never asks for your password.
- The CLI never needs you to paste a long token.
- The only thing you copy is a **short one-time code**.
- Authorization happens on the identity provider’s domain (phishing-resistant compared to “paste your token here”).

### Step-by-step (what the user experiences)
A typical device-code flow looks like this:

1) CLI starts login and requests a device code from the provider.
2) CLI prints:
   - a URL to open (e.g. `https://github.com/login/device`)
   - a short one-time code (e.g. `ABCD-EFGH`)
3) User opens the URL on any device (same machine or different).
4) User enters the code, confirms scopes, and approves.
5) CLI polls for completion and stores a token locally (credential store preferred).

### What makes it “best-in-class” (UX criteria)
Use these criteria to evaluate other auth flows:

- **Secretless UX**: user never handles long-lived secrets.
- **Short & clear**: 1 URL + 1 code; minimal branching.
- **Works without browser automation**: user can use any browser/device.
- **Safe by default**: stores tokens in OS credential store if possible.
- **Automation escape hatch**: supports non-interactive auth for CI via env vars.
- **Revocability**: tokens can be revoked centrally; CLI can refresh / re-login.

### Operational notes we hit on Windows
These are normal “production” realities worth designing for:

- **PATH refresh lag**: after installing a CLI, the current PowerShell session may not see it.
  - Good tools document where the binary lives.
  - Good operator workaround: call it by absolute path, or open a new terminal.

- **Non-interactive installers**: `winget` can be cancelled or hang on prompts.
  - Prefer `--silent --disable-interactivity` for scripted installs.

---

## Pattern catalog: high-quality auth workflows (CLI + services)

This section is a menu: choose the simplest workflow that meets your security and automation needs.

### 1) Device-code OAuth (interactive; recommended)
Best for:
- CLIs used by humans.
- Environments where you don’t want token copy/paste.

Pros:
- Strong UX and low secret leakage risk.
- Works even when the browser is on another device.

Cons:
- Requires provider support.
- Requires some polling / state management.

Design tips:
- Print URL + code clearly.
- Offer `--copy`/`--clipboard` flags.
- Use a clear timeout and retry strategy.

### 2) Browser-based OAuth (interactive; simplest to implement)
Best for:
- Tools that can reliably open a browser.

Pros:
- Familiar UX.

Cons:
- Can be awkward on headless machines/SSH sessions.

Design tips:
- Always provide a fallback path (print URL) if browser open fails.

### 3) Token via environment variable (headless; recommended for CI)
Best for:
- CI, containers, scripted automation.

Pros:
- Works without any prompts.
- Easy to rotate and inject securely in CI secret stores.

Cons:
- Environment variables can leak in logs if handled badly.

Design tips:
- Prefer a single well-known env var (e.g. `GH_TOKEN`, `GITHUB_TOKEN`).
- Never echo token values.
- Validate scopes and fail with a helpful error.

### 4) Token via stdin (`--with-token` / `--token-stdin`) (headless; safer than args)
Best for:
- Headless automation when env vars are not preferred.

Pros:
- Avoids passing secrets on the command line (which can show up in process lists / history).

Cons:
- Still a secret-handling workflow.

Design tips:
- Only read from stdin when explicitly requested.
- Provide clear “token not read / empty” errors.

### 5) API key in config file (simple; acceptable in limited scenarios)
Best for:
- Local-only tools with strong filesystem protections.

Pros:
- Easy to understand.

Cons:
- Risky if configs get committed.

Design tips:
- Default config paths to user home.
- Provide warnings if config is inside a git repo.
- Support `.gitignore` hints.

### 6) OS credential store integration (best practice; implementation detail)
This is not an auth flow by itself; it’s how you *store* credentials.

Best for:
- Any CLI that stores long-lived refresh tokens.

Pros:
- Better than plaintext token files.

Cons:
- Platform-specific complexity.

Design tips:
- Prefer credential store; fall back to file only when necessary.

### 7) SSH keys (git auth; not API auth)
Important distinction:
- SSH keys authenticate **git operations**.
- They do not automatically grant access to service APIs (e.g. creating a PR via REST).

Use when:
- You need git clone/fetch/push securely.

---

## A simple decision guide (pick the right workflow)

Pick in this order:
1) If a human is running the CLI: **device-code OAuth**.
2) If it’s CI/headless: **env var token**.
3) If env vars are disallowed: **stdin token**.
4) If none of the above: browser OAuth (but keep a fallback).

---

## Security checklist (do/don’t)

Do:
- Keep secrets out of command-line args and logs.
- Make interactive auth “secretless” when possible.
- Store tokens in credential stores.
- Provide a clear `logout`/`revoke` path.

Don’t:
- Ask users to paste tokens unless there is no better option.
- Print tokens to the terminal.
- Log request headers that might contain credentials.

---

## This repo: where we recorded evidence
- Session notes: `docs/sessions/2025-12-30-single-ui-cohesion-next/WORKING_NOTES.md`
- Context: PR creation required GitHub API access (beyond what `git` provides).
