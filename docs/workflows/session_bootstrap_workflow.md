---
type: workflow
id: session-bootstrap-workflow
status: canonical
audience: agents
tags:
   - sessions
   - docs
   - process
last-reviewed: 2026-02-12
---

# Session Bootstrap Workflow

_Audience_: Any agent starting a new chunk of work (analysis, implementation, validation).

## Why this exists
Every task in this repo must live inside a session folder so other agents inherit context. This workflow condenses the AGENTS.md + Singularity Engineer guidance into a repeatable checklist you can run before touching source files.

## When to run it
- Kicking off new feature/fix research
- Spinning up validation-only or documentation-only sessions
- Handing off context between agents or personas

## Prerequisites
- Repository cloned with write access
- Awareness of the task or ticket you are about to tackle
- `node` available for running helper scripts (md-scan)

## Step-by-step

1. **Name the session**
   - Format: `docs/sessions/<yyyy-mm-dd>-<slug>/`
   - Slug should hint at scope (e.g., `binding-plugin-stabilization`).

2. **Create the folder skeleton**
   - Required files:
     - `PLAN.md`
     - `WORKING_NOTES.md`
     - `SESSION_SUMMARY.md`
     - `FOLLOW_UPS.md` (optional but recommended if you expect open items)
   - Minimal template:
     ```markdown
     # Plan: <slug>
     Objective: <one sentence>
     Done when:
     - ...
     Change set: <paths>
     Risks/assumptions: <list>
     Tests/Docs: <plan>
     ```

    - Fast path (recommended):
       ```bash
       node tools/dev/session-init.js <slug>
       ```
       This creates the session folder and standard files, and prints the next steps.

3. **Log discovery inputs**
   - Before coding, sweep prior art:
     ```bash
     node tools/dev/md-scan.js --dir docs/sessions --search <topic> --json
     ```
   - Paste noteworthy hits into `WORKING_NOTES.md`.

4. **Wire the docs hub**
   - Append an entry to `docs/sessions/SESSIONS_HUB.md` describing the new session (duration, focus, quick links).

   - If you're not sure what belongs in sessions, read:
     [docs/sessions/AGENT.md](../sessions/AGENT.md)

5. **Track commands + decisions**
   - Use the `WORKING_NOTES.md` sections (`Discovery`, `Command Log`, `Decisions`) to capture:
     - CLI invocations (`js-scan`, `js-edit`, `npm run test:by-path ...`)
     - Links to diffs or blockers
     - Ideas or observations for future agents

6. **Keep memory layers in sync**
   - Short-term: Current session folder
   - Medium-term: Recent sessions with similar scope (reference them instead of rewriting)
   - Long-term: Archive entries once the work ships

7. **Close the loop**
   - Update `SESSION_SUMMARY.md` with highlights, outcomes, and next steps
   - File follow-ups (issues, TODOs, backlog items) either in `FOLLOW_UPS.md` or the relevant docs/INDEX entry
   - Mention the session in your PR/summary so reviewers can trace context

## Tips
- If multiple agents collaborate, share the same session folder (different sub-sections per person) rather than duplicating work.
- When blocked on missing guidance, add a short "Docs gap" note inside the WORKING_NOTES and propose the doc in FOLLOW_UPS.
- Keep timestamps when possible; they help reconstruct timelines for incident reviews.

## Outputs (done when)
- `docs/sessions/<yyyy-mm-dd>-<slug>/` exists
- `PLAN.md` describes objective, done-when, risks, tests/docs
- `WORKING_NOTES.md` contains discovery + command log
- `docs/sessions/SESSIONS_HUB.md` links to the new session

