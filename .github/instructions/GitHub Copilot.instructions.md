---
description: "Directive set for GitHub Copilot when paired with GPT-5 Codex models"
applyTo: "**"
---

## GitHub Copilot — GPT-5 Codex pointer

Authoritative instructions now live in [AGENTS.md](../../AGENTS.md). Use this file as a thin reminder:

- Read AGENTS.md first for session requirements, operational guardrails (Windows/PowerShell, no Python, server `--check`, linked modules), and doc topology.
- Follow AGENTS.md quick anchors: jsgui3 controls with emoji actions and lean control counts; run `node tools/dev/svg-collisions.js <file> --strict` before shipping SVGs; prefer `js-scan` for discovery and `js-edit` for guarded batch edits.
- Keep documentation changes small: update AGENTS.md for navigation pointers; push deep detail into the relevant doc under `docs/`.
- If you notice drift between this file and AGENTS.md, fix AGENTS.md first and keep this pointer minimal.

Tool details: see [tools/dev/README.md](../../tools/dev/README.md) and the linked guides in AGENTS.md.
**Never skip validation.** The tool is your eyes.

