# Working Notes: UI Screenshot Feedback Methodology

## 2026-05-04 Kickoff

User request: write methodology docs, AI instructions, workflows, and skills so UI apps automatically get screenshot-taking capabilities, using Electron where suitable or Puppeteer otherwise; build efficient custom screenshot rigging; plan operational user journeys; save screenshots where the user can view them in the control centre; and preserve comments so later agents can use them to make improvements.

Discovery:
- Existing workflow: `docs/workflows/ui-inspection-workflow.md` covers Playwright/MCP and Puppeteer inspection but not a full feedback loop with comments.
- Existing guides: `docs/guides/PUPPETEER_UI_WORKFLOW.md` and `docs/guides/PUPPETEER_SCENARIO_SUITES.md` cover browser capture and scenario suites.
- Existing skills: `docs/agi/skills/autonomous-ui-inspection` and `docs/agi/skills/puppeteer-efficient-ui-verification` provide the inspection and efficient-run primitives.
- Existing control-centre/comment foundation: `docs/design/agent_interaction_platform.md` defines SVG `agent-comment` groups and `.agent/pending_comments.md` is referenced in `AGENTS.md`.

Implementation notes:
- The new guidance should not replace existing inspection docs; it should sit above them as the product feedback loop and link down to those primitives.

## 2026-05-04 Evidence

Created:
- `docs/guides/UI_SCREENSHOT_FEEDBACK_METHODOLOGY.md`
- `docs/workflows/ui-screenshot-feedback-loop.md`
- `.github/instructions/UI Screenshot Feedback.instructions.md`
- `.github/skills/ui-screenshot-feedback/SKILL.md`
- `docs/agi/skills/ui-screenshot-feedback/SKILL.md`

Updated:
- `docs/INDEX.md`
- `docs/agi/SKILLS.md`
- `docs/workflows/ui-inspection-workflow.md`
- `docs/guides/PUPPETEER_UI_WORKFLOW.md`
- `docs/sessions/SESSIONS_HUB.md`

Validation:
- VS Code diagnostics reported no errors for the new methodology, workflow, instruction, skills, index updates, and session docs.
- `grep` verified `docs/INDEX.md` includes both `UI Screenshot Feedback Loop` and `UI Screenshot Feedback Methodology`.
- `grep` verified `docs/agi/SKILLS.md` registers `ui-screenshot-feedback`.
- `grep` verified the existing UI inspection and Puppeteer workflow docs link to the new feedback loop.
- `git diff --check -- <focused docs/customization paths>` produced no output, indicating no whitespace errors.